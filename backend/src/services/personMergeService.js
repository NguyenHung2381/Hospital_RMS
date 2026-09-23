const { getPool, sql } = require('../config/db');
const { paging } = require('../utils/paging');
const { broadcast } = require('./eventService');
const personService = require('./personService');

/**
 * Duyệt gộp danh tính (FR-C02): hàng đợi person_merge_candidates → gộp / bỏ qua / mở lại.
 *
 * GỘP = chuyển toàn bộ person_id của 6 bảng nguồn từ hồ sơ BỊ GỘP sang hồ sơ GIỮ LẠI, đánh dấu hồ sơ
 * bị gộp status = 'MERGED' (+ merged_into_id), ghi person_merge_log (đủ để hoàn tác thủ công).
 * Không xóa dòng nào. Chạy trong 1 transaction, giữ cùng khóa `person_sync` với dual-write nên không
 * chạy đồng thời với việc tạo/gắn person.
 */

const httpErr = (statusCode, message) => Object.assign(new Error(message), { statusCode });

const STATUSES = ['PENDING', 'MERGED', 'REJECTED'];
const REASONS = ['SAME_NAME_DOB', 'SAME_NAME', 'SAME_PHONE', 'SAME_EMAIL', 'SAME_STAFF_NUMBER'];

// Trường được chọn giá trị khi gộp: 'keep' = giữ giá trị của hồ sơ giữ lại, 'lose' = lấy của hồ sơ bị gộp.
const MERGE_FIELDS = ['full_name', 'date_of_birth', 'gender', 'national_id', 'email', 'phone', 'is_internal'];

// 6 bảng nguồn mang person_id. seminar_participants có trigger bump updated_at với mọi UPDATE → giữ nguyên.
const SOURCE_TABLES = [
	{ table: 'users' },
	{ table: 'trainees' },
	{ table: 'lecturers' },
	{ table: 'external_reviewers' },
	{ table: 'topic_members' },
	{ table: 'seminar_participants', keepUpdatedAt: true },
];

const REF_COUNT_SQL = (alias) => `(
	  (SELECT COUNT(*) FROM dbo.users x WHERE x.person_id = ${alias}.id)
	+ (SELECT COUNT(*) FROM dbo.trainees x WHERE x.person_id = ${alias}.id)
	+ (SELECT COUNT(*) FROM dbo.lecturers x WHERE x.person_id = ${alias}.id)
	+ (SELECT COUNT(*) FROM dbo.external_reviewers x WHERE x.person_id = ${alias}.id)
	+ (SELECT COUNT(*) FROM dbo.topic_members x WHERE x.person_id = ${alias}.id)
	+ (SELECT COUNT(*) FROM dbo.seminar_participants x WHERE x.person_id = ${alias}.id))`;

const personCols = (alias, prefix) => `
	${alias}.id AS ${prefix}_id, ${alias}.full_name AS ${prefix}_full_name, ${alias}.date_of_birth AS ${prefix}_date_of_birth,
	${alias}.gender AS ${prefix}_gender, ${alias}.national_id AS ${prefix}_national_id, ${alias}.email AS ${prefix}_email,
	${alias}.phone AS ${prefix}_phone, ${alias}.is_internal AS ${prefix}_is_internal, ${alias}.is_verified AS ${prefix}_is_verified,
	${alias}.status AS ${prefix}_status, ${alias}.origin_table AS ${prefix}_origin_table, ${alias}.created_at AS ${prefix}_created_at,
	${REF_COUNT_SQL(alias)} AS ${prefix}_ref_count,
	CASE WHEN EXISTS (SELECT 1 FROM dbo.users ux WHERE ux.person_id = ${alias}.id) THEN 1 ELSE 0 END AS ${prefix}_has_account`;

// CCCD chỉ hiện đầy đủ cho người có quyền xem dữ liệu nhạy cảm
const maskId = (v, canSee) => (v && !canSee ? `••••••${String(v).slice(-4)}` : v);

