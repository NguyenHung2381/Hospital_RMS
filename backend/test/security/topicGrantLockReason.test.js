// L-08 (run-4): cấp tài khoản thành viên đề tài (topicMemberService.grantAccounts) chỉ
// được mở lại tài khoản bị khóa vì HẾT HẠN (users.deactivated_reason = 'expired', do job
// accountMaintenanceJob đặt). Tài khoản quản trị khóa tay — dù cũng đã quá hạn — phải
// giữ nguyên khóa và người cấp nhận ghi chú "cần quản trị kích hoạt lại".
process.env.LOG_LEVEL = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const ROLES = [
	{ id: 'VT05', code: 'topic_leader' },
	{ id: 'VT06', code: 'member' },
];
const PAST = new Date('2020-01-01');
const mk = (id, role_code, reason) => ({
	id,
	username: id,
	role_id: role_code === 'member' ? 'VT06' : 'VT05',
	role_code,
	is_active: 0,
	account_expires_at: PAST,
	deactivated_reason: reason,
});
// Tra theo mã NV của thành viên
const EXISTING = {
	1: mk('U_LEADER_ADMINLOCK', 'topic_leader', null), // khóa tay, đã quá hạn
	2: mk('U_MEMBER_ADMINLOCK', 'member', null), // khóa tay trước hạn, nay đã quá hạn
	3: mk('U_MEMBER_EXPIRED', 'member', 'expired'), // job hết hạn khóa
	4: mk('U_LEADER_STALE', 'topic_leader', 'admin'), // lý do khác
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
	return [];
});
require('../../src/modules/persons/personService').linkTopicMemberToUser = async () => {};
require('../../src/modules/notifications/notificationService').pushWithEmail = async () => {};
require('../../src/modules/events/eventService').broadcast = () => {};
const { grantAccounts } = require('../../src/modules/topics/topicMemberService');

const member = (id, staff_number, role) => ({
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

const grant = async (m) => {
	members = [m];
	const from = log.length;
	const { credentials } = await grantAccounts('DT1', null, 'ACTOR');
	const upd = log.slice(from).find((q) => /UPDATE users/.test(q.text));
	return { cred: credentials[0], upd };
};

test('L-08: tài khoản chủ nhiệm bị quản trị khóa (đã quá hạn) KHÔNG được mở lại', async () => {
	const { cred, upd } = await grant(member('TM1', 1, 'leader'));
	// SQL chỉ mở lại khi deactivated_reason = 'expired' (CASE kiểm trên chính dòng đó)
	assert.match(upd.text, /is_active = 'false' AND deactivated_reason = 'expired'/);
	// …và người cấp được báo cần quản trị mở
	assert.match(cred.note, /quản trị kích hoạt lại/);
	assert.equal(cred.password_plain, null);
});

test('L-08: tài khoản thành viên bị khóa tay trước hạn (nay quá hạn) KHÔNG được mở lại', async () => {
	const { cred } = await grant(member('TM2', 2, 'member'));
	assert.match(cred.note, /quản trị kích hoạt lại/);
});

test('L-08: lý do khóa khác "expired" cũng không được mở lại', async () => {
	const { cred } = await grant(member('TM4', 4, 'leader'));
	assert.match(cred.note, /quản trị kích hoạt lại/);
});

test('L-08 (đối chứng): tài khoản bị job hết hạn khóa vẫn được mở lại, xóa lý do khóa', async () => {
	const { cred, upd } = await grant(member('TM3', 3, 'member'));
	assert.equal(cred.note, null); // không cần quản trị
	assert.match(upd.text, /deactivated_reason = CASE[\s\S]*THEN NULL/);
	assert.equal(upd.inputs.expires_at.getFullYear(), 2030); // gia hạn theo đợt
});

test('L-08: job hết hạn ghi deactivated_reason = expired khi khóa tài khoản', async () => {
	// fakeDb dùng chung trong file: nạp job sau khi đã cài handler
	const db = require('../../src/config/db');
	const roleCodes = require('../../src/modules/access/roleCodes');
	const { deactivateExpired } = require('../../src/jobs/accountMaintenanceJob');
	roleCodes.clear();
	const from = log.length;
	const tx = new db.sql.Transaction();
	// đếm trước (COUNT) rồi khóa: handler mặc định trả [] ⇒ n = undefined → ép số 0 sẽ lỗi,
	// nên dựng request giả trả n = 1 cho câu COUNT.
	const realRequest = tx.request.bind(tx);
	tx.request = () => {
		const req = realRequest();
		const q = req.query;
		req.query = async (text) => {
			const r = await q(text);
			return /COUNT\(\*\) AS n/.test(text) ? { ...r, recordset: [{ n: 1 }] } : r;
		};
		return req;
	};
	assert.equal(await deactivateExpired(tx), 1);
	const lock = log.slice(from).find((q) => /UPDATE users SET is_active = @off/.test(q.text));
	assert.match(lock.text, /deactivated_reason = 'expired'/);
});
