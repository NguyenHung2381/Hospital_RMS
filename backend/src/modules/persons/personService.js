const {
	getPool,
	sql,
	withTransaction,
	castBool,
	lockResource,
	nextSequenceValues,
	nowSql,
	strLen,
	udf,
} = require('../../config/db');
const { isMissingObject } = require('../../utils/dbErrors');
const { normalizeGender } = require('../../utils/gender');
const logger = require('../../config/logger');

/**
 * Dual-write danh tính (GĐ 1 / bước 2) — giữ bảng `persons` đồng bộ với 6 bảng nguồn.
 *
 * NGUYÊN TẮC
 *  - Bảng nguồn (users, trainees, lecturers, external_reviewers, topic_members,
 *    seminar_participants) VẪN LÀ NGUỒN SỰ THẬT. Ghi vào persons là phụ: chạy SAU khi
 *    lệnh ghi chính đã thành công, và KHÔNG BAO GIỜ ném lỗi ra ngoài — lỗi chỉ được
 *    log. Người dùng không bao giờ bị chặn thao tác vì persons.
 *  - Bản ghi lỡ không được gắn (lỗi, DB chưa migrate, tắt cờ) sẽ được job đêm
 *    (jobs/personLinkJob) gắn nốt qua syncPending().
 *  - Quy tắc so khớp GIỐNG HỆT migration 2026-09-25_persons_foundation.sql:
 *      R0 có user_id → person của user · R1 CCCD · R2 staff_number + tên ·
 *      R3 email + tên · R4 SĐT chuẩn hóa + tên · R5 tên + ngày sinh.
 *    Mỗi quy tắc chỉ dùng khi khớp ĐÚNG 1 person; không thì tạo person mới.
 *    Trùng TÊN đơn thuần không bao giờ tự gộp.
 *  - Nguồn tạo ẩn danh (trainees.created_by IS NULL — đăng ký khóa học công khai) KHÔNG tự gắn vào person
 *    đã xác thực / có tài khoản: tạo person riêng + xếp cặp vào person_merge_candidates để nhân viên duyệt.
 *  - Cờ tắt khẩn cấp: PERSON_DUAL_WRITE=false (không cần deploy lại code).
 *  - Trước khi chạy migration, mọi hàm ở đây tự động bỏ qua (kiểm tra lại mỗi 60s).
 */

// ─── Cấu hình từng bảng nguồn ────────────────────────────────────────────────
// Giá trị là BIỂU THỨC SQL tên cột trong bảng nguồn (hằng số trong code, không lấy từ input).
const SOURCES = {
	users: {
		table: 'users',
		name: 'full_name',
		email: 'email',
		phone: 'phone_number',
		dob: 'date_of_birth',
		staff: 'staff_number',
		internal: '1',
		verified: true,
	},
	trainees: {
		table: 'trainees',
		name: 'full_name',
		email: 'email',
		phone: 'phone',
		dob: 'dob',
		gender: 'gender',
		nationalId: 'national_id',
		// Dòng không có created_by = tạo bởi luồng không đăng nhập (đăng ký khóa học công khai):
		// dữ liệu do người ngoài tự khai ⇒ không được tự gắn vào person đã xác thực / có tài khoản.
		anonymousWhenNoCreator: true,
	},
	lecturers: {
		table: 'lecturers',
		name: 'full_name',
		email: 'email',
		phone: 'phone',
		dob: 'dob',
		gender: 'gender',
		linkedUser: 'user_id',
		internal: "CASE WHEN is_external = 'true' THEN 0 ELSE 1 END",
	},
	external_reviewers: {
		table: 'external_reviewers',
		name: 'full_name',
		email: 'email',
		phone: 'phone',
		internal: '0',
	},
	topic_members: {
		table: 'topic_members',
		name: 'name',
		email: 'email',
		phone: 'phone_number',
		staff: 'staff_number',
		linkedUser: 'user_id',
	},
	seminar_participants: {
		table: 'seminar_participants',
		name: 'full_name',
		dob: 'dob',
		gender: 'gender',
		staff: 'staff_number',
		linkedUser: 'user_id',
		// trigger audit của bảng này bump updated_at với MỌI lần UPDATE trừ khi SET updated_at.
		// Ghi person_id kèm `updated_at = updated_at` để không làm bẩn cột audit.
		keepUpdatedAt: true,
	},
};

