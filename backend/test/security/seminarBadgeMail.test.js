// L-05: đăng ký hội nghị ẩn danh không được gửi mail "Thẻ đại biểu" tới email tự gõ.
// Chỉ nội viện (email lấy từ hồ sơ tài khoản) mới được gửi; ngoại viện chỉ xem vé trên màn hình.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

install(async (text) => {
	if (/FROM seminars s WHERE s.public_token/.test(text))
		return [{ id: 'HN1', title: 'HN', scope: 'hosted', registration_open: true }];
	if (/SELECT id, code FROM roles/.test(text)) return [{ id: 'VT09', code: 'trainee' }];
	if (/WHERE u.staff_number = @sn/.test(text))
		return [
			{
				id: 'U9',
				full_name: 'Nguyễn Văn Bình',
				staff_number: 123,
				email: 'binh@bv.vn',
				department_name: 'Khoa Nội',
			},
		];
	return [];
});
require('../../src/modules/seminars/seminarParticipantService').add = async () => ({ id: 'P1' });
require('../../src/modules/forms/formCustomValueService').save = async () => null;
require('../../src/modules/persons/personService').syncPerson = async () => {};
const queued = [];
require('../../src/modules/notifications/mailQueue').enqueue = (label, job) =>
	queued.push([label, job]);
const seminarPublic = require('../../src/modules/seminars/seminarPublicService');

test('ngoại viện tự gõ email → không xếp hàng gửi thẻ đại biểu, vẫn nhận vé', async () => {
	queued.length = 0;
	const r = await seminarPublic.registerPublic('tok', {
		source: 'external',
		full_name: 'Khách',
		phone: '0912345678',
		email: 'nan-nhan@example.com',
		organization: 'nội dung tùy ý',
	});
	assert.match(r.ticket_code, /^[0-9a-f]{32}$/);
	assert.equal(queued.length, 0);
});

test('nội viện → vẫn gửi thẻ tới email tài khoản', async () => {
	queued.length = 0;
	await seminarPublic.registerPublic('tok', {
		source: 'internal',
		full_name: 'Nguyễn Văn Bình',
		staff_number: '123',
	});
	assert.equal(queued.length, 1);
});
