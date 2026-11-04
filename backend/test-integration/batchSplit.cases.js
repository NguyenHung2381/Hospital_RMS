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
			const t1 = await courseCme.syncTrainees(c.id, actor.id);
			const l1 = await courseCme.syncLecturers(c.id, actor.id);
			const n1 = await count();
			assert.equal(await courseCme.syncTrainees(c.id, actor.id), t1);
			assert.equal(await courseCme.syncLecturers(c.id, actor.id), l1);
			assert.equal(await count(), n1);
		}
	});

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
};

module.exports = { run };