// Thứ tự xử lý khi quét hàng loạt: users trước (nguồn tin cậy nhất, các nguồn khác có thể trỏ vào).
const SOURCE_ORDER = [
	'users',
	'lecturers',
	'external_reviewers',
	'trainees',
	'topic_members',
	'seminar_participants',
];

// Cùng biểu thức với cột tính `persons.name_key`
const NAME_KEY = (p) =>
	`LOWER(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(${p}, '  ', ' '), '  ', ' '), '  ', ' '))))`;

// ─── Trạng thái schema (migration đã chạy chưa) ──────────────────────────────
let schemaReady = false;
let schemaCheckedAt = 0;
const SCHEMA_RECHECK_MS = 60 * 1000;

const isEnabled = () => process.env.PERSON_DUAL_WRITE !== 'false';

const checkSchema = async (pool) => {
	if (schemaReady) return true;
	if (Date.now() - schemaCheckedAt < SCHEMA_RECHECK_MS) return false;
	schemaCheckedAt = Date.now();
	// information_schema có ở cả SQL Server và PG — đủ 4 đối tượng thì ra 4 tên
	const r = await pool.request().query(`
		SELECT table_name AS n FROM information_schema.tables WHERE LOWER(table_name) = 'persons'
		UNION ALL SELECT sequence_name FROM information_schema.sequences WHERE LOWER(sequence_name) = 'seq_person_id'
		UNION ALL SELECT routine_name FROM information_schema.routines WHERE LOWER(routine_name) = 'fn_normalize_phone'
		UNION ALL SELECT column_name FROM information_schema.columns WHERE LOWER(table_name) = 'users' AND LOWER(column_name) = 'person_id'`);
	schemaReady = new Set(r.recordset.map((x) => String(x.n).toLowerCase())).size === 4;
	if (!schemaReady) {
		logger.warn(
			'[persons] Chưa có bảng persons/cột person_id — bỏ qua dual-write (chạy migration 2026-09-25_persons_foundation.sql).',
		);
	}
	return schemaReady;
};

// ─── Chuẩn hóa dữ liệu vào ───────────────────────────────────────────────────
const clean = (v) => {
	if (v == null) return null;
	const s = String(v).trim();
	return s === '' ? null : s;
};
// Luồng cấp tài khoản sinh email giả `<id>@member.local` khi thành viên không có email — không phải dữ liệu thật.
const cleanEmail = (v) => {
	const s = clean(v);
	if (!s || /@member\.local$/i.test(s)) return null;
	return s.slice(0, 255);
};
const cleanPhone = (v) => {
	const s = clean(v);
	return s ? s.slice(0, 20) : null;
};

const selectSourceSql = (cfg) => `
	SELECT id, person_id,
	       ${cfg.name} AS full_name,
	       ${cfg.email || 'CAST(NULL AS VARCHAR(255))'} AS email,
	       ${cfg.phone || 'CAST(NULL AS VARCHAR(40))'} AS phone,
	       ${cfg.dob || 'CAST(NULL AS DATE)'} AS dob,
	       ${cfg.gender || 'CAST(NULL AS VARCHAR(10))'} AS gender,
	       ${cfg.nationalId || 'CAST(NULL AS VARCHAR(20))'} AS national_id,
	       ${cfg.staff || 'CAST(NULL AS INT)'} AS staff_number,
	       ${cfg.linkedUser || 'CAST(NULL AS VARCHAR(20))'} AS linked_user_id,
	       ${castBool(cfg.internal || 'NULL')} AS is_internal,
	       ${cfg.anonymousWhenNoCreator ? 'CASE WHEN created_by IS NULL THEN 1 ELSE 0 END' : '0'} AS is_anonymous
	FROM ${cfg.table}
	WHERE id = @id`;

