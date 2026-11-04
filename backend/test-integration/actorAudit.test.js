// Test tích hợp: ghi người thao tác cho trigger audit (withActor / withActorTransaction /
// actorRequest) trên PostgreSQL THẬT.
// Mọi thứ chạy trong 1 transaction và ROLLBACK ở cuối ⇒ không để lại dữ liệu.
//
//   docker exec hospital_rms_dev-backend-1 npm run test:smoke   (chạy cùng smoke.test.js)
//
// Câu UPDATE trong test KHÔNG tự ghi updated_by: giá trị đó chỉ có thể đến từ
// trigger audit đọc app.current_user_id ⇒ chứng minh người thao tác đã được ghi.
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const db = require('../src/config/db');
const { sql } = db;
require('../src/modules/events/eventService').broadcast = () => {};

let tx = null;
const realGetPool = db.getPool;
const realWithTransaction = db.withTransaction;
// Mọi transaction của service dùng chung transaction ngoài (rollback ở cuối)
db.withTransaction = async (fn) => fn(tx);

const categoryService = require('../src/modules/catalog/categoryService');

const q = async (text, inputs = {}) => {
	const req = new sql.Request(tx);
	for (const [k, v] of Object.entries(inputs)) req.input(k, v);
	return (await req.query(text)).recordset;
};

test('người thao tác tới được trigger audit (PostgreSQL thật, rollback)', async (t) => {
	const pool = await realGetPool();
	tx = new sql.Transaction(pool);
	await tx.begin();
	t.after(async () => {
		await tx.rollback();
		await pool.close();
	});

	const users = await q('SELECT id FROM users WHERE is_active = true ORDER BY id LIMIT 2');
	const [cat] = await q('SELECT id, name FROM categories ORDER BY id LIMIT 1');
	if (users.length < 2 || !cat) return t.skip('DB chưa có đủ 2 người dùng và 1 danh mục');
	const [a, b] = users.map((u) => u.id);
	const updatedBy = async () =>
		(await q('SELECT updated_by FROM categories WHERE id = @id', { id: cat.id }))[0].updated_by;

	await t.test('withActorTransaction: câu ghi thấy người thao tác', async () => {
		await db.withActorTransaction(a, (x) =>
			x
				.request()
				.input('id', sql.VarChar(5), cat.id)
				.query("UPDATE categories SET name = name || ' (1)' WHERE id = @id"),
		);
		assert.equal(await updatedBy(), a);
	});

	await t.test('actorRequest: dựng dần .input() rồi chạy', async () => {
		const req = db.actorRequest(b).input('id', sql.VarChar(5), cat.id);
		req.input('suffix', sql.NVarChar(10), ' (2)');
		const r = await req.query('UPDATE categories SET name = name || @suffix WHERE id = @id');
		assert.deepEqual(r.rowsAffected.slice(-1), [1]);
		assert.equal(await updatedBy(), b);
	});

	await t.test('withActor trong transaction có sẵn', async () => {
		await db.withActor(tx, a);
		await q("UPDATE categories SET name = name || ' (3)' WHERE id = @id", { id: cat.id });
		assert.equal(await updatedBy(), a);
	});

	await t.test('service thật (crudService.update) ghi đúng người sửa', async () => {
		await categoryService.update(cat.id, { name: `${cat.name} (4)` }, b);
		const [row] = await q('SELECT name, updated_by FROM categories WHERE id = @id', { id: cat.id });
		assert.equal(row.name, `${cat.name} (4)`);
		assert.equal(row.updated_by, b);
	});

	await t.test('withActor ngoài transaction bị từ chối', () => {
		assert.throws(() => db.withActor(pool, a), /transaction/);
	});

	// Các service đã chuyển sang actorRequest / withActorTransaction: chạy thật 1 lần
	// sửa tên/tiêu đề, kiểm tra ghi được và updated_by đúng người sửa.
	const services = [
		['departments', 'name', require('../src/modules/catalog/departmentService')],
		['councils', 'name', require('../src/modules/councils/councilService')],
		['research_rounds', 'name', require('../src/modules/rounds/roundService')],
		['seminars', 'title', require('../src/modules/seminars/seminarService')],
	];
	for (const [table, col, service] of services) {
		await t.test(`${table}: service.update ghi đúng người sửa`, async (s) => {
			const [row] = await q(`SELECT id, ${col} AS v FROM ${table} ORDER BY id LIMIT 1`);
			if (!row) return s.skip(`bảng ${table} trống`);
			await service.update(row.id, { [col]: `${row.v} (thử)` }, b);
			const [after] = await q(`SELECT ${col} AS v, updated_by FROM ${table} WHERE id = @id`, {
				id: row.id,
			});
			assert.equal(after.v, `${row.v} (thử)`);
			assert.equal(after.updated_by, b);
		});
	}
});

test('withActorTransaction thật: lỗi thì rollback, không để lại thay đổi', async (t) => {
	db.withTransaction = realWithTransaction;
	t.after(() => {
		db.withTransaction = async (fn) => fn(tx);
	});
	const pool = await realGetPool();
	const [cat] = (await pool.request().query('SELECT id, name FROM categories ORDER BY id LIMIT 1'))
		.recordset;
	if (!cat) return t.skip('DB chưa có danh mục');
	await assert.rejects(
		db.withActorTransaction(null, async (x) => {
			await x
				.request()
				.input('id', sql.VarChar(5), cat.id)
				.query("UPDATE categories SET name = 'TẠM' WHERE id = @id");
			throw new Error('dừng giữa chừng');
		}),
		/dừng giữa chừng/,
	);
	const [after] = (
		await pool
			.request()
			.input('id', sql.VarChar(5), cat.id)
			.query('SELECT name FROM categories WHERE id = @id')
	).recordset;
	assert.equal(after.name, cat.name);
});
