// Sinh schema PostgreSQL từ schema SQL Server (scripts/pg/): quy tắc đổi kiểu,
// DEFAULT, CHECK, index — không cần DB thật.
const test = require('node:test');
const assert = require('node:assert/strict');
const t2p = require('../../scripts/pg/tsqlToPg');
const { buildModel, renderTables, renderConstraints } = require('../../scripts/pg/gen-baseline');

const col = (type, max_length = 0, precision = 0, scale = 0) => ({ type, max_length, precision, scale });

test('đổi kiểu cột', () => {
	assert.equal(t2p.mapType(col('nvarchar', 200)), 'varchar(100)'); // nvarchar tính byte
	assert.equal(t2p.mapType(col('nvarchar', -1)), 'text');
	assert.equal(t2p.mapType(col('varchar', 20)), 'varchar(20)');
	assert.equal(t2p.mapType(col('bit')), 'boolean');
	assert.equal(t2p.mapType(col('tinyint')), 'smallint');
	assert.equal(t2p.mapType(col('decimal', 0, 4, 1)), 'numeric(4,1)');
	assert.equal(t2p.mapType(col('datetime')), 'timestamp(3)');
	assert.equal(t2p.mapType(col('datetime2', 0, 0, 7)), 'timestamp(6)'); // PG tối đa micro giây
	assert.equal(t2p.mapType(col('nvarchar', 100), 'citext'), 'citext');
	assert.throws(() => t2p.mapType(col('geography')), /Chưa có quy tắc/);
});

test('đổi DEFAULT', () => {
	assert.equal(t2p.translateDefault('(getdate())'), 'LOCALTIMESTAMP');
	assert.equal(t2p.translateDefault('(sysdatetime())'), 'LOCALTIMESTAMP');
	assert.equal(t2p.translateDefault('(sysutcdatetime())'), "(now() AT TIME ZONE 'UTC')");
	assert.equal(t2p.translateDefault('(CONVERT([date],getdate()))'), 'CURRENT_DATE');
	assert.equal(t2p.translateDefault('((0))', 'boolean'), 'false');
	assert.equal(t2p.translateDefault('((1))', 'boolean'), 'true');
	assert.equal(t2p.translateDefault('((120))', 'integer'), '120');
	assert.equal(t2p.translateDefault("('pending')"), "'pending'");
	assert.equal(t2p.translateDefault("(N'Mặc định')"), "'Mặc định'");
	assert.equal(t2p.translateDefault("('')"), "''");
	assert.throws(() => t2p.translateDefault('(dbo.fn_x())'), /Chưa có quy tắc/);
});

test('đổi biểu thức CHECK / điều kiện lọc', () => {
	assert.equal(
		t2p.translateExpr("([id] like 'DD[0-9][0-9]')"),
		"(id SIMILAR TO 'DD[0-9][0-9]')", // LIKE của PG không có lớp ký tự [..]
	);
	assert.equal(t2p.translateExpr("([id] like 'PD%')"), "(id LIKE 'PD%')");
	assert.equal(t2p.translateExpr('([is_deleted]=(0))', { is_deleted: 'boolean' }), '(is_deleted = false)');
	assert.equal(t2p.translateExpr('([last_seq]>=(0))', { last_seq: 'integer' }), '(last_seq>=0)');
	assert.equal(t2p.translateExpr('(isjson([config])=(1))'), '(config IS JSON)');
	assert.equal(
		t2p.translateExpr("([status]='a' OR [user]='b')"),
		"(status='a' OR \"user\"='b')", // từ khoá PG phải đặt trong ngoặc kép
	);
	assert.throws(() => t2p.translateExpr('(len([x])>(0))'), /Chưa đổi được/);
});

test('tên object: chữ thường, tối đa 63 ký tự', () => {
	assert.equal(t2p.objectName('PK__course_e__3213E83F1A5FC5D6'), 'pk__course_e__3213e83f1a5fc5d6');
	assert.equal(t2p.objectName('x'.repeat(80)).length, 63);
});