const bindPerson = (req, row) =>
	req
		.input('name', sql.NVarChar(255), clean(row.full_name))
		.input('email', sql.VarChar(255), cleanEmail(row.email))
		.input('phone', sql.VarChar(40), cleanPhone(row.phone))
		.input('dob', sql.Date, row.dob || null)
		.input('gender', sql.VarChar(10), normalizeGender(row.gender))
		.input('national_id', sql.VarChar(20), clean(row.national_id))
		.input('staff', sql.Int, row.staff_number ?? null)
		.input('internal', sql.Bit, row.is_internal == null ? null : !!row.is_internal);

// ─── Tiện ích SQL trong transaction ──────────────────────────────────────────
const lock = async (tx) => {
	if (!(await lockResource(tx, 'person_sync', 15000)))
		throw new Error('Không lấy được khóa person_sync (quá thời gian chờ).');
};

// Trả về id nếu truy vấn cho ĐÚNG 1 person khác nhau; ngược lại null.
const pickUnique = async (tx, queryText, bind) => {
	const req = new sql.Request(tx);
	bind(req);
	const r = await req.query(queryText);
	const ids = [...new Set(r.recordset.map((x) => x.pid))];
	return ids.length === 1 ? ids[0] : null;
};

// Điều kiện loại các person đã gắn cho một tài khoản users KHÁC (1 người chỉ có 1 tài khoản).
const notClaimedByOtherUser = (source) =>
	source === 'users'
		? ` AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.person_id = p.id AND u2.id <> @id)`
		: '';

// person "được bảo vệ" = đã xác thực (is_verified) hoặc đang gắn với 1 tài khoản users. Nguồn tạo ẩn danh
// (đăng ký công khai) KHÔNG được tự gắn vào person loại này — chỉ đưa vào hàng đợi duyệt gộp.
const PROTECTED_ONLY = ` AND (p.is_verified = 'true' OR EXISTS (SELECT 1 FROM users ua WHERE ua.person_id = p.id))`;
const UNPROTECTED_ONLY = ` AND p.is_verified = 'false' AND NOT EXISTS (SELECT 1 FROM users ua WHERE ua.person_id = p.id)`;

// Lý do trong person_merge_candidates (CHECK chk_pmc_reason) ứng với từng quy tắc so khớp
const RULE_REASON = {
	R1: 'SAME_NAME', // CCCD trùng — không có lý do riêng, ghi chú nêu rõ
	R2: 'SAME_STAFF_NUMBER',
	R3: 'SAME_EMAIL',
	R4: 'SAME_PHONE',
	R5: 'SAME_NAME_DOB',
};

