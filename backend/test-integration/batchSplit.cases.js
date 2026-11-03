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
};

module.exports = { run };