const shapePerson = (r, prefix, canSee) => ({
	id: r[`${prefix}_id`],
	full_name: r[`${prefix}_full_name`],
	date_of_birth: r[`${prefix}_date_of_birth`],
	gender: r[`${prefix}_gender`],
	national_id: maskId(r[`${prefix}_national_id`], canSee),
	email: r[`${prefix}_email`],
	phone: r[`${prefix}_phone`],
	is_internal: r[`${prefix}_is_internal`],
	is_verified: !!r[`${prefix}_is_verified`],
	status: r[`${prefix}_status`],
	origin_table: r[`${prefix}_origin_table`],
	created_at: r[`${prefix}_created_at`],
	ref_count: r[`${prefix}_ref_count`],
	has_account: r[`${prefix}_has_account`] === 1,
});

const CAND_COLS = `
	c.id, c.reason, c.status, c.note, c.created_at, c.reviewed_by, c.reviewed_at,
	ru.full_name AS reviewed_by_name,
	${personCols('a', 'a')},
	${personCols('b', 'b')}`;
const CAND_FROM = `
	FROM dbo.person_merge_candidates c
	JOIN dbo.persons a ON a.id = c.person_a_id
	JOIN dbo.persons b ON b.id = c.person_b_id
	LEFT JOIN dbo.users ru ON ru.id = c.reviewed_by`;

const shapeCandidate = (r, canSee) => ({
	id: r.id,
	reason: r.reason,
	status: r.status,
	note: r.note,
	created_at: r.created_at,
	reviewed_at: r.reviewed_at,
	reviewed_by_name: r.reviewed_by_name,
	a: shapePerson(r, 'a', canSee),
	b: shapePerson(r, 'b', canSee),
});

// ─── Đọc ─────────────────────────────────────────────────────────────────────

const listCandidates = async ({ status = 'PENDING', reason, search, page, limit } = {}, canSee = false) => {
	if (!STATUSES.includes(status)) throw httpErr(400, 'Trạng thái không hợp lệ.');
	if (reason && !REASONS.includes(reason)) throw httpErr(400, 'Lý do không hợp lệ.');

	const pool = await getPool();
	const pg = paging(page, limit, 20);
	const where = ['c.status = @status'];
	const req = pool
		.request()
		.input('status', sql.VarChar(10), status)
		.input('offset', sql.Int, pg.offset)
		.input('limit', sql.Int, pg.limit);
	if (reason) {
		where.push('c.reason = @reason');
		req.input('reason', sql.VarChar(20), reason);
	}
	const kw = String(search || '').trim();
	if (kw) {
		where.push(`(a.full_name LIKE @kw OR b.full_name LIKE @kw OR a.email LIKE @kw OR b.email LIKE @kw
		             OR a.phone LIKE @kw OR b.phone LIKE @kw)`);
		req.input('kw', sql.NVarChar(200), `%${kw}%`);
	}
	const whereSql = `WHERE ${where.join(' AND ')}`;

	const r = await req.query(`
		SELECT ${CAND_COLS} ${CAND_FROM} ${whereSql}
		ORDER BY CASE c.reason WHEN 'SAME_NAME_DOB' THEN 0 WHEN 'SAME_STAFF_NUMBER' THEN 1 WHEN 'SAME_EMAIL' THEN 2
		                       WHEN 'SAME_PHONE' THEN 3 ELSE 4 END, c.created_at, c.id
		${pg.fetchClause};
		SELECT COUNT(*) AS total ${CAND_FROM} ${whereSql};`);
	return {
		data: r.recordsets[0].map((row) => shapeCandidate(row, canSee)),
		pagination: { page: pg.page, limit: pg.limit, total: r.recordsets[1][0].total },
	};
};

const getStats = async () => {
	const pool = await getPool();
	const r = await pool
		.request()
		.query(`SELECT status, reason, COUNT(*) AS n FROM dbo.person_merge_candidates GROUP BY status, reason`);
	const byStatus = { PENDING: 0, MERGED: 0, REJECTED: 0 };
	const pendingByReason = {};
	for (const row of r.recordset) {
		byStatus[row.status] = (byStatus[row.status] || 0) + row.n;
		if (row.status === 'PENDING') pendingByReason[row.reason] = row.n;
	}
	return { by_status: byStatus, pending_by_reason: pendingByReason };
};