// ─── So khớp R1..R5 ──────────────────────────────────────────────────────────
// scope: 'any' = mọi person ACTIVE · 'unprotected' = chỉ person chưa xác thực và chưa có tài khoản ·
// 'protected' = chỉ person đã xác thực / có tài khoản. Trả { pid, rule } hoặc null.
const matchExisting = async (tx, source, id, row, scope = 'any') => {
	const name = clean(row.full_name);
	const email = cleanEmail(row.email);
	const phone = cleanPhone(row.phone);
	const nationalId = clean(row.national_id);
	const excl = notClaimedByOtherUser(source);
	const scopeSql =
		scope === 'unprotected' ? UNPROTECTED_ONLY : scope === 'protected' ? PROTECTED_ONLY : '';
	const base = `SELECT p.id AS pid FROM persons p WHERE p.status = 'ACTIVE'${excl}${scopeSql}`;
	const bind = (req) => bindPerson(req.input('id', sql.VarChar(30), id), row);

	// R1: CCCD
	if (nationalId) {
		const pid = await pickUnique(tx, `${base} AND p.national_id = @national_id`, bind);
		if (pid) return { pid, rule: 'R1' };
	}
	// R2: staff_number + trùng tên
	if (row.staff_number != null && name) {
		let q;
		if (source === 'users') {
			// tài khoản mới: khớp person đã tạo từ thành viên đề tài / người dự hội thảo cùng staff_number + tên
			q = `${base} AND p.name_key = ${NAME_KEY('@name')} AND (
					EXISTS (SELECT 1 FROM topic_members x WHERE x.person_id = p.id AND x.staff_number = @staff)
				 OR EXISTS (SELECT 1 FROM seminar_participants x WHERE x.person_id = p.id AND x.staff_number = @staff))`;
		} else {
			q = `${base} AND p.name_key = ${NAME_KEY('@name')} AND EXISTS (
					SELECT 1 FROM users u WHERE u.person_id = p.id AND u.staff_number = @staff)`;
		}
		const pid = await pickUnique(tx, q, bind);
		if (pid) return { pid, rule: 'R2' };
	}
	// R3: email + tên
	if (email && name) {
		const pid = await pickUnique(
			tx,
			`${base} AND p.name_key = ${NAME_KEY('@name')} AND p.email = @email`,
			bind,
		);
		if (pid) return { pid, rule: 'R3' };
	}
	// R4: SĐT chuẩn hóa (≥ 8 số) + tên
	if (phone && name) {
		const pid = await pickUnique(
			tx,
			`${base} AND p.name_key = ${NAME_KEY('@name')}
			   AND ${strLen(udf('fn_normalize_phone', '@phone'))} >= 8
			   AND ${udf('fn_normalize_phone', 'p.phone')} = ${udf('fn_normalize_phone', '@phone')}`,
			bind,
		);
		if (pid) return { pid, rule: 'R4' };
	}
	// R5: tên + ngày sinh
	if (row.dob && name) {
		const pid = await pickUnique(
			tx,
			`${base} AND p.name_key = ${NAME_KEY('@name')} AND p.date_of_birth = @dob`,
			bind,
		);
		if (pid) return { pid, rule: 'R5' };
	}
	return null;
};

const createPerson = async (tx, source, id, row, actorId) => {
	const cfg = SOURCES[source];
	// Mã PS + 8 số cuối của sequence (như RIGHT('00000000' + n, 8) trước đây)
	const [n] = await nextSequenceValues(tx, 'seq_person_id', 1);
	const personId = `PS${String(n).padStart(8, '0').slice(-8)}`;
	const req = bindPerson(new sql.Request(tx), row)
		.input('pid', sql.VarChar(20), personId)
		.input('origin_table', sql.VarChar(40), source)
		.input('origin_id', sql.VarChar(30), id)
		.input('verified', sql.Bit, !!cfg.verified)
		.input('actor', sql.VarChar(20), actorId || null);
	await req.query(`
		INSERT INTO persons (id, full_name, date_of_birth, gender, national_id, email, phone,
		                         is_internal, is_verified, origin_table, origin_id, created_by)
		VALUES (@pid, @name, @dob, @gender, @national_id, @email, LEFT(@phone, 20),
		        @internal, @verified, @origin_table, @origin_id, @actor)`);
	return personId;
};

