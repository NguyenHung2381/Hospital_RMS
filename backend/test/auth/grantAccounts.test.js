// Cấp tài khoản thành viên đề tài (topicMemberService.grantAccounts) với CSDL
// giả: thành viên khớp mã NV / email với tài khoản CÓ SẴN không được làm thay
// đổi mật khẩu, vai trò, khoa, username, hạn dùng hay trạng thái của tài khoản đó.
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('./fakeDb');

const ROLES = [
	{ id: 'VT01', code: 'admin' },
	{ id: 'VT05', code: 'topic_leader' },
	{ id: 'VT06', code: 'member' },
];
// Tài khoản có sẵn, tra theo mã NV của thành viên
const EXISTING = {
	100: { id: 'NVADMIN01', username: 'quantri', role_id: 'VT01', role_code: 'admin', is_active: 1, account_expires_at: null },
	200: { id: 'NVK1_0200', username: 'NVB_0200', role_id: 'VT06', role_code: 'member', is_active: 0, account_expires_at: new Date('2020-01-01') },
	300: { id: 'NVK1_0300', username: 'NVC_0300', role_id: 'VT06', role_code: 'member', is_active: 0, account_expires_at: new Date('2999-01-01') },
};
let members = [];

const log = install(async (text, inputs) => {
	if (/FROM roles WHERE code IS NOT NULL/.test(text)) return ROLES;
	if (/SELECT id, status FROM topics/.test(text)) return [{ id: 'DT1', status: 'approved' }];
	if (/FROM topic_members tm/.test(text)) return members;
	if (/SELECT d\.code/.test(text)) return [{ code: 'K1' }];
	if (/WHERE u\.topic_member_id = @member_id/.test(text)) {
		const u = EXISTING[inputs.staff_number];
		return u ? [u] : [];
	}
	if (/EXEC sp_gen_user_id/.test(text)) return [{ new_id: 'NVK10999' }];
	return [];
});
require('../../src/modules/persons/personService').linkTopicMemberToUser = async () => {};
require('../../src/modules/notifications/notificationService').push = async () => {};
require('../../src/modules/events/eventService').broadcast = () => {};
const { grantAccounts } = require('../../src/services/topicMemberService');

const member = (id, staff_number, role = 'member') => ({
	id,
	ho_ten: 'Nguyễn Văn B',
	email: null,
	staff_number,
	phone_number: null,
	position: null,
	role,
	member_department_id: 'K9',
	topic_department_id: 'K1',
	end_date: new Date('2030-12-31'),
});

const writesFor = (from, uid) =>
	log.slice(from).filter((q) => /UPDATE users|INSERT INTO users/.test(q.text) && q.inputs.uid === uid);

test('tài khoản quản trị trùng mã NV: chỉ liên kết, không đổi mật khẩu/vai trò/khoa/username', async () => {
	members = [member('TM1', 100, 'leader')];
	const from = log.length;
	const { credentials } = await grantAccounts('DT1', null, 'ACTOR');
	const writes = writesFor(from, 'NVADMIN01');
	assert.equal(writes.length, 1);
	assert.doesNotMatch(writes[0].text, /password|role_id|department_id|username|is_active|account_expires_at/);
	assert.equal(credentials[0].username, 'quantri');
	assert.equal(credentials[0].password_plain, null);
	assert.ok(credentials[0].note);
});

test('tài khoản thành viên đã hết hạn: mở lại + gia hạn, không đổi mật khẩu/khoa/username', async () => {
	members = [member('TM2', 200)];
	const from = log.length;
	const { credentials } = await grantAccounts('DT1', null, 'ACTOR');
	const [w] = writesFor(from, 'NVK1_0200');
	assert.match(w.text, /is_active = CASE/);
	assert.doesNotMatch(w.text, /password|department_id|username/);
	assert.equal(w.inputs.role_id, 'VT06'); // thành viên thường: giữ vai trò
	assert.equal(credentials[0].password_plain, null);
	assert.equal(credentials[0].note, null);
});

test('tài khoản thành viên bị khoá tay (chưa hết hạn): báo cần quản trị mở lại', async () => {
	members = [member('TM3', 300, 'leader')];
	const from = log.length;
	const { credentials } = await grantAccounts('DT1', null, 'ACTOR');
	const [w] = writesFor(from, 'NVK1_0300');
	assert.equal(w.inputs.role_id, 'VT05'); // được nâng lên chủ nhiệm
	assert.match(credentials[0].note, /khoá/);
});

test('thành viên chưa có tài khoản: tạo mới với mật khẩu mặc định = tên đăng nhập, bắt đổi', async () => {
	members = [member('TM4', 400)];
	const from = log.length;
	const { credentials } = await grantAccounts('DT1', null, 'ACTOR');
	const [w] = writesFor(from, 'NVK10999');
	assert.match(w.text, /INSERT INTO users[\s\S]*must_change_password/);
	assert.ok(credentials[0].username);
	assert.equal(credentials[0].password_plain, credentials[0].username);
});
