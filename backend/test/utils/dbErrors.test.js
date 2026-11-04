const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../../src/utils/dbErrors');

const pgErr = (code, extra = {}) =>
	Object.assign(new Error('x'), { code, severity: 'ERROR', ...extra });

test('PostgreSQL: nhận diện theo SQLSTATE', () => {
	assert.equal(db.isUniqueViolation(pgErr('23505')), true);
	assert.equal(db.isForeignKeyViolation(pgErr('23503')), true);
	assert.equal(db.isCheckViolation(pgErr('23514')), true);
	assert.equal(db.isCheckViolation(pgErr('23503')), false);
	assert.equal(db.isMissingTable(pgErr('42P01')), true);
	assert.equal(db.isMissingColumn(pgErr('42703')), true);
	assert.equal(db.isDeadlock(pgErr('40P01')), true);
	assert.equal(db.isDbError(pgErr('23505')), true);
	assert.equal(db.dbErrorCode(pgErr('23505')), '23505');
	// Lỗi mạng của Node cũng có code 5 ký tự nhưng không có severity
	assert.equal(db.isDbError(Object.assign(new Error('x'), { code: 'EPIPE' })), false);
	assert.equal(db.appErrorCode(pgErr('P0001', { detail: '51003' })), 51003);
	assert.equal(db.appErrorCode(pgErr('P0001', { detail: 'abc' })), null);
	assert.equal(db.appErrorCode(pgErr('23505')), null);
});

test('constraintName: pg có sẵn, không có thì dò trong message; trả chữ thường', () => {
	assert.equal(
		db.constraintName(pgErr('23505', { constraint: 'uq_users_email' })),
		'uq_users_email',
	);
	assert.equal(
		db.constraintName(new Error('duplicate key value violates unique constraint "UX_users_email"')),
		'ux_users_email',
	);
	assert.equal(db.constraintName(new Error('khác')), null);
});

test('isDbError chỉ nhận lỗi có SQLSTATE từ DB', () => {
	assert.equal(db.isDbError(pgErr('40P01')), true);
	assert.equal(db.isDbError(Object.assign(new Error('x'), { statusCode: 400 })), false);
	assert.equal(db.isDbError({ code: '23505' }), false);
});