// person đã gắn: đồng bộ thông tin. Nguồn "chính" (chính bảng đã sinh ra person, hoặc users) ghi đè
// cả khi giá trị rỗng; nguồn phụ chỉ điền chỗ còn trống — tránh 2 bảng ghi đè qua lại.
const updatePerson = async (tx, source, personId, row, actorId) => {
	const cfg = SOURCES[source];
	const cur = await new sql.Request(tx)
		.input('pid', sql.VarChar(20), personId)
		.query('SELECT origin_table FROM persons WHERE id = @pid');
	if (!cur.recordset.length) return;
	const primary = source === 'users' || cur.recordset[0].origin_table === source;

	const sets = [];
	const fill = (col, param, has) => {
		if (!has) return;
		sets.push(primary ? `${col} = @${param}` : `${col} = COALESCE(${col}, @${param})`);
	};
	if (primary && clean(row.full_name)) sets.push('full_name = @name');
	fill('email', 'email', !!cfg.email);
	fill('phone', 'phone', !!cfg.phone);
	fill('date_of_birth', 'dob', !!cfg.dob);
	fill('gender', 'gender', !!cfg.gender);
	fill('national_id', 'national_id', !!cfg.nationalId);
	if (cfg.internal) sets.push('is_internal = COALESCE(is_internal, @internal)');
	if (cfg.verified) sets.push("is_verified = 'true'");
	if (!sets.length) return;
	sets.push(`updated_at = ${nowSql}`, 'updated_by = @actor');

	const req = bindPerson(new sql.Request(tx), row)
		.input('pid', sql.VarChar(20), personId)
		.input('actor', sql.VarChar(20), actorId || null);
	await req.query(`UPDATE persons SET ${sets.join(', ')} WHERE id = @pid`);
};

// Xóa person "mồ côi" do chính dual-write tạo ra (không bản ghi nguồn hay cặp duyệt nào còn trỏ tới).
const deleteOrphanPerson = async (tx, personId) => {
	if (!personId) return;
	await new sql.Request(tx).input('pid', sql.VarChar(20), personId).query(`
		DELETE FROM persons
		WHERE id = @pid AND origin_table IS NOT NULL AND status = 'ACTIVE'
		  AND NOT EXISTS (SELECT 1 FROM users x WHERE x.person_id = persons.id)
		  AND NOT EXISTS (SELECT 1 FROM trainees x WHERE x.person_id = persons.id)
		  AND NOT EXISTS (SELECT 1 FROM lecturers x WHERE x.person_id = persons.id)
		  AND NOT EXISTS (SELECT 1 FROM external_reviewers x WHERE x.person_id = persons.id)
		  AND NOT EXISTS (SELECT 1 FROM topic_members x WHERE x.person_id = persons.id)
		  AND NOT EXISTS (SELECT 1 FROM seminar_participants x WHERE x.person_id = persons.id)
		  AND NOT EXISTS (SELECT 1 FROM person_merge_candidates c WHERE c.person_a_id = persons.id OR c.person_b_id = persons.id)
		  AND NOT EXISTS (SELECT 1 FROM person_merge_log l WHERE l.kept_id = persons.id OR l.merged_id = persons.id)
		  AND NOT EXISTS (SELECT 1 FROM persons c WHERE c.merged_into_id = persons.id)`);
};

// Nguồn ẩn danh khớp 1 person được bảo vệ ⇒ không gắn; xếp cặp (person mới, person được bảo vệ) vào
// hàng đợi duyệt gộp để nhân viên quyết định. Bỏ qua nếu cặp + lý do đã có.
const queueMergeCandidate = async (tx, personId, otherId, rule, source, actorId) => {
	if (!personId || !otherId || personId === otherId) return;
	const [a, b] = personId < otherId ? [personId, otherId] : [otherId, personId];
	const note =
		rule === 'R1'
			? `Nguồn ${source} tạo ẩn danh trùng CCCD với hồ sơ đã xác thực/có tài khoản — chưa tự gắn`
			: `Nguồn ${source} tạo ẩn danh trùng thông tin với hồ sơ đã xác thực/có tài khoản — chưa tự gắn`;
	await new sql.Request(tx)
		.input('a', sql.VarChar(20), a)
		.input('b', sql.VarChar(20), b)
		.input('reason', sql.VarChar(20), RULE_REASON[rule] || 'SAME_NAME')
		.input('note', sql.NVarChar(500), note)
		.input('actor', sql.VarChar(20), actorId || null).query(`
			INSERT INTO person_merge_candidates (person_a_id, person_b_id, reason, note, created_by)
			SELECT CAST(@a AS VARCHAR(20)), CAST(@b AS VARCHAR(20)), CAST(@reason AS VARCHAR(20)), CAST(@note AS VARCHAR(500)), CAST(@actor AS VARCHAR(20))
			WHERE NOT EXISTS (SELECT 1 FROM person_merge_candidates x
			                  WHERE x.person_a_id = @a AND x.person_b_id = @b AND x.reason = @reason)`);
};

