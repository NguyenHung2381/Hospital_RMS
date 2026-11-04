// Các ca kiểm tra sinh mã (src/utils/idGenerator.js) trên PostgreSQL THẬT
// (idGenerator.test.js). Mọi thứ chạy trong 1 transaction rồi ROLLBACK ⇒ không
// để lại dữ liệu, kể cả bộ đếm theo năm.
const assert = require('node:assert/strict');

/**
 * @param {import('node:test').TestContext} t
 * @param {any} db module src/config/db
 */
const run = async (t, db) => {
	const { sql } = db;
	const gen = require('../src/utils/idGenerator');
	const pool = await db.getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	t.after(() => tx.rollback());

	const q = async (text, inputs = {}) => {
		const req = new sql.Request(tx);
		for (const [k, v] of Object.entries(inputs)) req.input(k, v);
		return (await req.query(text)).recordset;
	};

	await t.test('lockResource: kết nối khác chờ quá hạn thì không lấy được', async () => {
		assert.equal(await db.lockResource(tx, 'rms_test_id_lock', 2000), true);
		const tx2 = new sql.Transaction(pool);
		await tx2.begin();
		try {
			const t0 = Date.now();
			assert.equal(await db.lockResource(tx2, 'rms_test_id_lock', 300), false);
			assert.ok(Date.now() - t0 >= 250, 'phải chờ tới hết thời gian chờ');
		} finally {
			await tx2.rollback();
		}
		// Cùng transaction gọi lại vẫn lấy được (sinh nhiều mã trong 1 transaction)
		assert.equal(await db.lockResource(tx, 'rms_test_id_lock', 300), true);
	});

	await t.test('mã phản biện ngoài: MAX+1, lần sau thấy dòng vừa thêm', async () => {
		const rows = await q("SELECT id FROM external_reviewers WHERE id LIKE 'EXR%'");
		const max = Math.max(0, ...rows.map((r) => Number(/^EXR(\d{4})$/.exec(r.id)?.[1] ?? 0)));
		const id1 = await gen.genExternalReviewerId(tx);
		assert.equal(id1, `EXR${String(max + 1).padStart(4, '0')}`);
		await q("INSERT INTO external_reviewers (id, full_name) VALUES (@id, 'Thử sinh mã')", {
			id: id1,
		});
		assert.equal(await gen.genExternalReviewerId(tx), `EXR${String(max + 2).padStart(4, '0')}`);
	});

	await t.test('mã theo ngày: đúng tiền tố hôm nay, chưa có trong bảng', async () => {
		const id = await gen.genCourseId(tx);
		assert.match(id, new RegExp(`^KH${gen.todayCompactVN()}\\d{4}$`));
		assert.equal((await q('SELECT id FROM courses WHERE id = @id', { id })).length, 0);
	});

	await t.test('mã khoa DVxxx: lớn hơn mọi mã đang có', async () => {
		const rows = await q("SELECT id FROM departments WHERE id LIKE 'DV%'");
		const nums = rows.map((r) => Number(/^DV(\d{3,})$/.exec(r.id)?.[1] ?? 0));
		const id = await gen.genDeptId(tx);
		assert.equal(id, 'DV' + String(Math.max(0, ...nums) + 1).padStart(3, '0'));
	});

	await t.test('mã nhân viên của 1 khoa có thật: đúng dải, chưa ai dùng', async (s) => {
		const [dept] = await q("SELECT code FROM departments WHERE code IS NOT NULL AND code <> ''");
		if (!dept) return s.skip('chưa có khoa');
		const id = await gen.genUserId(tx, dept.code);
		assert.match(id, new RegExp(`^NV${dept.code}\\d{4}$`, 'i'));
		assert.notEqual(id.slice(-4), '0000');
		assert.equal((await q('SELECT id FROM users WHERE id = @id', { id })).length, 0);
	});

	await t.test('bộ đếm theo năm: năm chưa có thì bắt đầu 1, sau đó tăng', async () => {
		// Năm 2099: chắc chắn chưa có dòng ⇒ đi qua nhánh INSERT rồi nhánh UPDATE
		assert.equal(await gen.genTraineeId(tx, 2099, null), 'HV20990001');
		assert.equal(await gen.genTraineeId(tx, 2099, null), 'HV20990002');
		assert.equal(await gen.genCmeNo(tx, 2099, null), 1);
		assert.equal(await gen.genCmeNo(tx, 2099, null), 2);
		const [reg] = await q('SELECT last_seq FROM cme_year_register WHERE year = 2099');
		assert.equal(Number(reg.last_seq), 2);
	});

	await t.test('tạo khoa qua service: giữ mã DV và mọi cột gửi lên', async (s) => {
		// DB chưa chạy migration 2026-12-14_bo_trigger_sinh_ma_khoa ⇒ trigger cũ còn
		// đổi mã / bỏ cột, ca này chưa kiểm được.
		const trig = await q(
			"SELECT 1 AS x FROM pg_trigger WHERE tgname = 'trg_dept_gen_id' AND tgrelid = 'departments'::regclass",
		);
		if (trig.length)
			return s.skip('DB còn trigger trg_dept_gen_id (chưa chạy migration 2026-12-14)');
		// Service ghi và đọc lại đều đi qua transaction của test (rollback ở cuối).
		// Thay trước khi require: service destructure getPool lúc nạp module.
		const real = { withTransaction: db.withTransaction, getPool: db.getPool };
		db.withTransaction = async (fn) => fn(tx);
		db.getPool = async () => ({ request: () => new sql.Request(tx) });
		s.after(() => Object.assign(db, real));
		const departmentService = require('../src/modules/catalog/departmentService');
		const dept = await departmentService.create(
			{
				name: 'Khoa thử sinh mã',
				code: 'KT_SINH_MA',
				abbreviation: 'KTSM',
				specialty_group: 'Nội',
				unit_type: 'phong',
				phone: '0123',
				bed_count: 12,
			},
			null,
		);
		assert.ok(dept, 'service phải trả khoa vừa tạo');
		assert.match(dept.id, /^DV\d{3,}$/);
		assert.equal(dept.specialty_group, 'Nội');
		assert.equal(dept.unit_type, 'phong');
		assert.equal(dept.phone, '0123');
		assert.equal(Number(dept.bed_count), 12);
	});
};

module.exports = { run };