const recordsOf = async (pool, personId) => {
	const r = await pool.request().input('pid', sql.VarChar(20), personId).query(`
		SELECT TOP (60) source, ref_id, label FROM (
			SELECT 'users' AS source, u.id AS ref_id, CONCAT(u.username, N' · ', ISNULL(d.name, N'chưa có khoa')) AS label
			FROM dbo.users u LEFT JOIN dbo.departments d ON d.id = u.department_id WHERE u.person_id = @pid
			UNION ALL
			SELECT 'trainees', t.id, ISNULL(tt.name, N'Học viên')
			FROM dbo.trainees t LEFT JOIN dbo.trainee_types tt ON tt.id = t.trainee_type_id WHERE t.person_id = @pid
			UNION ALL
			SELECT 'lecturers', l.id, ISNULL(l.specialty, N'Giảng viên') FROM dbo.lecturers l WHERE l.person_id = @pid
			UNION ALL
			SELECT 'external_reviewers', r.id, ISNULL(r.organization, N'Chuyên gia ngoài viện')
			FROM dbo.external_reviewers r WHERE r.person_id = @pid
			UNION ALL
			SELECT 'topic_members', m.id, CONCAT(t.title, N' (', m.role, N')')
			FROM dbo.topic_members m JOIN dbo.topics t ON t.id = m.topic_id WHERE m.person_id = @pid
			UNION ALL
			SELECT 'seminar_participants', p.id, s.title
			FROM dbo.seminar_participants p JOIN dbo.seminars s ON s.id = p.seminar_id WHERE p.person_id = @pid
		) z ORDER BY source, ref_id`);
	return r.recordset;
};

const getCandidate = async (id, canSee = false) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.Int, id)
		.query(`SELECT ${CAND_COLS} ${CAND_FROM} WHERE c.id = @id`);
	if (!r.recordset.length) throw httpErr(404, 'Không tìm thấy cặp nghi trùng.');
	const cand = shapeCandidate(r.recordset[0], canSee);
	const [recA, recB] = await Promise.all([recordsOf(pool, cand.a.id), recordsOf(pool, cand.b.id)]);
	cand.a.records = recA;
	cand.b.records = recB;

	// Chặn / cảnh báo trước khi gộp — giao diện dùng để vô hiệu hoá nút và hiện lý do
	const blockers = [];
	if (cand.a.status !== 'ACTIVE' || cand.b.status !== 'ACTIVE') {
		blockers.push('Một trong hai hồ sơ đã được gộp trước đó.');
	}
	if (cand.a.has_account && cand.b.has_account) {
		blockers.push('Cả hai hồ sơ đều đã có tài khoản đăng nhập. Một người chỉ được có một tài khoản — hãy vô hiệu hoá một tài khoản trước khi gộp.');
	}
	const warnings = [];
	if (r.recordset[0].a_national_id && r.recordset[0].b_national_id && r.recordset[0].a_national_id !== r.recordset[0].b_national_id) {
		warnings.push('Hai hồ sơ có số CCCD khác nhau — rất có thể là hai người khác nhau.');
	}
	if (cand.a.date_of_birth && cand.b.date_of_birth && String(cand.a.date_of_birth) !== String(cand.b.date_of_birth)) {
		warnings.push('Hai hồ sơ có ngày sinh khác nhau.');
	}
	return { ...cand, blockers, warnings };
};

// ─── Ghi ─────────────────────────────────────────────────────────────────────

const loadOpenCandidate = async (tx, id) => {
	const r = await new sql.Request(tx)
		.input('id', sql.Int, id)
		.query(`SELECT id, person_a_id, person_b_id, reason, status FROM dbo.person_merge_candidates WHERE id = @id`);
	const c = r.recordset[0];
	if (!c) throw httpErr(404, 'Không tìm thấy cặp nghi trùng.');
	return c;
};