const setSourcePerson = async (tx, source, id, personId) => {
	const cfg = SOURCES[source];
	await new sql.Request(tx)
		.input('id', sql.VarChar(30), id)
		.input('pid', sql.VarChar(20), personId)
		.query(
			`UPDATE ${cfg.table} SET person_id = @pid${cfg.keepUpdatedAt ? ', updated_at = updated_at' : ''}
			 WHERE id = @id AND COALESCE(person_id, '') <> @pid`,
		);
};

// Lõi: gắn/cập nhật person cho 1 dòng nguồn (gọi trong transaction đã giữ khóa). Trả về person_id.
const resolveOne = async (tx, source, id, actorId, depth = 0) => {
	const cfg = SOURCES[source];
	const rowRes = await new sql.Request(tx)
		.input('id', sql.VarChar(30), id)
		.query(selectSourceSql(cfg));
	const row = rowRes.recordset[0];
	if (!row || !clean(row.full_name)) return null;

	let personId = row.person_id;

	// R0: dòng trỏ tới 1 tài khoản → dùng person của tài khoản (đổi user_id thì gắn lại)
	if (cfg.linkedUser && row.linked_user_id && depth === 0) {
		let userPerson = (
			await new sql.Request(tx)
				.input('uid', sql.VarChar(20), row.linked_user_id)
				.query('SELECT person_id FROM users WHERE id = @uid')
		).recordset[0]?.person_id;
		if (!userPerson)
			userPerson = await resolveOne(tx, 'users', row.linked_user_id, actorId, depth + 1);
		if (userPerson && userPerson !== personId) {
			const old = personId;
			personId = userPerson;
			await setSourcePerson(tx, source, id, personId);
			const stillOwn = old
				? (
						await new sql.Request(tx)
							.input('o', sql.VarChar(20), old)
							.query(`SELECT origin_table FROM persons WHERE id = @o`)
					).recordset[0]?.origin_table
				: null;
			if (old && stillOwn === source) await deleteOrphanPerson(tx, old);
		}
	}

	if (personId) {
		await updatePerson(tx, source, personId, row, actorId);
		return personId;
	}

	let heldBack = null; // person được bảo vệ mà nguồn ẩn danh khớp nhưng không được tự gắn
	if (row.is_anonymous) {
		const hit = await matchExisting(tx, source, id, row, 'unprotected');
		personId = hit?.pid || null;
		if (!personId) heldBack = await matchExisting(tx, source, id, row, 'protected');
	} else {
		personId = (await matchExisting(tx, source, id, row))?.pid || null;
	}
	if (!personId) {
		personId = await createPerson(tx, source, id, row, actorId);
		if (heldBack)
			await queueMergeCandidate(tx, personId, heldBack.pid, heldBack.rule, source, actorId);
	}
	await setSourcePerson(tx, source, id, personId);
	// nếu match vào person có sẵn thì bổ sung thông tin còn thiếu
	await updatePerson(tx, source, personId, row, actorId);
	return personId;
};

const withTx = (pool, fn) =>
	withTransaction(async (tx) => {
		await lock(tx);
		return fn(tx);
	}, pool);

const logFailure = (what, err) => {
	if (isMissingObject(err)) {
		schemaReady = false; // thiếu bảng/cột (migration chưa chạy hoặc bị gỡ) → kiểm tra lại sau
		schemaCheckedAt = Date.now();
	}
	logger.error(`[persons] ${what} thất bại (bỏ qua, job đêm sẽ gắn lại):`, err?.message || err);
};

// ─── API công khai ───────────────────────────────────────────────────────────

