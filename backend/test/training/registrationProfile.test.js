// Điền sẵn form đăng ký khóa học cho nhân viên nội viện đã đăng nhập: gộp hồ sơ học viên >
// bản khai gần nhất > tài khoản nhân sự (registrationProfileService.mergeProfile).
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeProfile } = require('../../src/modules/public/registrationProfileService');

test('hồ sơ học viên ưu tiên hơn bản khai, bản khai hơn tài khoản', () => {
	const out = mergeProfile(
		{
			date_of_birth: new Date('1990-01-01T00:00:00Z'),
			gender: 'Nam',
			phone_number: '0911111111',
			real_email: 'a@bv.vn',
		},
		{
			dob: new Date('1991-02-03T00:00:00Z'),
			phone: null,
			national_id: '040090000001',
			graduated_year: 2015,
		},
		{
			phone: '0922222222',
			email: 'snap@bv.vn',
			ethnicity: 'Kinh',
			degree_number: 'VB-1',
			national_id: '040090009999',
		},
	);
	assert.equal(out.dob, '1991-02-03');
	assert.equal(out.gender, 'male');
	assert.equal(out.phone, '0922222222');
	assert.equal(out.email, 'snap@bv.vn');
	assert.equal(out.national_id, '040090000001');
	assert.equal(out.graduated_year, '2015');
	assert.equal(out.ethnicity, 'Kinh');
	assert.equal(out.degree_number, 'VB-1');
});

test('chỉ có tài khoản nhân sự: lấy ngày sinh / giới tính / SĐT / email thật', () => {
	const out = mergeProfile(
		{
			date_of_birth: '1988-12-31',
			gender: 'female',
			phone_number: ' 0933333333 ',
			real_email: null,
		},
		null,
		null,
	);
	assert.deepEqual(out, { dob: '1988-12-31', gender: 'female', phone: '0933333333' });
});

test('không có dữ liệu ⇒ rỗng, bỏ chuỗi trắng và giới tính lạ', () => {
	assert.deepEqual(mergeProfile(null, { address: '  ', gender: 'xyz' }, {}), {});
});

const {
	usableProfile,
	fillMissing,
} = require('../../src/modules/public/registrationProfileService');

test('usableProfile bỏ giá trị cũ không qua được kiểm tra của form', () => {
	const out = usableProfile({
		dob: '1990-05-01',
		gender: 'male',
		national_id: '123', // sai cấu trúc ⇒ coi như thiếu
		phone: '12345', // sai định dạng
		graduated_year: '15',
		national_id_issued_date: '1980-01-01', // trước ngày sinh
		ethnicity: 'Kinh',
	});
	assert.deepEqual(out, { dob: '1990-05-01', gender: 'male', ethnicity: 'Kinh' });
});

test('fillMissing chỉ điền ô trống, không đè chữ đã nhập, không bao giờ điền email', () => {
	const profile = {
		dob: '1990-05-01',
		ethnicity: 'Kinh',
		degree_number: 'VB-1',
		email: 'a@bv.vn',
		national_id: '040090000001',
	};
	const body = { ethnicity: 'Tày', degree_number: '  ' };
	const filled = fillMissing(body, profile, { sensitive: true });
	assert.deepEqual(filled.sort(), ['degree_number', 'dob', 'national_id']);
	assert.equal(body.ethnicity, 'Tày');
	assert.equal(body.email, undefined);
});

test('fillMissing chưa chứng minh chủ hồ sơ ⇒ không điền dữ liệu nhạy cảm', () => {
	const body = {};
	fillMissing(body, {
		dob: '1990-05-01',
		national_id: '040090000001',
		phone: '0912345678',
		degree_number: 'VB-1',
	});
	assert.deepEqual(body, { degree_number: 'VB-1' });
});