const setActor = (tx, actorId) =>
	new sql.Request(tx).input('actor_id', sql.VarChar(20), actorId || null).query('EXEC sp_set_actor @actor_id');

/**
 * Gộp cặp `id`. keep = 'A' | 'B' (hồ sơ giữ lại). fields[f] = 'keep' | 'lose' chọn giá trị từng trường;
 * mặc định giữ giá trị của hồ sơ giữ lại, trống thì lấy của hồ sơ bị gộp.
 */
const mergeCandidate = async (id, { keep, fields = {}, note } = {}, actorId) => {
	if (keep !== 'A' && keep !== 'B') throw httpErr(400, 'Phải chọn hồ sơ giữ lại (A hoặc B).');
	for (const [k, v] of Object.entries(fields || {})) {
		if (!MERGE_FIELDS.includes(k)) throw httpErr(400, `Trường không hợp lệ: ${k}`);
		if (v !== 'keep' && v !== 'lose') throw httpErr(400, `Giá trị chọn không hợp lệ cho ${k}`);
	}
	const pool = await getPool();

	const result = await personService.withTx(pool, async (tx) => {
		await setActor(tx, actorId);
		const cand = await loadOpenCandidate(tx, id);
		if (cand.status !== 'PENDING') throw httpErr(409, 'Cặp này đã được xử lý.');
		const keepId = keep === 'A' ? cand.person_a_id : cand.person_b_id;
		const loseId = keep === 'A' ? cand.person_b_id : cand.person_a_id;

		const pr = await new sql.Request(tx)
			.input('k', sql.VarChar(20), keepId)
			.input('l', sql.VarChar(20), loseId)
			.query(`SELECT id, full_name, date_of_birth, gender, national_id, email, phone, is_internal, is_verified, status,
			               origin_table, origin_id, merged_into_id
			        FROM dbo.persons WHERE id IN (@k, @l)`);
		const keepP = pr.recordset.find((x) => x.id === keepId);
		const loseP = pr.recordset.find((x) => x.id === loseId);
		if (!keepP || !loseP) throw httpErr(404, 'Không tìm thấy hồ sơ.');
		if (keepP.status !== 'ACTIVE' || loseP.status !== 'ACTIVE') {
			throw httpErr(409, 'Một trong hai hồ sơ đã được gộp trước đó — hãy tải lại danh sách.');
		}
		const acc = await new sql.Request(tx)
			.input('k', sql.VarChar(20), keepId)
			.input('l', sql.VarChar(20), loseId)
			.query(`SELECT person_id FROM dbo.users WHERE person_id IN (@k, @l)`);
		if (new Set(acc.recordset.map((x) => x.person_id)).size > 1) {
			throw httpErr(409, 'Cả hai hồ sơ đều đã có tài khoản đăng nhập — không thể gộp thành một người.');
		}

		// Giá trị cuối cùng của từng trường
		const finalVal = {};
		for (const f of MERGE_FIELDS) {
			const side = fields?.[f];
			const kv = keepP[f];
			const lv = loseP[f];
			finalVal[f] = side === 'lose' ? (lv ?? kv) : side === 'keep' ? kv : (kv ?? lv);
		}
		if (!finalVal.full_name) finalVal.full_name = keepP.full_name;

		// 1) chuyển person_id ở 6 bảng nguồn (OUTPUT INTO: các bảng này có trigger)
		const moved = {};
		for (const { table, keepUpdatedAt } of SOURCE_TABLES) {
			const m = await new sql.Request(tx)
				.input('k', sql.VarChar(20), keepId)
				.input('l', sql.VarChar(20), loseId)
				.query(`
					DECLARE @m TABLE (id VARCHAR(30));
					UPDATE dbo.${table} SET person_id = @k${keepUpdatedAt ? ', updated_at = updated_at' : ''}
					OUTPUT INSERTED.id INTO @m
					WHERE person_id = @l;
					SELECT id FROM @m;`);
			if (m.recordset.length) moved[table] = m.recordset.map((x) => x.id);
		}

		// 2) hồ sơ bị gộp (xoá CCCD trước để nhường ràng buộc UNIQUE cho hồ sơ giữ lại)
		await new sql.Request(tx)
			.input('k', sql.VarChar(20), keepId)
			.input('l', sql.VarChar(20), loseId)
			.input('actor', sql.VarChar(20), actorId || null)
			.query(`
				UPDATE dbo.persons SET status = 'MERGED', merged_into_id = @k, national_id = NULL,
				       updated_at = SYSDATETIME(), updated_by = @actor WHERE id = @l;
				UPDATE dbo.persons SET merged_into_id = @k WHERE merged_into_id = @l;`);

		// 3) hồ sơ giữ lại
		await new sql.Request(tx)
			.input('k', sql.VarChar(20), keepId)
			.input('actor', sql.VarChar(20), actorId || null)
			.input('full_name', sql.NVarChar(255), finalVal.full_name)
			.input('dob', sql.Date, finalVal.date_of_birth || null)
			.input('gender', sql.VarChar(10), finalVal.gender || null)
			.input('national_id', sql.VarChar(20), finalVal.national_id || null)
			.input('email', sql.VarChar(255), finalVal.email || null)
			.input('phone', sql.VarChar(20), finalVal.phone || null)
			.input('internal', sql.Bit, finalVal.is_internal == null ? null : !!finalVal.is_internal)
			.input('verified', sql.Bit, !!(keepP.is_verified || loseP.is_verified))
			.query(`
				UPDATE dbo.persons SET full_name = @full_name, date_of_birth = @dob, gender = @gender, national_id = @national_id,
				       email = @email, phone = @phone, is_internal = @internal, is_verified = @verified,
				       updated_at = SYSDATETIME(), updated_by = @actor
				WHERE id = @k`);

		// 4) đóng cặp này + xử lý các cặp khác đang chờ có dính hồ sơ bị gộp
		await new sql.Request(tx)
			.input('cid', sql.Int, id)
			.input('k', sql.VarChar(20), keepId)
			.input('l', sql.VarChar(20), loseId)
			.input('actor', sql.VarChar(20), actorId || null)
			.input('note', sql.NVarChar(500), note || null)
			.query(`
				UPDATE dbo.person_merge_candidates SET status = 'MERGED', reviewed_by = @actor, reviewed_at = SYSDATETIME(),
				       note = COALESCE(@note, note) WHERE id = @cid;

				-- cặp khác giữa đúng hai hồ sơ này (lý do khác) → cũng đã giải quyết
				UPDATE dbo.person_merge_candidates SET status = 'MERGED', reviewed_by = @actor, reviewed_at = SYSDATETIME(),
				       note = N'Đã gộp cùng lượt (cặp #' + CAST(@cid AS NVARCHAR(12)) + N')'
				WHERE status = 'PENDING' AND id <> @cid
				  AND ((person_a_id = @k AND person_b_id = @l) OR (person_a_id = @l AND person_b_id = @k));

				-- cặp chờ giữa hồ sơ bị gộp và người thứ ba → chuyển sang hồ sơ giữ lại (nếu chưa có)
				INSERT INTO dbo.person_merge_candidates (person_a_id, person_b_id, reason, note)
				SELECT CASE WHEN o.other < @k THEN o.other ELSE @k END, CASE WHEN o.other < @k THEN @k ELSE o.other END,
				       o.reason, N'Chuyển từ hồ sơ đã gộp ' + @l
				FROM (SELECT CASE WHEN c.person_a_id = @l THEN c.person_b_id ELSE c.person_a_id END AS other, c.reason
				      FROM dbo.person_merge_candidates c
				      WHERE c.status = 'PENDING' AND (c.person_a_id = @l OR c.person_b_id = @l)) o
				WHERE o.other <> @k
				  AND NOT EXISTS (SELECT 1 FROM dbo.person_merge_candidates x
				                  WHERE x.person_a_id = CASE WHEN o.other < @k THEN o.other ELSE @k END
				                    AND x.person_b_id = CASE WHEN o.other < @k THEN @k ELSE o.other END
				                    AND x.reason = o.reason);
				UPDATE dbo.person_merge_candidates SET status = 'MERGED', reviewed_by = @actor, reviewed_at = SYSDATETIME(),
				       note = N'Chuyển sang hồ sơ ' + @k
				WHERE status = 'PENDING' AND (person_a_id = @l OR person_b_id = @l);`);

		// 5) nhật ký gộp (không xoá được)
		await new sql.Request(tx)
			.input('cid', sql.Int, id)
			.input('k', sql.VarChar(20), keepId)
			.input('l', sql.VarChar(20), loseId)
			.input('lose_snap', sql.NVarChar(sql.MAX), JSON.stringify(loseP))
			.input('keep_snap', sql.NVarChar(sql.MAX), JSON.stringify(keepP))
			.input('moved', sql.NVarChar(sql.MAX), JSON.stringify(moved))
			.input('note', sql.NVarChar(500), note || null)
			.input('actor', sql.VarChar(20), actorId || null)
			.query(`INSERT INTO dbo.person_merge_log (candidate_id, kept_id, merged_id, merged_snapshot, kept_before, moved_json, note, merged_by)
			        VALUES (@cid, @k, @l, @lose_snap, @keep_snap, @moved, @note, @actor)`);

		return {
			candidate_id: id,
			kept_id: keepId,
			merged_id: loseId,
			moved: Object.fromEntries(Object.entries(moved).map(([t, ids]) => [t, ids.length])),
		};
	});

	broadcast('update', { entity: 'person_merge' });
	return result;
};