// Danh mục giả đủ để thử các quy tắc của buildModel
const catalog = () => ({
	tables: [
		{ object_id: 1, name: 'users' },
		{ object_id: 2, name: 'security_events' },
		{ object_id: 3, name: 'schema_migrations' },
	],
	columns: [
		{ object_id: 1, column_id: 1, name: 'id', type: 'varchar', max_length: 20, is_nullable: false },
		{ object_id: 1, column_id: 2, name: 'username', type: 'varchar', max_length: 100, is_nullable: false },
		{ object_id: 1, column_id: 3, name: 'full_name', type: 'nvarchar', max_length: 510, is_nullable: true },
		{ object_id: 1, column_id: 4, name: 'is_active', type: 'bit', max_length: 1, is_nullable: false, default_def: '((1))' },
		{ object_id: 1, column_id: 5, name: 'created_at', type: 'datetime', max_length: 8, is_nullable: false, default_def: '(getdate())' },
		{ object_id: 2, column_id: 1, name: 'id', type: 'bigint', max_length: 8, is_nullable: false, is_identity: true },
		{ object_id: 2, column_id: 2, name: 'ip_address', type: 'varchar', max_length: 64, is_nullable: true },
		{ object_id: 2, column_id: 3, name: 'created_at', type: 'datetime', max_length: 8, is_nullable: false },
		{ object_id: 3, column_id: 1, name: 'filename', type: 'varchar', max_length: 200, is_nullable: false },
	],
	indexes: [
		{ object_id: 1, index_id: 1, name: 'PK__users__X', is_primary_key: true, is_unique: true },
		{ object_id: 1, index_id: 2, name: 'UQ_users_username', is_unique: true, is_unique_constraint: true },
		{ object_id: 1, index_id: 3, name: 'idx_users_username', is_unique: false }, // thừa: UNIQUE đã phủ
		{ object_id: 1, index_id: 4, name: 'idx_users_active', is_unique: false, filter_definition: '([is_active]=(1))' },
		{ object_id: 2, index_id: 1, name: 'PK__security', is_primary_key: true, is_unique: true },
	],
	indexColumns: [
		{ object_id: 1, index_id: 1, name: 'id', key_ordinal: 1 },
		{ object_id: 1, index_id: 2, name: 'username', key_ordinal: 1 },
		{ object_id: 1, index_id: 3, name: 'username', key_ordinal: 1 },
		{ object_id: 1, index_id: 4, name: 'username', key_ordinal: 1 },
		{ object_id: 2, index_id: 1, name: 'id', key_ordinal: 1 },
	],
	checks: [{ object_id: 1, name: 'CHK_user_id', definition: "([id] like 'NV%')" }],
	foreignKeys: [],
	sequences: [],
});

test('buildModel áp quy tắc schemaRules', () => {
	const m = buildModel(catalog());
	assert.deepEqual(
		m.tables.map((t) => t.name),
		['security_events', 'users'], // bỏ schema_migrations
	);
	const users = m.tables.find((t) => t.name === 'users');
	const c = Object.fromEntries(users.columns.map((x) => [x.name, x]));
	assert.equal(c.username.type, 'varchar(100)');
	assert.equal(c.username.collation, 'rms_ci'); // không phân biệt hoa/thường như *_CI_AS
	assert.equal(c.full_name.type, 'varchar(255)');
	assert.equal(c.full_name.collation, 'vi-VN-x-icu');
	assert.equal(c.is_active.default, 'true');
	assert.equal(c.created_at.default, 'LOCALTIMESTAMP');
	assert.deepEqual(
		users.indexes.map((i) => i.name),
		['uq_users_username', 'idx_users_active'],
	);
	assert.equal(users.indexes[1].filter, '(is_active = true)');

	const se = m.tables.find((t) => t.name === 'security_events');
	assert.deepEqual(se.primaryKey.columns, ['id', 'created_at']); // PK phải chứa cột partition
	assert.equal(se.columns.find((x) => x.name === 'ip_address').type, 'inet');
	assert.ok(se.columns[0].identity);
});

test('render: bảng partition có DEFAULT + partition tháng; FK tạo NOT VALID rồi VALIDATE', () => {
	const cat = catalog();
	cat.foreignKeys.push({
		fk_id: 9,
		name: 'FK_se_user',
		parent_object_id: 2,
		referenced_object_id: 1,
		on_delete: 'CASCADE',
		on_update: 'NO_ACTION',
		column_name: 'id',
		ref_column_name: 'id',
	});
	const m = buildModel(cat);
	const tables = renderTables(m);
	assert.match(tables, /\) PARTITION BY RANGE \(created_at\);/);
	assert.match(tables, /security_events_default PARTITION OF security_events DEFAULT;/);
	assert.match(tables, /rms_maintain_monthly_partitions\('security_events', 24, 2, NULL\)/);
	assert.match(tables, /full_name varchar\(255\) COLLATE "vi-VN-x-icu"/);
	const cons = renderConstraints(m);
	assert.match(cons, /FOREIGN KEY \(id\) REFERENCES users \(id\) ON DELETE CASCADE NOT VALID;/);
	assert.match(cons, /VALIDATE CONSTRAINT fk_se_user;/);
	assert.match(cons, /CHECK \(id LIKE 'NV%'\);/);
});

test('CHECK WITH NOCHECK trên SQL Server → NOT VALID, không VALIDATE', () => {
	const cat = catalog();
	cat.checks.push({ object_id: 2, name: 'CHK_se_ip', definition: '([ip_address] IS NOT NULL)', is_not_trusted: true });
	const cons = renderConstraints(buildModel(cat));
	assert.match(cons, /ADD CONSTRAINT chk_se_ip CHECK \(ip_address IS NOT NULL\) NOT VALID;/);
	assert.doesNotMatch(cons, /VALIDATE CONSTRAINT chk_se_ip/);
	assert.match(cons, /CHECK \(id LIKE 'NV%'\);/); // CHECK tin cậy giữ nguyên
});

test('cột tính toán chưa có quy tắc thì dừng, không đoán', () => {
	const cat = catalog();
	cat.columns.push({ object_id: 1, column_id: 9, name: 'x', type: 'int', max_length: 4, is_computed: true });
	assert.throws(() => buildModel(cat), /COMPUTED_COLUMNS: users\.x/);
});
