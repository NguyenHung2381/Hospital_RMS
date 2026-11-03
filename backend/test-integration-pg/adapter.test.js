// Adapter PostgreSQL (src/config/db.pg.js) + baseline database/pg/baseline/ trên
// PostgreSQL THẬT. Mọi thay đổi dữ liệu chạy trong transaction và ROLLBACK →
// không để lại gì, chạy được trên DB đã có dữ liệu.
//
//   npm run test:pg
//
// Kết nối (mặc định = PG cài trên máy dev, role rms_app, mật khẩu trong pgpass):
//   PG_TEST_HOST (127.0.0.1) PG_TEST_PORT (5432) PG_TEST_DATABASE (rms_hospital)
//   PG_TEST_USER (rms_app) PG_TEST_PASSWORD (trống = đọc pgpass / PGPASSWORD)
const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
	DB_CLIENT: 'pg',
	DB_SERVER: process.env.PG_TEST_HOST || '127.0.0.1',
	DB_PORT: process.env.PG_TEST_PORT || '5432',
	DB_DATABASE: process.env.PG_TEST_DATABASE || 'rms_hospital',
	DB_USER: process.env.PG_TEST_USER || 'rms_app',
	DB_PASSWORD: process.env.PG_TEST_PASSWORD || '',
	DB_ENCRYPT: 'false',
});

const db = require('../src/config/db');
const { getPool, sql, withTransaction, withActor } = db;
const dbErrors = require('../src/utils/dbErrors');

// Chạy fn trong transaction rồi luôn ROLLBACK
const inRollback = async (fn) => {
	const pool = await getPool();
	const tx = new sql.Transaction(pool);
	await tx.begin();
	try {
		return await fn(tx);
	} finally {
		await tx.rollback();
	}
};

test.after(async () => (await getPool()).close());

test('chọn đúng adapter, kết nối được, đúng múi giờ và role', async () => {
	assert.equal(db.client, 'pg');
	const pool = await getPool();
	const { recordset } = await pool
		.request()
		.query("SELECT current_user AS who, current_setting('timezone') AS tz, 1 AS one");
	assert.deepEqual(recordset, [{ who: process.env.DB_USER, tz: 'Asia/Ho_Chi_Minh', one: 1 }]);
});

test('tham số: số/ngày/boolean đi và về đúng kiểu, giờ VN không lệch', async () => {
	const pool = await getPool();
	const d = new Date('2026-11-03T08:30:00.123Z'); // 08:30 giờ VN (quy ước gắn nhãn UTC)
	const { recordset } = await pool
		.request()
		.input('n', sql.Int, 42)
		.input('flag', sql.Bit, 1)
		.input('ts', sql.DateTime2, d)
		.input('day', sql.Date, d)
		.input('money', sql.Decimal(10, 2), 12.5)
		.input('empty', sql.VarChar(20), null)
		.query(
			'SELECT @n AS n, @flag AS flag, @ts AS ts, @day AS day, @money AS money, ' +
				'(@empty IS NULL) AS empty_is_null, count(*) AS cnt FROM (VALUES (1), (2)) v(x)',
		);
	const r = recordset[0];
	assert.equal(r.n, 42);
	assert.equal(r.flag, true);
	assert.equal(r.ts.toISOString(), '2026-11-03T08:30:00.123Z');
	assert.equal(r.day.toISOString(), '2026-11-03T00:00:00.000Z');
	assert.equal(r.money, 12.5);
	assert.equal(r.empty_is_null, true);
	assert.equal(r.cnt, 2); // COUNT(*) là bigint ở PG → vẫn trả number như mssql
});

test('LOCALTIMESTAMP của DB = giờ VN, đọc về là Date gắn nhãn UTC', async () => {
	const pool = await getPool();
	const { recordset } = await pool.request().query('SELECT LOCALTIMESTAMP AS now');
	const vnNow = Date.now() + 7 * 3600 * 1000;
	assert.ok(Math.abs(recordset[0].now.getTime() - vnNow) < 60 * 1000);
});