/** Đánh dấu "không phải cùng một người" — cặp này không xuất hiện lại. */
const rejectCandidate = async (id, note, actorId) => {
	const pool = await getPool();
	await personService.withTx(pool, async (tx) => {
		const cand = await loadOpenCandidate(tx, id);
		if (cand.status !== 'PENDING') throw httpErr(409, 'Cặp này đã được xử lý.');
		await new sql.Request(tx)
			.input('id', sql.Int, id)
			.input('note', sql.NVarChar(500), note || null)
			.input('actor', sql.VarChar(20), actorId || null)
			.query(`UPDATE dbo.person_merge_candidates SET status = 'REJECTED', reviewed_by = @actor,
			               reviewed_at = SYSDATETIME(), note = COALESCE(@note, note) WHERE id = @id`);
	});
	broadcast('update', { entity: 'person_merge' });
	return { id, status: 'REJECTED' };
};

/** Đưa cặp đã bỏ qua trở lại hàng đợi (chỉ khi cả hai hồ sơ vẫn còn hiệu lực). */
const reopenCandidate = async (id, actorId) => {
	const pool = await getPool();
	await personService.withTx(pool, async (tx) => {
		const cand = await loadOpenCandidate(tx, id);
		if (cand.status !== 'REJECTED') throw httpErr(409, 'Chỉ mở lại được cặp đã bỏ qua.');
		const p = await new sql.Request(tx)
			.input('a', sql.VarChar(20), cand.person_a_id)
			.input('b', sql.VarChar(20), cand.person_b_id)
			.query(`SELECT COUNT(*) AS n FROM dbo.persons WHERE id IN (@a, @b) AND status = 'ACTIVE'`);
		if (p.recordset[0].n !== 2) throw httpErr(409, 'Một trong hai hồ sơ đã được gộp — không thể mở lại.');
		await new sql.Request(tx)
			.input('id', sql.Int, id)
			.query(`UPDATE dbo.person_merge_candidates SET status = 'PENDING', reviewed_by = NULL, reviewed_at = NULL WHERE id = @id`);
	});
	broadcast('update', { entity: 'person_merge' });
	return { id, status: 'PENDING' };
};

module.exports = { listCandidates, getStats, getCandidate, mergeCandidate, rejectCandidate, reopenCandidate, STATUSES, REASONS, MERGE_FIELDS };
