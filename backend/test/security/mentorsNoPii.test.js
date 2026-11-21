// Hồi quy L-08 (run-5): tìm người hướng dẫn (GET /staff-licenses/mentors) không được trả ngày sinh, giới tính,
// điện thoại của nhân viên mọi khoa — các cột đó chỉ thuộc users:read (có phạm vi khoa). Kết quả chỉ giữ
// các trường để chọn người hướng dẫn (mã NV, họ tên, CCHN, khoa). Chạy trên CSDL giả, kiểm tra câu SELECT thật.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const log = install(async (text) => {
	if (/FROM users u/.test(text))
		return [
			{
				user_id: 'NV010001',
				staff_number: 1,
				full_name: 'Nguyễn Văn Bình',
				qualification: 'Bác sĩ',
				license_no: 'CCHN-001',
				practice_scope: 'Nội',
				department_name: 'Khoa Nội',
			},
		];
	return [];
});

const staffLicenseService = require('../../src/modules/staffLicenses/staffLicenseService');

test('L-08: getMentors không SELECT ngày sinh, giới tính, điện thoại nhân viên', async () => {
	log.length = 0;
	const rows = await staffLicenseService.getMentors({ search: 'Bình' });
	const q = log.find((x) => /FROM users u/.test(x.text));
	assert.ok(q, 'phải truy vấn bảng users');
	const select = q.text.slice(0, q.text.search(/\bFROM users u\b/));
	assert.doesNotMatch(select, /\bdate_of_birth\b/, 'không được chọn ngày sinh');
	assert.doesNotMatch(select, /\bgender\b/, 'không được chọn giới tính');
	assert.doesNotMatch(select, /\bphone_number\b/, 'không được chọn điện thoại');
	assert.match(select, /\buser_id\b/);
	assert.match(select, /\bfull_name\b/);
	assert.match(select, /\blicense_no\b/);
	assert.equal(rows[0].full_name, 'Nguyễn Văn Bình');
	assert.equal(rows[0].date_of_birth, undefined);
	assert.equal(rows[0].phone, undefined);
});
