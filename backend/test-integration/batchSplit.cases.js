// Lô nhiều câu đã tách (queryAll, updateReturning, sinh mã <PREFIX>NN bằng JS, các
// lô DECLARE viết lại bằng JS) — chạy trên DB THẬT, dùng chung cho SQL Server
// (test-integration/batchSplit.test.js) và PG (test-integration-pg/batchSplit.test.js).
// Mọi thứ trong 1 transaction rồi ROLLBACK.
const assert = require('node:assert/strict');

/**
 * @param {import('node:test').TestContext} t
 * @param {any} db module src/config/db (đã chọn đúng DB_CLIENT)
 * @param {{ skip?: string[] }} [opts] tên ca bỏ qua (kèm lý do ở file gọi)
 */
const run = async (t, db, { skip = [] } = {}) => {
	const { sql } = db;
	const pool = await db.getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	const real = { getPool: db.getPool, withTransaction: db.withTransaction };
	db.getPool = async () => ({ request: () => new sql.Request(tx) });
	db.withTransaction = async (fn) => fn(tx);
	t.after(async () => {
		Object.assign(db, real);
		await tx.rollback();
	});
	require('../src/modules/events/eventService').broadcast = () => {};
	// Dữ liệu danh mục / dashboard có cache trong bộ nhớ — bỏ qua để đọc DB thật
	require('../src/utils/cache').remember = async (_k, _ttl, fn) => fn();

	const q = async (text, inputs = {}) => {
		const req = new sql.Request(tx);
		for (const [k, v] of Object.entries(inputs)) req.input(k, v);
		return (await req.query(text)).recordset;
	};
	const [actor] = await q('SELECT id FROM users WHERE is_active = @on ORDER BY id', { on: true });
	if (!actor) return t.skip('DB chưa có người dùng');
	const step = (name, fn) => t.test(name, skip.includes(name) ? { skip: 'xem file gọi' } : {}, fn);

	await step('queryAll: mỗi câu 1 tập kết quả, đúng thứ tự, dùng chung tham số', async () => {
		const req = new sql.Request(tx).input('id', sql.VarChar(20), actor.id);
		const sets = await db.queryAll(req, [
			'SELECT id FROM users WHERE id = @id',
			'SELECT COUNT(*) AS n FROM users WHERE id = @id;',
			'SELECT id FROM users WHERE id = @id AND 1 = 0',
		]);
		assert.equal(sets.length, 3);
		assert.equal(sets[0][0].id, actor.id);
		assert.equal(Number(sets[1][0].n), 1);
		assert.deepEqual(sets[2], []);
	});

	// sp_getapplock gọi thẳng → lockWaitlist = lockResource của adapter (PG: pg_advisory_xact_lock).
	// fillFromWaitlist / transfer chạy trong withTransaction (đã thay bằng tx rollback) ⇒ khóa giữ tới hết tx
	// test. Đặt sớm: các bước sau (ghi danh, sửa khóa) có thể gọi fillFromWaitlist.
	await step(
		'khóa danh sách chờ: lấy khóa trong transaction của xếp lớp / chuyển người chờ',
		async () => {
			const pcs = require('../src/modules/training/courses/programClassService');
			const wts = require('../src/modules/training/courses/waitlistTransferService');
			const held = async () =>
				db.client === 'pg'
					? Number(
							(
								await q(
									`SELECT COUNT(*) AS n FROM pg_locks
                 WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND granted AND objsubid = 1
                   AND ((classid::bigint << 32) | objid::bigint) = hashtextextended(@r, 0)`,
									{ r: pcs.WAITLIST_LOCK },
								)
							)[0].n,
						) > 0
					: (
							await q("SELECT APPLOCK_MODE('public', @r, 'Transaction') AS m", {
								r: pcs.WAITLIST_LOCK,
							})
						)[0].m === 'Exclusive';
			assert.equal(await held(), false);
			// Khóa không tồn tại ⇒ không lớp nào, không ai được chuyển (không gửi thư)
			assert.deepEqual(await pcs.fillFromWaitlist('KHONG_CO', actor.id), []);
			assert.equal(await held(), true);

			// transfer gọi programClassService.lockWaitlist với đúng tx, hồ sơ không hợp lệ ⇒ 409
			const real = pcs.lockWaitlist;
			const seen = [];
			pcs.lockWaitlist = async (x) => (seen.push(x === tx), real(x));
			try {
				await assert.rejects(
					wts.transfer('KHONG_CO', ['KHONG_CO'], actor.id),
					/Không còn hồ sơ chờ hợp lệ/,
				);
			} finally {
				pcs.lockWaitlist = real;
			}
			assert.deepEqual(seen, [true]);
		},
	);

	await step('updateReturning: trả old./new. của dòng vừa sửa, không khớp thì rỗng', async () => {
		const run1 = (step) =>
			new sql.Request(tx)
				.input('id', sql.VarChar(20), actor.id)
				.input('step', sql.BigInt, step)
				.query(
					db.updateReturning(
						'UPDATE users SET totp_last_step = @step',
						'id = @id AND (totp_last_step IS NULL OR totp_last_step < @step)',
						[
							['new.id', 'id', 'VARCHAR(20)'],
							['old.totp_last_step', 'prev', 'BIGINT'],
							['new.totp_last_step', 'cur', 'BIGINT'],
						],
					),
				);
		await q('UPDATE users SET totp_last_step = NULL WHERE id = @id', { id: actor.id });
		const a = (await run1(100)).recordset;
		assert.equal(a.length, 1);
		assert.equal(a[0].id, actor.id);
		assert.equal(a[0].prev, null);
		assert.equal(Number(a[0].cur), 100);
		// Cùng bước ⇒ không sửa được (mã TOTP dùng lại)
		assert.equal((await run1(100)).recordset.length, 0);
		const b = (await run1(101)).recordset;
		assert.equal(Number(b[0].prev), 100);
	});

	// Cột BIT (SQL Server) / boolean (PG) so với chữ 'true' / 'false' — viết chung 2 DB
	// Giờ VN lưu không kèm múi giờ, JS đọc như UTC (mục 4.3 kế hoạch PG)
	await step('nowSql / utcNowSql / vnTodaySql: giờ VN, giờ UTC, ngày VN', async () => {
		const [r] = await q(
			`SELECT ${db.nowSql} AS vn, ${db.utcNowSql} AS utc, ${db.vnTodaySql} AS today,
              CAST(${db.nowSql} AS DATE) AS vn_date`,
		);
		const hours = (r.vn.getTime() - r.utc.getTime()) / 3600000;
		assert.ok(Math.abs(hours - 7) < 0.01, `lệch ${hours} giờ`);
		assert.ok(Math.abs(r.utc.getTime() - Date.now()) < 5 * 60000, 'utcNowSql lệch giờ máy');
		const { todayKeyVN } = require('../src/utils/vnDate');
		assert.equal(r.today.toISOString().slice(0, 10), todayKeyVN());
		assert.equal(r.vn_date.toISOString().slice(0, 10), todayKeyVN());
		// Ghi / so sánh với cột thời gian
		await q(`UPDATE users SET updated_at = ${db.nowSql} WHERE id = @id`, { id: actor.id });
		// Giờ VN đi trước giờ UTC 7 tiếng (không so <= nowSql: trigger audit của users
		// có thể ghi lại updated_at chính xác hơn mức làm tròn 3ms của GETDATE())
		const [u] = await q(
			`SELECT updated_at FROM users WHERE id = @id AND updated_at > ${db.utcNowSql}`,
			{ id: actor.id },
		);
		assert.ok(Math.abs(u.updated_at.getTime() - r.vn.getTime()) < 60000);
	});

	// TOP n → ORDER BY … OFFSET 0 ROWS FETCH NEXT n ROWS ONLY / EXISTS (chạy cả 2 DB)
	await step('TOP n đã đổi: FETCH NEXT, EXISTS', async () => {
		const users = await require('../src/modules/users/userService').searchForMember({
			q: '',
			limit: 3,
		});
		assert.ok(users.data.length >= 1 && users.data.length <= 3);
		const events = await require('../src/modules/audit/securityEventService').getAll({
			limit: 2,
		});
		assert.ok(events.data.length <= 2);
		assert.equal(
			typeof (await require('../src/modules/topics/workflowEngineService').hasActiveDefinition(
				'topic',
			)),
			'boolean',
		);
	});

	await step('xoá thông báo cũ theo lô (DELETE … WHERE id IN (… FETCH NEXT))', async () => {
		const [n0] = await q(`SELECT COUNT(*) AS n FROM notifications`);
		const deleted = await require('../src/jobs/notificationCleanupJob').deleteBatch();
		const [n1] = await q(`SELECT COUNT(*) AS n FROM notifications`);
		assert.equal(Number(n0.n) - Number(n1.n), deleted);
	});

	// CROSS / OUTER APPLY qua crossApply / outerApply của adapter (PG: JOIN LATERAL)
	await step(
		'crossApply / outerApply: giữ / bỏ dòng đúng, dịch vụ dùng APPLY chạy được',
		async () => {
			const [r] = await q(`
      SELECT COUNT(*) AS n, COUNT(x.id) AS has_user, COUNT(z.none) AS none_n
      FROM roles r
      ${db.crossApply('SELECT COUNT(*) AS n FROM users u WHERE u.role_id = r.id', 'uc')}
      ${db.outerApply(
				'SELECT u.id FROM users u WHERE u.role_id = r.id ORDER BY u.id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
				'x',
			)}
      ${db.outerApply('SELECT 1 AS none FROM users u WHERE 1 = 0', 'z')}`);
			const [{ n: roles }] = await q('SELECT COUNT(*) AS n FROM roles');
			assert.equal(Number(r.n), Number(roles)); // outerApply rỗng vẫn giữ dòng
			assert.equal(Number(r.none_n), 0);
			const [e] = await q(
				`SELECT COUNT(*) AS n FROM roles r ${db.crossApply('SELECT u.id FROM users u WHERE 1 = 0', 'e')}`,
			);
			assert.equal(Number(e.n), 0); // crossApply rỗng bỏ dòng
			const roleRows = await require('../src/modules/access/roleService').getAll({ limit: 3 });
			assert.ok((roleRows.data ?? roleRows).every((x) => Number.isInteger(Number(x.user_count))));
			await require('../src/modules/cme/cmeRequirementService').getComplianceReport(2026);
			await require('../src/modules/attendance/leaveRequestService').list({});
			await require('../src/modules/rounds/roundService').getAll({});
		},
	);

	// DATEADD / DATEDIFF qua dateAdd / dateDiff của adapter (PG: interval, date_trunc)
	await step('dateAdd / dateDiff: cộng trừ, mốc ranh giới, cuối tháng', async () => {
		const { dateAdd: add, dateDiff: diff, nowSql } = db;
		const req = new sql.Request(tx)
			.input('a', sql.DateTime2, new Date('2026-01-01T23:59:30Z'))
			.input('b', sql.DateTime2, new Date('2026-01-02T00:01:10Z'))
			.input('days', sql.Int, 3)
			.input('d', sql.Date, new Date('2026-03-31T00:00:00Z'));
		const [r] = (
			await req.query(`
        SELECT ${diff('DAY', '@a', '@b')} AS day_boundary, ${diff('SECOND', '@a', '@b')} AS sec,
               ${diff('MINUTE', '@a', '@b')} AS min_boundary,
               ${diff('DAY', add('DAY', '-@days', nowSql), nowSql)} AS minus_days,
               ${add('MINUTE', 90, '@a')} AS plus_90m, ${add('MONTH', -1, '@d')} AS month_back,
               CASE WHEN @b >= ${add('DAY', 1, '@d')} THEN 1 ELSE 0 END AS after_next_day`)
		).recordset;
		assert.equal(Number(r.day_boundary), 1); // 23:59 → 00:01 hôm sau
		assert.equal(Number(r.sec), 100);
		assert.equal(Number(r.min_boundary), 2);
		assert.equal(Number(r.minus_days), 3);
		assert.equal(r.plus_90m.toISOString(), '2026-01-02T01:29:30.000Z');
		assert.equal(r.month_back.toISOString().slice(0, 10), '2026-02-28'); // 31/3 lùi 1 tháng
		assert.equal(Number(r.after_next_day), 0);
		assert.throws(() => add('WEEK', 1, '@a'));
		// Dịch vụ dùng dateAdd (hạn bổ sung đề tài)
		await require('../src/jobs/supplementDeadlineJob').findOverdue(new Date());
	});

	// CONVERT / YEAR / TRY_CAST qua formatDate / datePart / tryCastInt của adapter
	await step(
		'formatDate / datePart / tryCastInt: chuỗi ngày, năm-tháng, ép số an toàn',
		async () => {
			const { formatDate: fd, datePart: dp, tryCastInt: ti } = db;
			const [r] = (
				await new sql.Request(tx)
					.input('t', sql.DateTime2, new Date('2026-03-05T07:08:09Z'))
					.input('s1', sql.VarChar(20), ' 42 ')
					.input('s2', sql.VarChar(20), 'A12')
					.input('s3', sql.VarChar(20), '12345678901').query(`
        SELECT ${fd('@t', 'DD/MM/YYYY')} AS f1, ${fd('@t', 'YYYY-MM-DD')} AS f2,
               ${fd('@t', 'YYYY-MM')} AS f3, ${fd('@t', 'YYYY-MM-DD HH:MI')} AS f4,
               ${dp('YEAR', '@t')} AS y, ${dp('MONTH', '@t')} AS m, ${dp('DAY', '@t')} AS d,
               ${ti('@s1')} AS i1, ${ti('@s2')} AS i2, ${ti('@s3')} AS i3`)
			).recordset;
			assert.deepEqual(
				{ ...r, y: Number(r.y), m: Number(r.m), d: Number(r.d) },
				{
					f1: '05/03/2026',
					f2: '2026-03-05',
					f3: '2026-03',
					f4: '2026-03-05 07:08',
					y: 2026,
					m: 3,
					d: 5,
					i1: 42,
					i2: null,
					i3: null, // tràn INT ⇒ NULL như TRY_CAST
				},
			);
			assert.throws(() => fd('@t', /** @type {any} */ ('MM/YYYY')));
			// Nhóm theo tháng và báo cáo đào tạo theo năm
			const g = await q(`SELECT ${fd('created_at', 'YYYY-MM')} AS month, COUNT(*) AS n FROM users
      GROUP BY ${fd('created_at', 'YYYY-MM')} ORDER BY month`);
			assert.ok(g.length >= 1 && /^\d{4}-\d{2}$/.test(g[0].month));
			const report = require('../src/modules/training/reports/trainingReportService');
			await report.courses(2026);
			await report.trainees(2026);
		},
	);

	await step("cột BIT so / gán bằng 'true' / 'false': WHERE, SET, CASE, SUM", async () => {
		const [cnt] = await q(`
      SELECT SUM(CASE WHEN is_active = 'true' THEN 1 ELSE 0 END) AS on_n,
             SUM(CASE WHEN is_active <> 'true' THEN 1 ELSE 0 END) AS off_n,
             COUNT(*) AS n
      FROM users`);
		assert.equal(Number(cnt.on_n) + Number(cnt.off_n), Number(cnt.n));
		assert.ok(Number(cnt.on_n) >= 1);
		await q("UPDATE users SET totp_enabled = 'true' WHERE id = @id", { id: actor.id });
		const [u] = await q("SELECT totp_enabled FROM users WHERE id = @id AND totp_enabled = 'true'", {
			id: actor.id,
		});
		assert.equal(Boolean(u?.totp_enabled), true);
		await q("UPDATE users SET totp_enabled = 'false' WHERE id = @id", { id: actor.id });
		const [off] = await q(
			"SELECT COUNT(*) AS n FROM users WHERE id = @id AND totp_enabled = 'false'",
			{ id: actor.id },
		);
		assert.equal(Number(off.n), 1);
		// Hàm dịch vụ đã đổi: lọc người phản biện ngoài đang hoạt động
		const reviewers = await require('../src/modules/catalog/externalReviewerService').getAll();
		assert.ok(reviewers.every((r) => Boolean(r.is_active)));
	});

	await step('danh mục / cấp độ / vai trò: mã <PREFIX>NN kế tiếp', async () => {
		const cat = await require('../src/modules/catalog/categoryService').create(
			{ name: 'Danh mục thử', abbr: 'DMT' },
			actor.id,
		);
		assert.match(cat.id, /^LDT\d{2}$/);
		assert.equal(cat.name, 'Danh mục thử');
		const lvl = await require('../src/modules/catalog/levelService').create(
			{ name: 'Cấp độ thử' },
			actor.id,
		);
		assert.match(lvl.id, /^CD\d{2}$/);
		const lvl2 = await require('../src/modules/catalog/levelService').create(
			{ name: 'Cấp độ thử 2' },
			actor.id,
		);
		assert.equal(Number(lvl2.id.slice(2)), Number(lvl.id.slice(2)) + 1);
		const role = await require('../src/modules/access/roleService').create(
			{ name: 'Vai trò thử' },
			actor.id,
		);
		assert.match(role.id, /^VT\d{2}$/);
	});

	await step('danh sách phân trang tách câu: dữ liệu + tổng + thống kê', async () => {
		const roles = await require('../src/modules/access/roleService').getAll({ limit: 2 });
		assert.ok(roles.data.length <= 2);
		assert.ok(Number(roles.pagination.total) >= roles.data.length);
		assert.ok(Number(roles.stats.total) >= 1);
		const users = await require('../src/modules/users/userService').getAll({
			limit: 5,
		});
		assert.ok(users.data.length <= 5);
		assert.equal(typeof users.role_counts, 'object');
	});

	await step('dashboard: các lô thống kê đã tách chạy được', async () => {
		const dash = require('../src/modules/dashboard/dashboardService');
		const s = await dash.getStats(null);
		assert.equal(typeof s.summary, 'object');
		const o = await dash.getOverviewStats();
		assert.equal(o.monthly_activity.length, 12);
		assert.equal(Number(o.kpi.current_year), new Date().getFullYear());
		const sem = await dash.getSeminarStats();
		assert.equal(sem.monthly.length, 12);
	});

	await step('vòng thực hành: đổi chỗ, học lại, thêm khoa giữ đúng thứ tự', async () => {
		const [two] = await q(`
      SELECT enrollment_id FROM enrollment_rotations
      GROUP BY enrollment_id HAVING COUNT(*) >= 2 ORDER BY enrollment_id`);
		if (!two) return;
		const svc = require('../src/modules/training/courses/enrollmentRotationService');
		const rows = () =>
			q(
				'SELECT id, lesson_id, seq FROM enrollment_rotations WHERE enrollment_id = @e ORDER BY seq, id',
				{
					e: two.enrollment_id,
				},
			);
		const before = await rows();
		await svc.move(before[1].id, true, actor.id);
		const moved = await rows();
		assert.equal(moved[0].id, before[1].id);
		assert.equal(moved[1].id, before[0].id);

		await svc.retake(moved[0].id, actor.id);
		const after = await rows();
		assert.equal(after.length, before.length + 1);
		assert.equal(after[1].lesson_id, moved[0].lesson_id); // dòng học lại ngay sau
		assert.equal(after[2].id, moved[1].id);

		await svc.addSegment(two.enrollment_id, after[after.length - 1].lesson_id, actor.id);
		const seg = await rows();
		assert.equal(seg.length, after.length + 1);
		assert.deepEqual(
			seg.map((r) => r.seq),
			[...seg.map((r) => r.seq)].sort((a, b) => a - b),
		);
	});

	await step('đồng bộ bài học của chương trình vào hồ sơ: chép đủ, chạy lại thì 0', async () => {
		const [e] = await q(
			`
      SELECT e.id, COUNT(*) AS n FROM course_enrollments e
      JOIN lesson_programs lp ON lp.program_id = e.program_id
      JOIN program_lessons pl ON pl.id = lp.lesson_id AND pl.lesson_kind = 'theory' AND pl.is_active = @on
      GROUP BY e.id ORDER BY e.id`,
			{ on: true },
		);
		if (!e) return;
		await q('DELETE FROM enrollment_lessons WHERE enrollment_id = @id', { id: e.id });
		const svc = require('../src/modules/training/courses/enrollmentProgramService');
		assert.equal((await svc.syncLessons(e.id)).added, Number(e.n));
		assert.equal((await svc.syncLessons(e.id, { replace: true })).added, 0);
		const [{ n }] = await q(
			'SELECT COUNT(*) AS n FROM enrollment_lessons WHERE enrollment_id = @id',
			{
				id: e.id,
			},
		);
		assert.equal(Number(n), Number(e.n));
	});

	await step('khoá tài khoản học viên: tắt is_active của tài khoản gắn với hồ sơ', async () => {
		let [tr] = await q(
			`
      SELECT t.id, t.user_id FROM trainees t JOIN users u ON u.id = t.user_id
      WHERE u.is_active = @on ORDER BY t.id`,
			{ on: true },
		);
		if (!tr) {
			// DB chưa có học viên có tài khoản: gắn tạm 1 tài khoản đang hoạt động (rollback sau)
			const [t0] = await q('SELECT id FROM trainees ORDER BY id');
			const [u0] = await q(
				`SELECT id FROM users u WHERE is_active = @on
           AND NOT EXISTS (SELECT 1 FROM trainees t WHERE t.user_id = u.id) ORDER BY id`,
				{ on: true },
			);
			if (!t0 || !u0) return;
			await q('UPDATE trainees SET user_id = @u WHERE id = @t', { u: u0.id, t: t0.id });
			tr = { id: t0.id, user_id: u0.id };
		}
		await require('../src/modules/training/trainees/traineeAccountService').lockAccountOf(
			tr.id,
			actor.id,
		);
		const [u] = await q('SELECT is_active FROM users WHERE id = @id', { id: tr.user_id });
		assert.equal(!!u.is_active, false);
	});

	await step('xoá buổi học: đọc khóa / bài rồi xoá dòng', async () => {
		const [s] = await q('SELECT id FROM class_sessions ORDER BY id');
		if (!s) return;
		await q('DELETE FROM attendance WHERE session_id = @id', { id: s.id });
		await require('../src/modules/training/courses/classSessionService').removeSession(
			s.id,
			actor.id,
		);
		assert.equal((await q('SELECT id FROM class_sessions WHERE id = @id', { id: s.id })).length, 0);
	});

	// @@ROWCOUNT → rowsAffected[0] của câu ghi; "IF @@ROWCOUNT = 0 INSERT" → sửa rồi thêm bằng JS.
	const [ct] = await q(`
    SELECT c.id AS council_id, t.id AS topic_id FROM councils c
    JOIN topics t ON 1 = 1 ORDER BY c.id, t.id`);
	const assignCouncil = async () => {
		await q(
			`UPDATE topics SET round_id = (SELECT round_id FROM councils WHERE id = @c), council_id = NULL
       WHERE id = @t`,
			{ c: ct.council_id, t: ct.topic_id },
		);
		const svc = require('../src/modules/councils/councilAssignmentService');
		return svc.assignTopics(ct.council_id, [ct.topic_id, 'KHONG_CO'], actor.id);
	};

	await step(
		'rowsAffected: gán đề tài, ghế thay, kết luận hội đồng, nộp lại, xoá khoa',
		async () => {
			if (ct) {
				assert.deepEqual(await assignCouncil(), { assigned: 1 });
				const svc = require('../src/modules/councils/councilAssignmentService');
				const seats = () =>
					q('SELECT role, user_id FROM council_seat_substitutes WHERE topic_id = @t', {
						t: ct.topic_id,
					});
				await svc.setSeatSubstitute(ct.council_id, ct.topic_id, 'chairman', actor.id, actor.id);
				await svc.setSeatSubstitute(ct.council_id, ct.topic_id, 'chairman', actor.id, actor.id);
				assert.deepEqual(await seats(), [{ role: 'chairman', user_id: actor.id }]);
				await assert.rejects(
					svc.setSeatSubstitute('KHONG_CO', ct.topic_id, 'member', actor.id, actor.id),
					/không thuộc hội đồng/,
				);

				// Xoá ghế thay: sai hội đồng thì không xoá, đúng thì xoá (đặt lại cho bước dưới)
				await svc.removeSeatSubstitute('KHONG_CO', ct.topic_id, 'chairman', actor.id);
				assert.equal((await seats()).length, 1);
				await svc.removeSeatSubstitute(ct.council_id, ct.topic_id, 'chairman', actor.id);
				assert.deepEqual(await seats(), []);
				await svc.setSeatSubstitute(ct.council_id, ct.topic_id, 'chairman', actor.id, actor.id);

				// actor giữ ghế chủ tịch (ghế thay) → chốt kết luận 2 lần: thêm rồi sửa, vẫn 1 dòng
				const progress = require('../src/modules/councils/councilProgressService');
				await progress.upsertResult(ct.topic_id, actor.id, { conclusion: 'pass' });
				await progress.upsertResult(ct.topic_id, actor.id, { conclusion: 'revise' });
				assert.deepEqual(
					await q('SELECT conclusion FROM council_topic_results WHERE topic_id = @t', {
						t: ct.topic_id,
					}),
					[{ conclusion: 'revise' }],
				);
				await progress.upsertReview(ct.topic_id, actor.id, { progress_percent: 10 });
				await progress.upsertReview(ct.topic_id, actor.id, { progress_percent: 40 });
				const reviews = await q(
					'SELECT progress_percent FROM council_progress_reviews WHERE topic_id = @t',
					{ t: ct.topic_id },
				);
				assert.deepEqual(
					reviews.map((r) => Number(r.progress_percent)),
					[40],
				);

				// Nộp lại: chỉ khi đề tài đang 'supplement' mới đưa phiếu duyệt về 'pending'
				const notif = require('../src/modules/notifications/notificationService');
				const realPush = notif.pushWithEmail;
				notif.pushWithEmail = async () => {};
				t.after(() => {
					notif.pushWithEmail = realPush;
				});
				const approvalSvc = require('../src/modules/topics/topicApprovalService');
				const approvals = () =>
					q('SELECT status FROM approvals WHERE topic_id = @t', { t: ct.topic_id });
				await q("UPDATE approvals SET status = 'approved' WHERE topic_id = @t", { t: ct.topic_id });
				await q("UPDATE topics SET status = 'submitted' WHERE id = @t", { t: ct.topic_id });
				await approvalSvc.submit(ct.topic_id, actor.id);
				for (const a of await approvals()) assert.equal(a.status, 'approved');
				await q("UPDATE topics SET status = 'supplement' WHERE id = @t", { t: ct.topic_id });
				await approvalSvc.submit(ct.topic_id, actor.id);
				for (const a of await approvals()) assert.equal(a.status, 'pending');
				const [tp] = await q('SELECT status FROM topics WHERE id = @t', { t: ct.topic_id });
				assert.equal(tp.status, 'submitted');
			}

			// Xoá khoa: các câu gỡ liên kết chạy lần lượt trong cùng transaction
			const [d] = await q(`
      SELECT d.id FROM departments d
      WHERE EXISTS (SELECT 1 FROM users u WHERE u.department_id = d.id) ORDER BY d.id`);
			if (d) {
				await require('../src/modules/catalog/departmentService').remove(d.id, actor.id);
				assert.equal(
					(await q('SELECT id FROM departments WHERE id = @id', { id: d.id })).length,
					0,
				);
				const left = await q('SELECT id FROM users WHERE department_id = @id', { id: d.id });
				assert.equal(left.length, 0);
			}
		},
	);

	await step('đặt buổi bảo vệ: sai hội đồng thì 404', async () => {
		if (!ct) return;
		await assignCouncil();
		const svc = require('../src/modules/councils/councilAssignmentService');
		await svc.setTopicSession(ct.council_id, ct.topic_id, 'morning', actor.id);
		await assert.rejects(
			svc.setTopicSession('KHONG_CO', ct.topic_id, 'morning', actor.id),
			/không thuộc hội đồng/,
		);
		// Cột session (trước là `[session]`) đọc lại được ở mọi chỗ
		const mine = (rows) => rows.find((x) => x.id === ct.topic_id)?.session;
		assert.equal(mine(await svc.getTopics(ct.council_id)), 'morning');
		const council = await require('../src/modules/councils/councilService').getById(ct.council_id);
		assert.equal(mine(council.topics), 'morning');
		const [{ round_id }] = await q('SELECT round_id FROM councils WHERE id = @c', {
			c: ct.council_id,
		});
		const exp = require('../src/modules/councils/councilExportRepository');
		assert.equal(mine(await exp.listTopics(round_id)), 'morning');
		assert.ok(Array.isArray(await svc.getUnassignedTopics(round_id)));
		const progress = require('../src/modules/councils/councilProgressService');
		assert.ok(await progress.getMyProgress(actor.id));
	});

	await step('alias là từ khoá: "open" của tập huấn bệnh viện', async () => {
		const self = require('../src/modules/seminars/hospitalTrainingSelfService');
		// Biến 1 hội thảo bất kỳ thành tập huấn bệnh viện chưa có ngày (rollback sau)
		const [s] = await q('SELECT id FROM seminars ORDER BY id');
		if (s) {
			await q(
				`UPDATE seminars SET event_type = 'training', scope = 'hosted', start_date = NULL, end_date = NULL
         WHERE id = @id`,
				{ id: s.id },
			);
			const row = (await self.listForMe(actor.id)).find((x) => x.id === s.id);
			assert.ok(row);
			assert.equal(!!row.open, true);
		}
	});

	await step(
		'rowsAffected: trạng thái bài học, hoàn thành thực hành, chép vòng, thu hồi',
		async () => {
			// Tính lại trạng thái bài: lần 2 không còn gì để đổi
			const lesson = require('../src/modules/training/courses/lessonProgressService');
			const [c] = await q(`
      SELECT e.course_id FROM course_enrollments e
      WHERE EXISTS (SELECT 1 FROM enrollment_lessons el WHERE el.enrollment_id = e.id)
      ORDER BY e.course_id`);
			if (c) {
				// Làm lệch 1 dòng để chắc có ít nhất 1 dòng đổi
				await q(
					`UPDATE enrollment_lessons SET status = 'in_progress', completed_at = NULL
         WHERE enrollment_id = (SELECT MIN(e.id) FROM course_enrollments e
                                JOIN enrollment_lessons el ON el.enrollment_id = e.id
                                WHERE e.course_id = @c)`,
					{ c: c.course_id },
				);
				assert.ok((await lesson.recompute({ courseId: c.course_id })) > 0);
				assert.equal(await lesson.recompute({ courseId: c.course_id }), 0);
			}

			const practice = require('../src/modules/training/courses/practiceAutoService');
			assert.equal(typeof (await practice.completeFinished()), 'number');
			assert.equal(await practice.completeFinished(), 0);

			const rot = require('../src/modules/training/courses/enrollmentRotationService');
			const [e] = await q('SELECT id FROM course_enrollments ORDER BY id');
			if (e) {
				const n1 = await rot.carryOver(e.id, actor.id);
				assert.equal(typeof n1, 'number');
				assert.equal(await rot.carryOver(e.id, actor.id), 0);
			}
			await assert.rejects(rot.update('KHONG_CO', { note: 'x' }, actor.id), /Không tìm thấy/);

			const certs = require('../src/modules/training/courses/certificateRepository');
			assert.equal(await certs.revoke({ certId: 'KHONG_CO', reason: null, actorId: actor.id }), 0);

			const cme = require('../src/modules/seminars/seminarCmeService');
			assert.deepEqual(await cme.setCmeStatus('KHONG_CO', ['KHONG_CO'], 'signed', actor.id), {
				updated: 0,
			});
		},
	);

	// OUTPUT INSERTED / DELETED → insertReturning / updateReturning (chuỗi) / deleteReturning
	await step(
		'insertReturning / updateReturning / deleteReturning: dòng mới, giá trị cũ',
		async () => {
			const run1 = (text) => new sql.Request(tx).query(text).then((r) => r.recordset);
			const [ins] = await run1(
				db.insertReturning(
					'INSERT INTO shift_patterns (name, days, is_default)',
					"VALUES (N'Mẫu thử', '{}', 'false')",
					'new.*',
				),
			);
			assert.equal(ins.name, 'Mẫu thử');
			assert.ok(ins.id);
			const [up] = await run1(
				db.updateReturning(
					"UPDATE shift_patterns SET name = N'Mẫu thử 2'",
					`id = ${Number(ins.id)}`,
					'old.name AS old_name, new.name AS name, new.id',
				),
			);
			assert.deepEqual({ ...up }, { old_name: 'Mẫu thử', name: 'Mẫu thử 2', id: ins.id });
			assert.deepEqual(
				await run1(db.updateReturning("UPDATE shift_patterns SET name = 'x'", '1 = 0', 'new.id')),
				[],
			);
			const del = await run1(
				db.deleteReturning('DELETE FROM shift_patterns', `id = ${Number(ins.id)}`, 'old.name'),
			);
			assert.deepEqual(
				del.map((r) => r.name),
				['Mẫu thử 2'],
			);

			// Dịch vụ dùng các helper
			const shifts = require('../src/modules/attendance/shiftService');
			const p = await shifts.savePattern(null, { name: 'Mẫu thử', days: {}, is_default: false });
			assert.equal(p.name, 'Mẫu thử');
			const p2 = await shifts.savePattern(p.id, { name: 'Mẫu đổi', days: {}, is_default: false });
			assert.equal(p2.name, 'Mẫu đổi');
			await assert.rejects(
				shifts.savePattern(-1, { name: 'x', days: {}, is_default: false }),
				/Không tìm thấy/,
			);

			const cmeRecords = require('../src/modules/cme/cmeRecordService');
			const [rec] = await q('SELECT id FROM cme_records ORDER BY id');
			assert.deepEqual(await cmeRecords.removeMany(['KHONG_CO'], actor.id), { deleted: 0 });
			if (rec) {
				assert.deepEqual(await cmeRecords.removeMany([rec.id], actor.id), { deleted: 1 });
				assert.equal(
					(await q('SELECT id FROM cme_records WHERE id = @id', { id: rec.id })).length,
					0,
				);
			}

			const bank = require('../src/modules/training/exams/questionBankService');
			await bank.removeQuestion('KHONG_CO');
			const [used] = await q(
				'SELECT question_id AS id FROM exam_paper_questions ORDER BY question_id',
			);
			if (used) await assert.rejects(bank.removeQuestion(used.id), /đang được dùng/);
		},
	);

	await step('person mới: mã PS + 8 số lấy từ sequence', async () => {
		const [u] = await q('SELECT id, person_id FROM users WHERE person_id IS NOT NULL ORDER BY id');
		if (!u) return;
		// Tách khỏi person cũ, đổi thông tin để không khớp person nào → phải tạo mới
		await q(
			"UPDATE persons SET origin_id = CONCAT(origin_id, '_cu') WHERE origin_table = 'users' AND origin_id = @id",
			{ id: u.id },
		);
		await q(
			`UPDATE users SET person_id = NULL, full_name = N'Người thử mã PS', email = NULL,
         phone_number = NULL, date_of_birth = NULL WHERE id = @id`,
			{ id: u.id },
		);
		const pid = await require('../src/modules/persons/personService').syncPerson('users', u.id, {
			actorId: actor.id,
		});
		assert.match(String(pid), /^PS\d{8}$/);
		assert.notEqual(pid, u.person_id);
		const [p] = await q('SELECT origin_id FROM persons WHERE id = @id', { id: pid });
		assert.equal(p.origin_id, u.id);
	});

	// Cột boolean nhận 'true' / 'false' (PG không tự ép số 1 / 0 vào boolean khi INSERT, CASE).
	// Chỉ gọi hàm chạy trong withTransaction (đã thay bằng tx rollback) — grantAccounts của
	// học viên / thành viên đề tài tự mở transaction riêng nên không gọi ở đây.
	await step('boolean: tài khoản mới bắt đổi mật khẩu, ứng viên giảng viên', async () => {
		const personSvc = require('../src/modules/persons/personService');
		const realSync = personSvc.syncPerson;
		// Ca này chỉ kiểm boolean — đồng bộ hồ sơ (personService) đã có ca "person mới" / "gộp hồ sơ"
		personSvc.syncPerson = async () => null;
		try {
			const users = require('../src/modules/users/userService');
			const mustChange = async (id) =>
				(await q('SELECT must_change_password AS m FROM users WHERE id = @id', { id }))[0].m;
			const u1 = await users.create({ username: 'zz_bool_test', full_name: 'ZZ Bool' }, actor.id);
			assert.equal(!!(await mustChange(u1.id)), true);
			const u2 = await users.createStaffAccount({ full_name: 'ZZ Bool Hai' }, actor.id);
			assert.equal(!!(await mustChange(u2.id)), true);
		} finally {
			personSvc.syncPerson = realSync;
		}

		// UNION cột boolean với hằng (trước là CAST(0 AS BIT) + nối chuỗi bằng +)
		const lec = require('../src/modules/training/courses/lecturerAssignmentService');
		const [c] = await q('SELECT id FROM courses ORDER BY id');
		if (c) {
			const list = await lec.listLecturerCandidates(c.id);
			for (const r of list) assert.equal(typeof r.is_external, 'boolean');
			for (const r of list.filter((x) => x.group === 'staff')) {
				assert.match(r.id, /^user:/);
				assert.equal(r.is_external, false);
			}
		}
	});

	// LIKE '[0-9]' / '[_]' (lớp ký tự chỉ SQL Server có) → LIKE thô + lọc JS, LEFT(x, n) = '...'
	await step(
		'LIKE không lớp ký tự: tài khoản khoa, mã HV, tên đăng nhập học viên, NHD',
		async () => {
			const { isDeptAccountSql } = require('../src/utils/deptAccount');
			const dept = await q(`
      SELECT u.id FROM (VALUES ('NV120000'), ('NV0000'), ('NV000'), ('NV120001'), ('HV120000')) AS u(id)
      WHERE ${isDeptAccountSql('u')} ORDER BY u.id`);
			assert.deepEqual(
				dept.map((r) => r.id),
				['NV0000', 'NV120000'],
			);

			const acc = require('../src/modules/training/trainees/traineeAccountService');
			// Mã HV kế tiếp = số lớn nhất của 'HV' + đúng 6 chữ số, + 1
			const hv = await q("SELECT id FROM users WHERE id LIKE 'HV%'");
			const maxHv = Math.max(0, ...hv.map((r) => /^HV(\d{6})$/.exec(r.id)?.[1] ?? 0).map(Number));
			assert.equal(await acc.genTraineeUserIdInTx(tx), `HV${String(maxHv + 1).padStart(6, '0')}`);

			// Tên đăng nhập: thấy NVZ_0001 đã có (mẫu `[_]` trên PG không khớp ⇒ cấp trùng)
			const { ROLE, requireRoleId } = require('../src/modules/access/roleCodes');
			const traineeRole = await requireRoleId(ROLE.TRAINEE);
			const first = await acc.genTraineeUsernameInTx(tx, 'Nguyễn Văn Zzz', traineeRole);
			assert.equal(first, 'NVZ_0001');
			const [other] = await q('SELECT id FROM users WHERE id <> @a ORDER BY id', { a: actor.id });
			await q('UPDATE users SET username = @u, role_id = @r WHERE id = @id', {
				u: first,
				r: traineeRole,
				id: other.id,
			});
			assert.equal(await acc.genTraineeUsernameInTx(tx, 'Nguyễn Văn Zzz', traineeRole), 'NVZ_0002');

			// NHD ứng viên theo nhóm bác sĩ (LEFT(code, 7) IN ('GPHN_BS', 'GPHN_YS'))
			// — so với tính bằng JS trên dữ liệu thô (arrangeOne chạy song song nhiều câu nên
			// không gọi được trong 1 transaction của test)
			const isDoctorCode = (c) => /^GPHN_(BS|YS)/i.test(c);
			const hist = await q(`
      SELECT r.department_id, r.mentor_user_id, tp.code FROM enrollment_rotations r
      JOIN course_enrollments e ON e.id = r.enrollment_id
      JOIN training_programs tp ON tp.id = e.program_id
      JOIN users u ON u.id = r.mentor_user_id AND u.is_active = 'true'
      WHERE r.department_id IS NOT NULL`);
			const practice = require('../src/modules/training/courses/practiceAutoService');
			const doctors = await practice.loadMentorCandidates(await db.getPool(), true);
			for (const h of hist.filter((x) => isDoctorCode(x.code)))
				assert.ok(doctors.get(h.department_id)?.includes(h.mentor_user_id));
			// Chương trình GPHN_ của nhập sổ thực hành
			const all = await q('SELECT code FROM training_programs');
			const gphn = await q("SELECT code FROM training_programs WHERE LEFT(code, 5) = 'GPHN_'");
			assert.deepEqual(
				gphn.map((r) => r.code).sort(),
				all
					.map((r) => r.code)
					.filter((c) => /^GPHN_/i.test(c))
					.sort(),
			);
		},
	);

	// IF EXISTS … THROW … INSERT → INSERT … SELECT … WHERE NOT EXISTS + rowsAffected
	await step('chặn trùng trong câu INSERT: chứng chỉ, ghi danh, gắn bài học', async () => {
		const [e] = await q(`
      SELECT e.id, e.course_id, e.trainee_id, e.program_id FROM course_enrollments e
      WHERE e.status = 'approved' AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.enrollment_id = e.id)
      ORDER BY e.id`);
		if (e) {
			const certs = require('../src/modules/training/courses/certificateRepository');
			const cert = await certs.insert({ enrollmentId: e.id, actorId: actor.id, year: 2026 });
			assert.match(cert.id, /^CH\d{12}$/);
			assert.match(cert.cert_no, /^CC2026/);
			assert.equal(cert.course_id, e.course_id);
			assert.equal(await certs.insert({ enrollmentId: e.id, actorId: actor.id, year: 2026 }), null);

			// Ghi danh lại đúng khóa + chương trình ⇒ 409 trùng (khóa cuốn chiếu: bỏ qua kiểm sĩ số lớp)
			await q("UPDATE courses SET is_rolling = 'true' WHERE id = @c", { c: e.course_id });
			const enroll = require('../src/modules/training/courses/courseEnrollmentService');
			await assert.rejects(
				enroll.registerTrainee(e.course_id, e.trainee_id, actor.id, {
					bypassWindow: true,
					programId: e.program_id,
				}),
				/đã ghi danh chương trình này|đã đăng ký khóa học/,
			);
		}

		const [pair] = await q(`
      SELECT pl.id AS lesson_id, tp.id AS program_id FROM program_lessons pl CROSS JOIN training_programs tp
      WHERE NOT EXISTS (SELECT 1 FROM lesson_programs x WHERE x.lesson_id = pl.id AND x.program_id = tp.id)
      ORDER BY pl.id, tp.id`);
		if (pair) {
			const lessons = require('../src/modules/training/programs/programLessonService');
			assert.ok((await lessons.linkLesson(pair.program_id, pair.lesson_id, 1, actor.id)).id);
			await assert.rejects(
				lessons.linkLesson(pair.program_id, pair.lesson_id, 1, actor.id),
				/đã được gắn vào chương trình/,
			);
		}
	});

	// DELETE alias FROM … (chỉ T-SQL) → DELETE FROM bảng WHERE … (tham chiếu bảng bằng tên đầy đủ);
	// removeLesson trước là 1 lô nhiều câu có tham số → từng câu trong withTransaction (tx rollback).
	await step('xoá bài học: bỏ phân công trùng dòng cả khóa, gỡ subject_id còn lại', async () => {
		const lessons = require('../src/modules/training/programs/programLessonService');
		const [c] = await q(`
      SELECT co.id AS course_id, l1.id AS x, l2.id AS y FROM courses co
      JOIN lecturers l1 ON NOT EXISTS (SELECT 1 FROM lecturer_assignments a WHERE a.course_id = co.id AND a.lecturer_id = l1.id)
      JOIN lecturers l2 ON l2.id > l1.id
        AND NOT EXISTS (SELECT 1 FROM lecturer_assignments a WHERE a.course_id = co.id AND a.lecturer_id = l2.id)
      ORDER BY co.id, l1.id, l2.id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`);
		if (!c) return;
		const { id: lessonId } = await lessons.createLesson({ title: 'ZZ xoá thử' }, actor.id);
		const pc = () => 'PC' + String(Math.floor(Math.random() * 1e12)).padStart(12, '0');
		const [byLesson, whole, other] = [pc(), pc(), pc()];
		await q(
			`INSERT INTO lecturer_assignments (id, course_id, lecturer_id, subject_id, role) VALUES
         (@a, @c, @x, @l, 'assistant'), (@b, @c, @x, NULL, 'main'), (@o, @c, @y, @l, 'main')`,
			{ a: byLesson, b: whole, o: other, c: c.course_id, x: c.x, y: c.y, l: lessonId },
		);

		await lessons.removeLesson(lessonId, actor.id);
		assert.deepEqual(await q('SELECT id FROM program_lessons WHERE id = @l', { l: lessonId }), []);
		const rows = await q(
			'SELECT id, subject_id FROM lecturer_assignments WHERE id IN (@a, @b, @o) ORDER BY id',
			{ a: byLesson, b: whole, o: other },
		);
		assert.deepEqual(
			rows.map((r) => [r.id, r.subject_id]),
			[
				[whole, null],
				[other, null],
			].sort(),
		);
	});

	// STRING_SPLIT (chỉ SQL Server) → jsonValues; lô SET XACT_ABORT / BEGIN TRAN … COMMIT → từng câu trong tx
	await step(
		'trùng lịch giảng viên (jsonValues), xoá chương trình đào tạo (từng câu)',
		async () => {
			const [c] = await q(`
      SELECT co.id AS course_id, l.id AS lecturer_id FROM courses co CROSS JOIN lecturers l
      WHERE co.status <> 'cancelled' ORDER BY co.id, l.id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`);
			if (c) {
				const { genClassSessionId } = require('../src/utils/idGenerator');
				const ids = [await genClassSessionId(tx), null];
				await q(
					`INSERT INTO class_sessions (id, course_id, lecturer_id, session_date, start_time, end_time, created_by)
         VALUES (@a, @c, @l, '2099-01-05', '08:00', '10:00', @u)`,
					{ a: ids[0], c: c.course_id, l: c.lecturer_id, u: actor.id },
				);
				ids[1] = await genClassSessionId(tx);
				await q(
					`INSERT INTO class_sessions (id, course_id, lecturer_id, session_date, start_time, end_time, created_by)
         VALUES (@b, @c, @l, '2099-01-05', '09:00', '11:00', @u)`,
					{ b: ids[1], c: c.course_id, l: c.lecturer_id, u: actor.id },
				);
				const sessions = require('../src/modules/training/courses/classSessionService');
				const { warnings } = await sessions.updateSession(ids[0], { room: 'ZZ' }, actor.id);
				assert.equal(warnings.length, 1);
				assert.match(warnings[0], /05\/01\/2099 09:00–11:00/);
			}

			const programs = require('../src/modules/training/programs/trainingProgramService');
			const p = await programs.create({ name: 'ZZ xoá thử' }, actor.id);
			await programs.remove(p.id, actor.id);
			assert.deepEqual(
				await q('SELECT id FROM training_programs WHERE id = @id', { id: p.id }),
				[],
			);
		},
	);

	// IF EXISTS … BEGIN … ELSE (rẽ nhánh T-SQL, PG không có) → SELECT kiểm tra rồi INSERT … VALUES, hoặc
	// UPDATE rồi INSERT khi 0 dòng (hạn nộp của đợt). Mã không tồn tại bị bỏ qua như trước.
	// (Không dùng INSERT … SELECT @x … WHERE cột = @x: PG suy @x là text ở SELECT, varchar ở WHERE ⇒ lỗi
	// "inconsistent types deduced"; CAST AS VARCHAR thì SQL Server mất dấu tiếng Việt ở cột NVARCHAR.)
	await step(
		'IF EXISTS → kiểm tra rồi INSERT: cấp độ, hạn nộp, buổi học hàng loạt, chương trình, danh mục',
		async () => {
			const [lvl] = await q(
				'SELECT id FROM levels ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
			);
			const [rt] = await q(
				'SELECT id FROM round_types ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
			);
			const [round] = await q(
				'SELECT id FROM research_rounds ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
			);
			if (lvl && rt) {
				const rts = require('../src/modules/catalog/roundTypeService');
				assert.deepEqual((await rts.setLevels(rt.id, [lvl.id, 'ZZZZZ'])).map(String), [
					String(lvl.id),
				]);
			}
			if (lvl && round) {
				await require('../src/modules/rounds/roundService').update(
					round.id,
					{ level_ids: [lvl.id, 'ZZZZZ'] },
					actor.id,
				);
				const rows = await q('SELECT level_id FROM research_round_levels WHERE round_id = @r', {
					r: round.id,
				});
				assert.deepEqual(
					rows.map((x) => String(x.level_id)),
					[String(lvl.id)],
				);
			}
			if (round) {
				const dl = require('../src/modules/rounds/deadlineService');
				const save = (name) =>
					dl.upsert(
						round.id,
						9,
						{ name, deadline_type: 'edit', deadline_date: '2099-03-01' },
						actor.id,
					);
				assert.equal((await save('ZZ hạn 1')).name, 'ZZ hạn 1');
				assert.equal((await save('ZZ hạn 2')).name, 'ZZ hạn 2');
				const n = await q(
					'SELECT COUNT(*) AS n FROM round_deadlines WHERE round_id = @r AND phase = 9',
					{ r: round.id },
				);
				assert.equal(Number(n[0].n), 1);
			}

			// Khóa mới tạo trong tx, chưa gắn chương trình nào (assertClassOpen bỏ qua)
			const co = { id: await require('../src/utils/idGenerator').genCourseId(tx) };
			await q(
				"INSERT INTO courses (id, name, status, created_by) VALUES (@id, 'ZZ khóa IF', 'draft', @u)",
				{
					id: co.id,
					u: actor.id,
				},
			);
			if (co) {
				const sessions = require('../src/modules/training/courses/classSessionService');
				const bulk = () =>
					sessions.createSessionsBulk(
						co.id,
						{
							start_date: '2099-02-02',
							end_date: '2099-02-08',
							weekdays: [1, 3],
							start_time: '07:30',
							end_time: '09:00',
						},
						actor.id,
					);
				const first = await bulk();
				assert.deepEqual([first.created, first.skipped], [2, 0]);
				const again = await bulk();
				assert.deepEqual([again.created, again.skipped], [0, 2]);

				const programs = require('../src/modules/training/programs/trainingProgramService');
				const [tt] = await q(
					'SELECT id FROM trainee_types ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
				);
				const p = await programs.create(
					{ name: 'ZZ CT IF', trainee_type_ids: tt ? [tt.id, 'ZZZZZ'] : [] },
					actor.id,
				);
				if (tt) {
					const types = await q(
						'SELECT trainee_type_id AS t FROM program_trainee_types WHERE program_id = @p',
						{ p: p.id },
					);
					assert.deepEqual(
						types.map((x) => x.t),
						[tt.id],
					);
				}
				// courseService.update → setPrograms (mã chương trình không tồn tại bị bỏ qua)
				await require('../src/modules/training/courses/courseService').update(
					co.id,
					{ program_ids: [p.id, 'ZZZZZ'] },
					actor.id,
				);
				const links = await q('SELECT program_id AS p FROM course_programs WHERE course_id = @c', {
					c: co.id,
				});
				assert.deepEqual(
					links.map((x) => x.p),
					[p.id],
				);

				const [lesson] = await q(
					'SELECT id FROM program_lessons ORDER BY id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
				);
				if (lesson) {
					const lessons = require('../src/modules/training/programs/programLessonService');
					await lessons.linkLessons(p.id, [lesson.id, 'ZZZZZ'], actor.id);
					const lp = await q('SELECT lesson_id AS l FROM lesson_programs WHERE program_id = @p', {
						p: p.id,
					});
					assert.deepEqual(
						lp.map((x) => x.l),
						[lesson.id],
					);
				}
			}

			// Danh mục thực hành: tên mới thêm 1 lần, gặp lại không thêm
			const writer = require('../src/modules/training/courses/practiceBookWriter');
			const recs = [{ professional_field: 'ZZ lĩnh vực thử' }];
			await writer.addToCatalogs(await db.getPool(), recs, actor.id);
			await writer.addToCatalogs(await db.getPool(), recs, actor.id);
			const pf = await q('SELECT COUNT(*) AS n FROM professional_fields WHERE name = @n', {
				n: recs[0].professional_field,
			});
			assert.equal(Number(pf[0].n), 1);
		},
	);

	// STRING_AGG(x, sep) WITHIN GROUP (ORDER BY o) → stringAgg(x, sep, o)
	await step('stringAgg: nối theo thứ tự, cột số, dịch vụ dùng stringAgg chạy được', async () => {
		// SQL Server: các STRING_AGG cùng 1 SELECT phải cùng thứ tự → câu riêng cho DESC
		const VALS = "FROM (VALUES ('b', 2), ('a', 1), ('c', 3)) AS x(v, o)";
		const [r] = await q(`
      SELECT ${db.stringAgg('x.v', ' / ', 'x.o')} AS asc_v, ${db.stringAgg('x.v', ', ')} AS any_v
      ${VALS}`);
		const [d] = await q(`SELECT ${db.stringAgg('x.o', ',', 'x.o DESC')} AS desc_o ${VALS}`);
		r.desc_o = d.desc_o;
		assert.equal(r.asc_v, 'a / b / c');
		assert.equal(r.desc_o, '3,2,1');
		assert.deepEqual(r.any_v.split(', ').sort(), ['a', 'b', 'c']);
		assert.throws(() => db.stringAgg('x', "'"), /không hợp lệ/);

		// Tóm tắt thành viên hội đồng theo thứ tự vai (CT trước)
		const councils = await require('../src/modules/councils/councilService').getAll({ limit: 5 });
		for (const c of councils.data) {
			if (c.members_summary) assert.match(c.members_summary, /^(CT|TK|PB1|PB2|TV): /);
		}

		// Khoa của bài học: đúng thứ tự display_order
		const [ld] = await q(`
      SELECT lesson_id FROM lesson_departments
      GROUP BY lesson_id HAVING COUNT(*) >= 2 ORDER BY lesson_id`);
		const lessons = require('../src/modules/training/programs/programLessonService');
		const all = await lessons.listAllLessons();
		if (ld) {
			const want = (
				await q(
					'SELECT department_id FROM lesson_departments WHERE lesson_id = @id ORDER BY display_order',
					{ id: ld.lesson_id },
				)
			).map((x) => x.department_id);
			const got = all.find((l) => l.id === ld.lesson_id);
			assert.deepEqual(
				Array.isArray(got.department_ids) ? got.department_ids : got.department_ids.split(','),
				want,
			);
		}
		const [lp] = await q('SELECT program_id FROM lesson_programs ORDER BY program_id');
		if (lp) {
			await lessons.listLessons(lp.program_id);
			const pool = await db.getPool();
			const rounds =
				await require('../src/modules/training/courses/enrollmentRotationService').loadRounds(
					pool,
					lp.program_id,
				);
			for (const x of rounds) assert.ok(Array.isArray(x.department_ids));
		}
	});

	// MERGE → upsert (SQL Server MERGE … WITH (HOLDLOCK), PG INSERT … ON CONFLICT)
	await step('upsert: thêm rồi sửa, nhiều dòng, merge_action, dịch vụ dùng upsert', async () => {
		const one = (v) =>
			new sql.Request(tx)
				.input('key', sql.VarChar(50), 'ZZ_UPSERT')
				.input('value', sql.NVarChar(sql.MAX), v)
				.query(
					db.upsert({
						table: 'system_settings',
						key: ['setting_key'],
						values: { setting_key: '@key', value: '@value' },
						update: { value: 'EXCLUDED.value', updated_at: db.nowSql },
						returning: 'new.setting_key, new.value',
						action: true,
					}),
				)
				.then((r) => ({ ...r.recordset[0] }));
		assert.deepEqual(await one('một'), {
			setting_key: 'ZZ_UPSERT',
			value: 'một',
			merge_action: 'INSERT',
		});
		assert.deepEqual(await one('hai'), {
			setting_key: 'ZZ_UPSERT',
			value: 'hai',
			merge_action: 'UPDATE',
		});
		const multi = await new sql.Request(tx).query(
			db.upsert({
				table: 'system_settings',
				key: ['setting_key'],
				source: "SELECT 'ZZ_UPSERT' AS k, N'ba' AS v UNION ALL SELECT 'ZZ_UPSERT2', N'bốn'",
				values: { setting_key: 'src.k', value: 'src.v' },
				update: { value: 'EXCLUDED.value' },
			}),
		);
		assert.equal(multi.rowsAffected[0], 2);
		assert.deepEqual(
			(
				await q(
					"SELECT value FROM system_settings WHERE setting_key LIKE 'ZZ_UPSERT%' ORDER BY setting_key",
				)
			).map((r) => r.value),
			['ba', 'bốn'],
		);
		// SQL Server thay EXCLUDED.x bằng giá trị thêm nên x phải có trong values (PG tự hiểu)
		if (db.client === 'mssql')
			assert.throws(
				() =>
					db.upsert({ table: 't', key: ['a'], values: { a: '@a' }, update: { b: 'EXCLUDED.b' } }),
				/EXCLUDED\.b/,
			);

		// Dịch vụ: gọi 2 lần vẫn 1 dòng, giá trị mới nhất
		const settings = require('../src/modules/settings/systemSettingService');
		await settings.update('ZZ_UPSERT3', 'x', actor.id);
		await settings.update('ZZ_UPSERT3', 'y', actor.id);
		assert.deepEqual(
			(await q("SELECT value FROM system_settings WHERE setting_key = 'ZZ_UPSERT3'")).map(
				(r) => r.value,
			),
			['y'],
		);
		const custom = require('../src/modules/forms/formCustomValueService');
		await custom.save('zz_form', 'R1', { a: 1 }, actor.id);
		await custom.save('zz_form', 'R1', { b: 2 }, actor.id);
		const cv = await q("SELECT data FROM form_custom_values WHERE form_key = 'zz_form'");
		assert.equal(cv.length, 1);
		assert.deepEqual(JSON.parse(cv[0].data), { a: 1, b: 2 });
		const seminars = require('../src/modules/seminars/seminarService');
		const [{ y }] = await q('SELECT COALESCE(MAX(cme_year), 2099) AS y FROM seminar_participants');
		await seminars.updateRegisterSeq(Number(y), 9000, actor.id);
		await seminars.updateRegisterSeq(Number(y), 9001, actor.id);
		const reg = await q('SELECT last_seq FROM cme_year_register WHERE year = @y', { y: Number(y) });
		assert.deepEqual(
			reg.map((r) => Number(r.last_seq)),
			[9001],
		);
		// Đọc lại theo cột year (trước là `[year]`)
		assert.equal(Number((await seminars.cmeRegister({ year: y })).last_seq), 9001);

		// CME tự động từ khóa: chạy lại thì cập nhật, không thêm dòng
		const courseCme = require('../src/modules/training/courses/courseCmeService');
		const [c] = await q('SELECT id FROM courses ORDER BY id');
		if (c) {
			const count = async () =>
				Number(
					(
						await q(
							"SELECT COUNT(*) AS n FROM cme_records WHERE source_id = @c AND source_type LIKE 'course_%'",
							{
								c: c.id,
							},
						)
					)[0].n,
				);
			// Có số tiết ⇒ GV có tài khoản được ghi CME (kiểm nhãn bên dưới)
			await q('UPDATE lecturer_assignments SET hours = 3 WHERE course_id = @c', { c: c.id });
			const t1 = await courseCme.syncTrainees(c.id, actor.id);
			const l1 = await courseCme.syncLecturers(c.id, actor.id);
			const n1 = await count();
			assert.equal(await courseCme.syncTrainees(c.id, actor.id), t1);
			assert.equal(await courseCme.syncLecturers(c.id, actor.id), l1);
			assert.equal(await count(), n1);
			// Nhãn nstr: đủ dấu, còn khoảng trắng trước phần nối
			const recs = await q(
				"SELECT source_type, role, title, note FROM cme_records WHERE source_id = @c AND source_type LIKE 'course_%'",
				{ c: c.id },
			);
			for (const r of recs) {
				if (r.role === 'Học viên') assert.match(r.note, /^Giấy chứng nhận số \S/);
				else {
					assert.equal(r.role, 'Giảng viên');
					assert.match(r.title, /^Giảng dạy: \S/);
					assert.match(r.note, /^Tự động khi khóa điểm — \S+ tiết$/);
				}
			}
		}
	});

	await step('nstr: chữ Việt giữ dấu, giữ khoảng trắng cuối, dịch vụ dùng nstr', async () => {
		const { nstr } = db;
		const [row] = await q(
			`SELECT ${nstr('Chưa xác định')} AS a, CONCAT(${nstr('số ')}, 'x') AS b, ${nstr("it's")} AS c`,
		);
		assert.deepEqual({ ...row }, { a: 'Chưa xác định', b: 'số x', c: "it's" });
		const dash = require('../src/modules/dashboard/dashboardService');
		assert.ok(await dash.getTrainingStats());
		const s = await dash.getStats(null);
		assert.ok(s);
		await require('../src/modules/cme/cmeReportService').getData({ year: 2026 });
	});

	await step(
		'ilike / likeCi: không phân biệt hoa/thường, phân biệt dấu, dịch vụ tìm kiếm',
		async () => {
			const { ilike, likeCi, nstr } = db;
			const yes = async (cond, inputs) =>
				(await q(`SELECT CASE WHEN ${cond} THEN 1 ELSE 0 END AS ok`, inputs))[0].ok === 1;
			assert.equal(await yes(ilike(nstr('NGUYỄN ĐỨC Anh'), nstr('%nguyễn đức%'))), true);
			assert.equal(await yes(ilike(nstr('Nguyễn'), nstr('%nguyen%'))), false); // phân biệt dấu
			assert.equal(await yes(ilike("'a\\b'", "'a\\b'")), true); // `\` là ký tự thường
			assert.equal(await yes(ilike(nstr('ab'), '@p'), { p: '%B' }), true);

			// likeCi trên cột rms_ci (PG) — username / email
			const [u] = await q(
				`SELECT id, username, full_name FROM users WHERE username IS NOT NULL AND full_name IS NOT NULL ORDER BY id`,
			);
			if (u) {
				const hit = await q(`SELECT id FROM users WHERE ${likeCi('username', '@p')}`, {
					p: u.username.toUpperCase(),
				});
				assert.ok(hit.some((r) => r.id === u.id));
			}

			// Dịch vụ: tìm bằng chữ thường và chữ hoa ra cùng kết quả
			const ids = (r) => (r.data ?? r).map((x) => x.id ?? x.candidate_id ?? JSON.stringify(x));
			const same = async (label, fn, term) => {
				const lo = ids(await fn(term.toLowerCase()));
				const up = ids(await fn(term.toUpperCase()));
				assert.deepEqual(up, lo, label);
				return lo;
			};
			const users = require('../src/modules/users/userService');
			if (u) {
				const term = u.full_name.split(' ').pop();
				await same('user theo tên', (s) => users.getAll({ search: s, meta: '0', limit: 50 }), term);
				await same('user theo username', (s) => users.getAll({ search: s, meta: '0' }), u.username);
			}
			const [d] = await q('SELECT name, code FROM departments ORDER BY id');
			const depts = require('../src/modules/catalog/departmentService');
			if (d) {
				assert.ok((await same('khoa theo mã', (s) => depts.getAll({ search: s }), d.code)).length);
				await same('khoa theo tên', (s) => depts.getAll({ search: s }), d.name);
			}
			const kw = 'n';
			const calls = [
				[
					'học viên',
					(s) => require('../src/modules/training/trainees/traineeService').getAll({ search: s }),
				],
				[
					'giảng viên',
					(s) => require('../src/modules/training/lecturers/lecturerService').getAll({ search: s }),
				],
				['đề tài', (s) => require('../src/modules/topics/topicService').getAll({ search: s })],
				[
					'chương trình',
					(s) =>
						require('../src/modules/training/programs/trainingProgramService').getAll({
							search: s,
						}),
				],
				[
					'gộp hồ sơ',
					(s) => require('../src/modules/persons/personMergeService').listCandidates({ search: s }),
				],
				['vai trò', (s) => require('../src/modules/access/roleService').getAll({ search: s })],
				[
					'cấp (crudService)',
					(s) => require('../src/modules/catalog/levelService').getAll({ search: s }),
				],
			];
			for (const [label, fn] of calls) await same(label, fn, kw);
		},
	);

	// Bỏ tiền tố dbo. (PG không có schema dbo), hàm fn_normalize_phone qua udf(), lô nhiều câu của
	// mergeCandidate tách từng câu. mergeCandidate chạy trong withTransaction (đã thay bằng tx rollback).
	await step(
		'gộp hồ sơ: danh sách, chi tiết, gộp cặp, chuyển cặp chờ sang hồ sơ giữ lại, từ chối / mở lại',
		async () => {
			const [ph] = await q(`SELECT ${db.udf('fn_normalize_phone', "'+84 912-345-678'")} AS p`);
			assert.equal(ph.p, '912345678');
			const merge = require('../src/modules/persons/personMergeService');
			const ps = await q(`
      SELECT p.id FROM persons p WHERE p.status = 'ACTIVE'
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.person_id = p.id)
        -- học viên dữ liệu cũ có mã sai CHECK (NOT VALID) ⇒ UPDATE person_id bị chặn
        AND NOT EXISTS (SELECT 1 FROM trainees t WHERE t.person_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM person_merge_candidates c WHERE c.person_a_id = p.id OR c.person_b_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM person_merge_log l WHERE l.kept_id = p.id OR l.merged_id = p.id)
      ORDER BY p.id OFFSET 0 ROWS FETCH NEXT 4 ROWS ONLY`);
			if (ps.length < 4) return;
			const [a, b, c, d] = ps.map((x) => x.id); // a < b < c < d
			await q(
				`INSERT INTO person_merge_candidates (person_a_id, person_b_id, reason) VALUES
         (@a, @b, 'SAME_NAME'), (@b, @c, 'SAME_PHONE'), (@c, @d, 'SAME_EMAIL')`,
				{ a, b, c, d },
			);
			const idOf = async (x, y) =>
				(
					await q(
						'SELECT id FROM person_merge_candidates WHERE person_a_id = @x AND person_b_id = @y',
						{ x, y },
					)
				)[0]?.id;
			const ab = await idOf(a, b);
			const cd = await idOf(c, d);

			const list = await merge.listCandidates({ search: 'a' });
			assert.ok(Array.isArray(list.data ?? list));
			const stats = await merge.getStats();
			assert.equal(typeof stats.by_status.PENDING, 'number');
			assert.ok(stats.by_status.PENDING >= 3 && stats.pending_by_reason.SAME_NAME >= 1);
			// SQL Server: getCandidate chạy song song 2 câu (Promise.all) — trên 1 transaction test thì
			// EREQINPROG; chạy thật dùng pool nên không sao. PG: client xếp hàng các câu.
			if (db.client === 'pg') assert.equal((await merge.getCandidate(ab, true)).a.id, a);

			// Giữ A: b gộp vào a; cặp (b, c) chờ → chuyển thành (a, c)
			const r = await merge.mergeCandidate(ab, { keep: 'A', note: 'thử' }, actor.id);
			assert.deepEqual([r.kept_id, r.merged_id], [a, b]);
			const [pb] = await q('SELECT status, merged_into_id FROM persons WHERE id = @b', { b });
			assert.deepEqual({ ...pb }, { status: 'MERGED', merged_into_id: a });
			const rows = await q(
				`SELECT person_a_id AS x, person_b_id AS y, status, note FROM person_merge_candidates
       WHERE person_a_id IN (@a, @b) ORDER BY person_a_id, person_b_id`,
				{ a, b },
			);
			assert.deepEqual(
				rows.map((x) => [x.x, x.y, x.status]),
				[
					[a, b, 'MERGED'],
					[a, c, 'PENDING'],
					[b, c, 'MERGED'],
				],
			);
			assert.equal(rows[1].note, `Chuyển từ hồ sơ đã gộp ${b}`);
			assert.equal(rows[2].note, `Chuyển sang hồ sơ ${a}`);
			const [log] = await q(
				'SELECT kept_id, merged_id FROM person_merge_log WHERE candidate_id = @id',
				{ id: ab },
			);
			assert.deepEqual({ ...log }, { kept_id: a, merged_id: b });

			// Từ chối rồi mở lại
			await merge.rejectCandidate(cd, 'khác người', actor.id);
			assert.equal(
				(await q('SELECT status FROM person_merge_candidates WHERE id = @id', { id: cd }))[0]
					.status,
				'REJECTED',
			);
			await merge.reopenCandidate(cd, actor.id);
			assert.equal(
				(await q('SELECT status FROM person_merge_candidates WHERE id = @id', { id: cd }))[0]
					.status,
				'PENDING',
			);
		},
	);

	await step(
		'strPos / strLen: mã trong danh sách phẩy, độ dài bỏ khoảng trắng cuối, giấy tờ học viên',
		async () => {
			const { strPos, strLen } = db;
			const list = "CONCAT(',', REPLACE(' A1, BB ', ' ', ''), ',')";
			const [r] = await q(
				`SELECT ${strPos(list, "',BB,'")} AS hit, ${strPos(list, "',B,'")} AS miss,
			        ${strLen("'ab  '")} AS len2, ${strLen("''")} AS len0`,
			);
			assert.ok(r.hit > 0);
			assert.deepEqual({ miss: r.miss, len2: r.len2, len0: r.len0 }, { miss: 0, len2: 2, len0: 0 });
			const [blank] = await q(
				"SELECT COUNT(*) AS n FROM (SELECT '  ' AS x UNION ALL SELECT 'a ' UNION ALL SELECT NULL) s WHERE LTRIM(RTRIM(x)) <> ''",
			);
			assert.equal(Number(blank.n), 1);

			// Giấy tờ bắt buộc theo loại khóa (traineeDocumentSql): khớp đúng mã, không khớp mã dài hơn
			const trainees = require('../src/modules/training/trainees/traineeService');
			const [e] = await q(`
      SELECT e.trainee_id, c.training_type_id FROM course_enrollments e JOIN courses c ON c.id = e.course_id
      JOIN trainees t ON t.id = e.trainee_id
      WHERE e.status <> 'rejected' AND c.training_type_id IS NOT NULL AND t.hidden_at IS NULL ORDER BY e.id`);
			await trainees.getAll({ limit: 5, missing_docs: '1' });
			if (!e) return;
			const before = (await trainees.getById(e.trainee_id, true)).doc_required;
			await q(
				`INSERT INTO trainee_document_types (id, name, required_for_types) VALUES
         ('DTZZ1', 'zz1', @in), ('DTZZ2', 'zz2', @longer)`,
				{ in: ` X9, ${e.training_type_id} `, longer: `${e.training_type_id}Z` },
			);
			const after = await trainees.getById(e.trainee_id, true);
			assert.equal(Number(after.doc_required), Number(before) + 1);
			// Danh sách (OUTER APPLY đếm) ra cùng số với trang hồ sơ
			const rows = await trainees.getAll({ training_type_id: e.training_type_id, limit: 100 });
			const row = rows.data.find((x) => x.id === e.trainee_id);
			if (row) assert.equal(Number(row.doc_required), Number(after.doc_required));
		},
	);

	await step('upsert khoá có cột NULL: điểm danh không theo ca 2 lần vẫn 1 dòng', async (st) => {
		if (db.client === 'pg') {
			const [ix] = await q(`
        SELECT i.indnullsnotdistinct AS nnd FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = 'uq_staff_attendance_user_date_shift'`);
			if (!ix?.nnd)
				return st.skip('DB PG chưa chạy migration 2026-12-15_unique_nulls_not_distinct');
		}
		const up = (now) =>
			new sql.Request(tx)
				.input('user_id', sql.VarChar(20), actor.id)
				.input('work_date', sql.Date, '2030-01-02')
				.input('shift_id', sql.Int, null)
				.input('now', sql.DateTime2, now)
				.query(
					db.upsert({
						table: 'staff_attendance',
						key: ['user_id', 'work_date', 'shift_id'],
						nullable: ['shift_id'],
						values: {
							user_id: '@user_id',
							work_date: '@work_date',
							shift_id: '@shift_id',
							check_in_at: '@now',
						},
						update: { check_out_at: '@now' },
						returning: 'new.id',
						action: true,
					}),
				)
				.then((r) => r.recordset[0]);
		const a = await up(new Date('2030-01-02T01:00:00Z'));
		const b = await up(new Date('2030-01-02T09:00:00Z'));
		assert.equal(a.merge_action, 'INSERT');
		assert.equal(b.merge_action, 'UPDATE');
		assert.equal(String(a.id), String(b.id));
	});

	// (SELECT … ORDER BY … FOR JSON PATH) → jsonArray(select, orderBy, { nested })
	await step(
		'jsonArray: thứ tự, bỏ key NULL, lồng mảng, rỗng = NULL, dịch vụ dùng jsonArray',
		async () => {
			const V = "(VALUES (1, N'b', NULL), (2, N'a', 1.5), (3, N'c', 2)) AS x(id, name, val)";
			const ks = db.jsonArray(
				"SELECT y.k FROM (VALUES (1, 'p'), (1, 'q'), (2, 'r')) AS y(id, k) WHERE y.id = x.id",
				'y.k DESC',
				{ nested: true },
			);
			const [r] = await q(`
      SELECT ${db.jsonArray(`SELECT x.id, x.name, x.val, ${ks} AS ks FROM ${V}`, 'x.name')} AS j,
             ${db.jsonArray(`SELECT x.id FROM ${V} WHERE 1 = 0`, 'x.id')} AS empty`);
			assert.equal(typeof r.j, 'string');
			assert.deepEqual(JSON.parse(r.j), [
				{ id: 2, name: 'a', val: 1.5, ks: [{ k: 'r' }] },
				{ id: 1, name: 'b', ks: [{ k: 'q' }, { k: 'p' }] },
				{ id: 3, name: 'c', val: 2 },
			]);
			assert.equal(r.empty, null);

			// Khoa bắt buộc của buổi tập huấn: mảng theo tên khoa
			const [s] = await q('SELECT id FROM seminars ORDER BY id');
			const depts = await q('SELECT id, name FROM departments ORDER BY id DESC');
			const seminars = require('../src/modules/seminars/seminarService');
			if (s && depts.length >= 2) {
				await q('DELETE FROM seminar_required_departments WHERE seminar_id = @s', { s: s.id });
				for (const d of depts.slice(0, 2))
					await q(
						'INSERT INTO seminar_required_departments (seminar_id, department_id) VALUES (@s, @d)',
						{ s: s.id, d: d.id },
					);
				const got = await seminars.getById(s.id);
				const want = await q(
					`SELECT d.id, d.name FROM seminar_required_departments r JOIN departments d ON d.id = r.department_id
         WHERE r.seminar_id = @s ORDER BY d.name`,
					{ s: s.id },
				);
				assert.ok(want.length >= 2);
				assert.deepEqual(
					got.required_departments,
					want.map((x) => ({ ...x })),
				);
			}
			await seminars.getAll({ limit: 3 });

			// File kết quả CME: mảng (rỗng khi chưa có)
			const cmeRecords = require('../src/modules/cme/cmeRecordService');
			const [rec] = await q('SELECT id, user_id FROM cme_records ORDER BY id');
			if (rec) {
				await q(
					`INSERT INTO training_files (id, entity_type, entity_id, file_name, file_url)
         VALUES ('TFZZ1', 'cme_result', @id, N'kết quả.pdf', '/uploads/zz.pdf')`,
					{ id: rec.id },
				);
				const got = await cmeRecords.getById(rec.id);
				assert.deepEqual(
					got.result_files.map((f) => f.id),
					['TFZZ1'],
				);
				const mine = await require('../src/modules/cme/cmeUserService').getUserCme(rec.user_id);
				assert.ok(Array.isArray(mine.records ?? mine));
			}
			await cmeRecords.getAll({ limit: 3 });

			// Chương trình đào tạo (vòng thực hành) và khóa mở đăng ký ở cổng công khai (JSON lồng 2 tầng)
			const programs = require('../src/modules/training/programs/trainingProgramService');
			const list = await programs.getAll({ limit: 5 });
			for (const p of list.data ?? list) assert.ok(Array.isArray(p.rotations));
			const open = await require('../src/modules/public/publicPortalService').getOpenCourses();
			for (const c of open) for (const p of c.programs) assert.ok(Array.isArray(p.lessons ?? []));
		},
	);
};

module.exports = { run };
