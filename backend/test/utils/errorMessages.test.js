// Thông điệp lỗi trả về client: không lộ nguyên văn lỗi CSDL, và lỗi CHECK không bị
// báo nhầm thành "dữ liệu đang được liên kết" (lỗi khoá ngoại).
process.env.LOG_LEVEL = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const { httpError, publicMessage } = require('../../src/utils/httpError');
const { errorHandler } = require('../../src/middlewares/errorHandler');

const pgErr = (code, extra = {}) =>
	Object.assign(new Error('new row for relation "users" violates check constraint "chk_user_id"'), {
		code,
		severity: 'ERROR',
		...extra,
	});

test('publicMessage: lỗi nghiệp vụ giữ nguyên thông điệp', () => {
	assert.equal(
		publicMessage(httpError(409, 'Học viên đã có tài khoản')),
		'Học viên đã có tài khoản',
	);
	assert.equal(
		publicMessage(new Error('Không sinh được mã tài khoản mới')),
		'Không sinh được mã tài khoản mới',
	);
});

test('publicMessage: lỗi CSDL / lỗi code / httpError 5xx ⇒ thông điệp chung', () => {
	const fallback = 'Lỗi chung';
	assert.equal(publicMessage(pgErr('23514'), fallback), fallback);
	assert.equal(
		publicMessage(new TypeError("Cannot read properties of undefined (reading 'id')"), fallback),
		fallback,
	);
	assert.equal(publicMessage(httpError(500, 'chi tiết nội bộ'), fallback), fallback);
	assert.equal(publicMessage('chuỗi', fallback), fallback);
	assert.equal(publicMessage(undefined, fallback), fallback);
	assert.ok(publicMessage(pgErr('23514')).length > 0, 'có thông điệp mặc định');
});

// Gọi errorHandler như Express, lấy mã + body trả về
const handle = (err) => {
	const out = {};
	const res = {
		status(code) {
			out.status = code;
			return res;
		},
		json(body) {
			out.body = body;
			return res;
		},
	};
	errorHandler(err, { method: 'POST', path: '/x' }, res, () => {});
	return out;
};

test('errorHandler: vi phạm CHECK ⇒ 400 "không hợp lệ", không phải "đang được liên kết"', () => {
	const r = handle(pgErr('23514', { constraint: 'chk_user_id' }));
	assert.equal(r.status, 400);
	assert.match(r.body.message, /không hợp lệ/);
	assert.doesNotMatch(r.body.message, /liên kết|chk_user_id|violates/);
});

test('errorHandler: CHECK đã biết tên ⇒ thông báo cụ thể', () => {
	const r = handle(pgErr('23514', { constraint: 'chk_rr_dates' }));
	assert.equal(r.status, 400);
	assert.match(r.body.message, /Ngày kết thúc đợt/);
});

test('errorHandler: khoá ngoại vẫn ⇒ 409 "đang được liên kết"', () => {
	const r = handle(pgErr('23503'));
	assert.equal(r.status, 409);
	assert.match(r.body.message, /liên kết/);
});