/** Gắn/cập nhật person cho 1 dòng nguồn. KHÔNG bao giờ ném lỗi. Trả person_id hoặc null. */
const syncPerson = async (source, id, { actorId = undefined } = {}) => {
	if (!isEnabled() || !SOURCES[source] || !id) return null;
	try {
		const pool = await getPool();
		if (!(await checkSchema(pool))) return null;
		return await withTx(pool, (tx) => resolveOne(tx, source, id, actorId));
	} catch (err) {
		logFailure(`syncPerson(${source}, ${id})`, err);
		return null;
	}
};

/** Như syncPerson cho nhiều dòng (import hàng loạt). Trả số dòng đã xử lý. */
const syncPersons = async (source, ids, { actorId = undefined } = {}) => {
	if (!isEnabled() || !SOURCES[source] || !ids?.length) return 0;
	let done = 0;
	try {
		const pool = await getPool();
		if (!(await checkSchema(pool))) return 0;
		const CHUNK = 100; // giữ khóa ngắn: mỗi transaction tối đa 100 dòng
		for (let i = 0; i < ids.length; i += CHUNK) {
			const chunk = ids.slice(i, i + CHUNK);
			try {
				done += await withTx(pool, async (tx) => {
					let n = 0;
					for (const id of chunk) {
						if (await resolveOne(tx, source, id, actorId)) n += 1;
					}
					return n;
				});
			} catch (err) {
				logFailure(`syncPersons(${source}) lô ${i}-${i + chunk.length}`, err);
			}
		}
	} catch (err) {
		logFailure(`syncPersons(${source})`, err);
	}
	return done;
};

/** Gắn nốt các dòng còn person_id IS NULL (job đêm / nhặt sót). Trả số dòng đã gắn. */
const syncPending = async (source, { limit = 500, actorId = undefined } = {}) => {
	if (!isEnabled() || !SOURCES[source]) return 0;
	try {
		const pool = await getPool();
		if (!(await checkSchema(pool))) return 0;
		const cfg = SOURCES[source];
		const r = await pool
			.request()
			.input('limit', sql.Int, limit)
			.query(
				`SELECT id FROM ${cfg.table} WHERE person_id IS NULL AND LTRIM(RTRIM(${cfg.name})) <> '' ORDER BY id OFFSET 0 ROWS FETCH NEXT @limit ROWS ONLY`,
			);
		return await syncPersons(
			source,
			r.recordset.map((x) => x.id),
			{ actorId },
		);
	} catch (err) {
		logFailure(`syncPending(${source})`, err);
		return 0;
	}
};

/** person_id hiện tại của 1 dòng nguồn — gọi TRƯỚC khi xóa dòng đó rồi truyền cho releasePerson. KHÔNG ném lỗi. */
const personIdOf = async (source, id) => {
	if (!isEnabled() || !SOURCES[source] || !id) return null;
	try {
		const pool = await getPool();
		if (!(await checkSchema(pool))) return null;
		const r = await pool
			.request()
			.input('id', sql.VarChar(30), id)
			.query(`SELECT person_id FROM ${SOURCES[source].table} WHERE id = @id`);
		return r.recordset[0]?.person_id || null;
	} catch (err) {
		logFailure(`personIdOf(${source}, ${id})`, err);
		return null;
	}
};

/**
 * Sau khi XÓA 1 dòng nguồn (vd xóa tài khoản): person của dòng đó (personId, hoặc person có
 * nguồn gốc là dòng đó) không còn gì trỏ tới thì xóa; còn bản ghi nguồn khác trỏ tới (vd thành
 * viên đề tài của cùng người) thì chuyển nguồn gốc sang bản ghi đó. KHÔNG bao giờ ném lỗi.
 */