test('jsonb trả chuỗi nguyên văn', async () => {
	const pool = await getPool();
	const { recordset } = await pool.request().query('SELECT \'{"a": 1}\'::jsonb AS j');
	assert.equal(recordset[0].j, '{"a": 1}');
});

test('cột rms_ci (username/email/code): không phân biệt hoa/thường, kể cả mẫu (@x IS NULL OR cột = @x)', async () => {
	await inRollback(async (tx) => {
		await tx
			.request()
			.query(
				"INSERT INTO departments (id, name, code, abbreviation) VALUES ('DV', 'Khoa CI', 'Khoa_CI_Thu', 'KCI')",
			);
		const find = (code) =>
			tx
				.request()
				.input('code', sql.VarChar(50), code)
				.query('SELECT count(*) AS n FROM departments WHERE (@code IS NULL OR code = @code)');
		assert.equal((await find('KHOA_CI_THU')).recordset[0].n, 1);
		const like = await tx
			.request()
			.input('q', sql.VarChar(50), 'khoa_ci%')
			.query('SELECT count(*) AS n FROM departments WHERE code LIKE @q');
		assert.equal(like.recordset[0].n, 1);
		const dup = await tx
			.request()
			.query(
				"INSERT INTO departments (id, name, code, abbreviation) VALUES ('DV', 'Khoa CI 2', 'KHOA_CI_THU', 'K2')",
			)
			.catch((e) => e);
		assert.equal(dbErrors.isUniqueViolation(dup), true); // UNIQUE cũng không phân biệt hoa/thường
	});
});

test('rowsAffected, INSERT ... RETURNING, rollback không để lại dữ liệu', async () => {
	await inRollback(async (tx) => {
		const ins = await new sql.Request(tx)
			.input('id', sql.VarChar(10), 'LDT99')
			.input('name', sql.NVarChar(255), 'Thử adapter — Đề tài')
			.query('INSERT INTO categories (id, name) VALUES (@id, @name) RETURNING id, name');
		assert.deepEqual(ins.recordset, [{ id: 'LDT99', name: 'Thử adapter — Đề tài' }]);
		assert.deepEqual(ins.rowsAffected, [1]);
		const upd = await tx
			.request()
			.input('id', sql.VarChar(10), 'LDT99')
			.query("UPDATE categories SET description = 'x' WHERE id = @id");
		assert.deepEqual(upd.rowsAffected, [1]);
		assert.equal(upd.recordset, undefined);
	});
	const pool = await getPool();
	const left = await pool
		.request()
		.query("SELECT count(*) AS n FROM categories WHERE id = 'LDT99'");
	assert.equal(left.recordset[0].n, 0);
});

test('lỗi DB: trùng khoá, CHECK, khoá ngoại, thiếu bảng nhận diện đúng', async () => {
	const pool = await getPool();
	const fail = (text) =>
		pool
			.request()
			.query(text)
			.then(
				() => assert.fail('phải lỗi'),
				(err) => err,
			);
	const ck = await fail("INSERT INTO categories (id, name) VALUES ('SAI', 'x')");
	assert.equal(dbErrors.isCheckViolation(ck), true);
	assert.equal(dbErrors.constraintName(ck), 'chk_cat_id');
	const missing = await fail('SELECT * FROM bang_khong_co');
	assert.equal(dbErrors.isMissingTable(missing), true);
	assert.equal(dbErrors.isDbError(missing), true);
	assert.equal(dbErrors.isMissingColumn(await fail('SELECT cot_khong_co FROM categories')), true);

	await inRollback(async (tx) => {
		const fk = await tx
			.request()
			.query(
				"INSERT INTO departments (id, name, code, abbreviation, parent_id) VALUES ('DV', 'x', 'FK_THU', 'x', 'DV_KHONG_CO')",
			)
			.catch((e) => e);
		assert.equal(dbErrors.isForeignKeyViolation(fk), true);
		assert.equal(dbErrors.isCheckViolation(fk), false);
	});

	await inRollback(async (tx) => {
		const name = 'Trùng tên thử';
		await tx.request().query(`INSERT INTO categories (id, name) VALUES ('LDT98', '${name}')`);
		const dup = await tx
			.request()
			.query(`INSERT INTO categories (id, name) VALUES ('LDT97', '${name}')`)
			.catch((e) => e);
		assert.equal(dbErrors.isUniqueViolation(dup), true);
		assert.equal(dbErrors.constraintName(dup), 'uq_categories_name');
	});
});

