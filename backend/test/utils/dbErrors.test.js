const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/utils/dbErrors');

const mssqlErr = (number, message = '') => Object.assign(new Error(message), { number });

test('trùng khoá: 2627 và 2601, kể cả khi số nằm trong originalError', () => {
	assert.equal(db.isUniqueViolation(mssqlErr(2627)), true);
	assert.equal(db.isUniqueViolation(mssqlErr(2601)), true);
	assert.equal(db.isUniqueViolation({ originalError: { info: { number: 2601 } } }), true);
	assert.equal(db.isUniqueViolation(mssqlErr(547)), false);
	assert.equal(db.isUniqueViolation(new Error('x')), false);
	assert.equal(db.isUniqueViolation(null), false);
});

test('547: phân biệt khoá ngoại và CHECK theo message', () => {
	const fk = mssqlErr(
		547,
		'The DELETE statement conflicted with the REFERENCE constraint "FK_a_b".',
	);
	const fk2 = mssqlErr(
		547,
		'The INSERT statement conflicted with the FOREIGN KEY constraint "FK".',
	);
	const ck = mssqlErr(547, 'The UPDATE statement conflicted with the CHECK constraint "CK_x".');
	assert.equal(db.isForeignKeyViolation(fk), true);
	assert.equal(db.isForeignKeyViolation(fk2), true);
	assert.equal(db.isForeignKeyViolation(ck), false);
	assert.equal(db.isCheckViolation(ck), true);
	assert.equal(db.isCheckViolation(fk), false);
});

test('thiếu bảng / cột', () => {
	assert.equal(db.isMissingTable(mssqlErr(208)), true);
	assert.equal(db.isMissingTable(mssqlErr(207)), false);
	assert.equal(db.isMissingColumn(mssqlErr(207)), true);
	assert.equal(db.isMissingObject(mssqlErr(207)), true);
	assert.equal(db.isMissingObject(mssqlErr(208)), true);
	assert.equal(db.isMissingObject(mssqlErr(2627)), false);
});

test('mã lỗi nghiệp vụ tự ném (>= 50000)', () => {
	assert.equal(db.appErrorCode(mssqlErr(51003)), 51003);
	assert.equal(db.appErrorCode({ originalError: { info: { number: 50000 } } }), 50000);
	assert.equal(db.appErrorCode(mssqlErr(2627)), null);
	assert.equal(db.appErrorCode(new Error('x')), null);
});

test('isDbError chỉ nhận lỗi có mã số từ DB', () => {
	assert.equal(db.isDbError(mssqlErr(1205)), true);
	assert.equal(db.isDeadlock(mssqlErr(1205)), true);
	assert.equal(db.isDbError(Object.assign(new Error('x'), { statusCode: 400 })), false);
	assert.equal(db.isDbError({ number: '2627' }), false);
	assert.equal(db.dbErrorNumber(mssqlErr(2627)), 2627);
});