const releasePerson = async (source, id, personId, { actorId = undefined } = {}) => {
	if (!isEnabled() || !SOURCES[source] || !id) return;
	try {
		const pool = await getPool();
		if (!(await checkSchema(pool))) return;
		await withTx(pool, async (tx) => {
			const r = await new sql.Request(tx)
				.input('pid', sql.VarChar(20), personId || null)
				.input('src', sql.VarChar(40), source)
				.input('id', sql.VarChar(30), id)
				.query(
					`SELECT id FROM persons WHERE id = @pid OR (origin_table = @src AND origin_id = @id)`,
				);
			for (const { id: pid } of r.recordset) {
				await deleteOrphanPerson(tx, pid);
				const cur = (
					await new sql.Request(tx)
						.input('pid', sql.VarChar(20), pid)
						.query('SELECT origin_table, origin_id FROM persons WHERE id = @pid')
				).recordset[0];
				if (!cur || cur.origin_table !== source || cur.origin_id !== id) continue;
				// Còn bản ghi khác trỏ tới → bản ghi đó thành nguồn gốc mới
				for (const next of SOURCE_ORDER) {
					const other = (
						await new sql.Request(tx)
							.input('pid', sql.VarChar(20), pid)
							.query(
								`SELECT id FROM ${SOURCES[next].table} WHERE person_id = @pid ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`,
							)
					).recordset[0];
					if (!other) continue;
					await new sql.Request(tx)
						.input('pid', sql.VarChar(20), pid)
						.input('src', sql.VarChar(40), next)
						.input('oid', sql.VarChar(30), other.id)
						.input('actor', sql.VarChar(20), actorId || null)
						.query(`UPDATE persons SET origin_table = @src, origin_id = @oid,
						               updated_at = ${nowSql}, updated_by = @actor
						        WHERE id = @pid`);
					break;
				}
			}
		});
	} catch (err) {
		logFailure(`releasePerson(${source}, ${id})`, err);
	}
};

/**
 * Sau khi cấp tài khoản cho thành viên đề tài: thành viên và tài khoản phải trỏ CÙNG 1 person.
 * KHÔNG bao giờ ném lỗi.
 */
const linkTopicMemberToUser = async (memberId, userId, { actorId = undefined } = {}) => {
	if (!isEnabled() || !memberId || !userId) return null;
	try {
		const pool = await getPool();
		if (!(await checkSchema(pool))) return null;
		return await withTx(pool, async (tx) => {
			const r = await new sql.Request(tx)
				.input('m', sql.VarChar(22), memberId)
				.input('u', sql.VarChar(20), userId)
				.query(`SELECT (SELECT person_id FROM topic_members WHERE id = @m) AS mp,
				               (SELECT person_id FROM users WHERE id = @u) AS up`);
			const { mp } = r.recordset[0];
			let { up } = r.recordset[0];
			if (!up && !mp) {
				up = await resolveOne(tx, 'users', userId, actorId);
				if (up) await setSourcePerson(tx, 'topic_members', memberId, up);
				return up;
			}
			if (!up && mp) {
				// tài khoản mới nhận person của thành viên (person đó giờ có tài khoản → đã xác thực, nội viện)
				await new sql.Request(tx)
					.input('u', sql.VarChar(20), userId)
					.input('mp', sql.VarChar(20), mp)
					.query(`UPDATE users SET person_id = @mp WHERE id = @u AND person_id IS NULL`);
				await new sql.Request(tx)
					.input('mp', sql.VarChar(20), mp)
					.query(
						`UPDATE persons SET is_verified = 'true', is_internal = 'true', updated_at = ${nowSql} WHERE id = @mp`,
					);
				await resolveOne(tx, 'users', userId, actorId);
				return mp;
			}
			if (up && mp !== up) {
				await setSourcePerson(tx, 'topic_members', memberId, up);
				await deleteOrphanPerson(tx, mp);
			}
			return up;
		});
	} catch (err) {
		logFailure(`linkTopicMemberToUser(${memberId}, ${userId})`, err);
		return null;
	}
};

module.exports = {
	syncPerson,
	syncPersons,
	syncPending,
	linkTopicMemberToUser,
	personIdOf,
	releasePerson,
	isEnabled,
	withTx, // giao dịch có giữ khóa person_sync — dùng chung với personMergeService
	SOURCE_ORDER,
};