test('withTransaction: lỗi thì rollback và ném lại lỗi gốc', async () => {
	await assert.rejects(
		() =>
			withTransaction(async (tx) => {
				await tx.request().query("INSERT INTO categories (id, name) VALUES ('LDT96', 'tx thử')");
				throw new Error('lỗi nghiệp vụ');
			}),
		/lỗi nghiệp vụ/,
	);
	const pool = await getPool();
	const { recordset } = await pool
		.request()
		.query("SELECT count(*) AS n FROM categories WHERE id = 'LDT96'");
	assert.equal(recordset[0].n, 0);
});

test('trigger audit: withActor ghi updated_by; chỉ cột theo dõi mới bật audit', async () => {
	await inRollback(async (tx) => {
		await tx.request().query("INSERT INTO categories (id, name) VALUES ('LDT95', 'Audit thử')");
		await withActor(tx, 'NV_TEST');
		await tx.request().query("UPDATE categories SET name = 'Audit thử 2' WHERE id = 'LDT95'");
		const a = (
			await tx.request().query("SELECT updated_by, updated_at FROM categories WHERE id = 'LDT95'")
		).recordset[0];
		assert.equal(a.updated_by, 'NV_TEST');
		assert.ok(a.updated_at instanceof Date);
		// set_config(..., true): hết hiệu lực sau transaction, nhưng trong tx vẫn giữ
		const who = await tx
			.request()
			.query("SELECT current_setting('app.current_user_id', true) AS v");
		assert.equal(who.recordset[0].v, 'NV_TEST');
	});
	const pool = await getPool();
	const after = await pool
		.request()
		.query("SELECT current_setting('app.current_user_id', true) AS v");
	assert.ok(!after.recordset[0].v); // không rò sang kết nối dùng lại
});

test('withActorTransaction: người thao tác tới trigger; lỗi thì rollback hết', async () => {
	let seen;
	await assert.rejects(
		db.withActorTransaction('NV_TX', async (tx) => {
			await tx.request().query("INSERT INTO categories (id, name) VALUES ('LDT94', 'Tx thử')");
			await tx.request().query("UPDATE categories SET name = 'Tx thử 2' WHERE id = 'LDT94'");
			seen = (await tx.request().query("SELECT updated_by FROM categories WHERE id = 'LDT94'"))
				.recordset[0].updated_by;
			throw new Error('rollback có chủ đích');
		}),
		/rollback có chủ đích/,
	);
	assert.equal(seen, 'NV_TX');
	const pool = await getPool();
	const left = await pool
		.request()
		.query("SELECT count(*)::int AS n FROM categories WHERE id = 'LDT94'");
	assert.equal(left.recordset[0].n, 0);
});

test('trigger departments tự sinh mã DVxxx (bỏ qua id truyền vào)', async () => {
	await inRollback(async (tx) => {
		const { recordset } = await tx
			.request()
			.query(
				"INSERT INTO departments (id, name, code, abbreviation) VALUES ('BO_QUA', 'Khoa thử', 'KT_THU_ADAPTER', 'KT') RETURNING id, created_at",
			);
		assert.match(recordset[0].id, /^DV\d{3,}$/);
		assert.ok(recordset[0].created_at instanceof Date);
	});
});

test('rms_app gọi được hàm partition, không được giữ dưới 12 tháng', async () => {
	const pool = await getPool();
	await pool
		.request()
		.query("SELECT rms_maintain_monthly_partitions('security_events', 0, 2, NULL)");
	await assert.rejects(
		() =>
			pool.request().query("SELECT rms_maintain_monthly_partitions('security_events', 0, 2, 6)"),
		/12/,
	);
});

test('execute() stored procedure báo rõ chưa hỗ trợ', async () => {
	const pool = await getPool();
	await assert.rejects(() => pool.request().execute('sp_gen_user_id'), /stored procedure/);
});
