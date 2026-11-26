// Rà bảo mật 2026-11-26 (phiên security).
//
// S-06: kiểm "không vượt số còn phải nộp" của recordPayment / submitMine / confirmPayment
//       nằm NGOÀI transaction ⇒ 2 thao tác song song cùng thấy "còn đủ" rồi cùng ghi ⇒ nộp
//       thừa mà vẫn cấp biên lai. Mô phỏng: lúc kiểm sơ bộ chưa có khoản nào; tới lúc vào
//       transaction (sau khi khóa dòng enrollment_fees) thì khoản của thao tác kia đã commit.
//       Sau sửa: khóa enrollment_fees FOR UPDATE, tính lại trong transaction, vượt ⇒ 409.
// S-07: thông báo "học viên báo đã chuyển khoản" (họ tên + số tiền) gửi tới MỌI người có
//       courses:approve, kể cả giảng viên phạm vi 'assigned' không dạy khóa đó.
//       Sau sửa: phạm vi 'all', hoặc 'assigned' và được phân công khóa này.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

const EID = 'DK202611050001';
const ENROLL = {
	enrollment_id: EID,
	enrollment_status: 'approved',
	course_id: 'KH1',
	course_name: 'Khóa A',
	trainee_name: 'Nguyễn Văn A',
	has_fee_row: 1,
	base_amount: 2000000,
	discount_amount: 0,
};
// Khoản do thao tác song song vừa commit — chỉ thấy được khi đọc lại TRONG transaction
let committedByOther = [];
let pendingRow = null; // khoản chờ cho confirmPayment

const log = install(async (text, inputs) => {
	if (/FROM course_enrollments e/.test(text) && /WHERE e\.id = @eid/.test(text)) return [ENROLL];
	if (/FROM tuition_payments p/.test(text)) return []; // kiểm sơ bộ ngoài transaction
	if (/FROM enrollment_fees WHERE enrollment_id = @eid FOR UPDATE/.test(text))
		return [{ base_amount: 2000000, discount_amount: 0 }];
	if (/SELECT amount, status FROM tuition_payments WHERE enrollment_id = @eid/.test(text))
		return committedByOther;
	if (/SELECT id, enrollment_id, amount, status FROM tuition_payments WHERE id = @id/.test(text))
		return pendingRow ? [pendingRow] : [];
	if (/UPDATE tuition_payments SET status = 'confirmed'/.test(text)) return [{ id: inputs.id }];
	// S-07: vai trò → người dùng; phân công khóa KH1 chỉ có U_GV1
	if (/SELECT id FROM roles/.test(text)) return [{ id: 'R_ALL' }, { id: 'R_GV' }, { id: 'R_X' }];
	if (/SELECT id FROM users WHERE is_active/.test(text)) {
		const roles = Object.values(inputs);
		const byRole = { R_ALL: ['U_ADMIN'], R_GV: ['U_GV1', 'U_GV2'], R_X: ['U_X'] };
		return roles.flatMap((r) => byRole[r] ?? []).map((id) => ({ id }));
	}
	if (/FROM lecturer_assignments/.test(text))
		return inputs.course_id === 'KH1' ? [{ user_id: 'U_GV1' }] : [];
	return [];
});

const permCache = require('../../src/permissions/permissionCache');
permCache.load = async (roleId) => {
	const grants = {
		R_ALL: [['courses:approve', 'all']],
		R_GV: [
			['courses:approve', 'assigned'],
			['courses:read', 'assigned'],
		],
		R_X: [['courses:read', 'all']],
	}[roleId];
	return { keys: new Set(grants.map(([k]) => k)), scopes: new Map(grants) };
};
const notificationService = require('../../src/modules/notifications/notificationService');
const pushed = [];
notificationService.push = async (type, _title, recipients) => {
	pushed.push({ type, recipients });
};
const trainingFileService = require('../../src/modules/training/trainingFileService');
trainingFileService.saveUploadedFile = async () => ({ id: 'TF1' });
trainingFileService.softDelete = async () => {};
require('../../src/modules/training/tuition/tuitionSettings').getBankInfo = async () => null;

const tuitionService = require('../../src/modules/training/tuition/tuitionService');
const file = { originalname: 'chung-tu.png', path: '/nonexistent/x.png' };
const inserts = (n) => log.slice(n).filter((e) => /INSERT INTO tuition_payments/.test(e.text));

test('S-06: cán bộ ghi nhận song song — khoản kia vừa commit làm vượt số phải nộp ⇒ 409, không ghi', async () => {
	committedByOther = [{ amount: 1500000, status: 'confirmed' }];
	const n = log.length;
	await assert.rejects(
		tuitionService.recordPayment(
			'KH1',
			EID,
			{ amount: 1000000, method: 'cash', paid_date: '2026-11-20' },
			'U_STAFF',
		),
		{ statusCode: 409 },
	);
	assert.equal(inserts(n).length, 0);
	assert.ok(log.slice(n).some((e) => /^ROLLBACK$/.test(e.text)));
});

test('S-06: học viên gửi 2 lần song song — lần sau vượt (đã trừ khoản chờ) ⇒ 409, không ghi', async () => {
	committedByOther = [{ amount: 1500000, status: 'pending' }];
	const n = log.length;
	await assert.rejects(
		tuitionService.submitMine('U_HV', EID, { amount: 1000000, paid_date: '2026-11-20' }, file),
		{ statusCode: 409 },
	);
	assert.equal(inserts(n).length, 0);
});

test('S-06: xác nhận khoản chờ khi đã đủ (khoản tại quầy vừa ghi) ⇒ 409, không cấp biên lai', async () => {
	pendingRow = { id: 'NP202611260002', enrollment_id: EID, amount: '1000000', status: 'pending' };
	committedByOther = [
		{ amount: 1500000, status: 'confirmed' },
		{ amount: 1000000, status: 'pending' },
	];
	const n = log.length;
	await assert.rejects(tuitionService.confirmPayment('KH1', 'NP202611260002', 'U_STAFF'), {
		statusCode: 409,
	});
	assert.equal(
		log.slice(n).some((e) => /UPDATE tuition_payments SET status = 'confirmed'/.test(e.text)),
		false,
	);
});

test('S-06: còn đủ thì vẫn ghi nhận bình thường', async () => {
	committedByOther = [{ amount: 500000, status: 'confirmed' }];
	const n = log.length;
	await tuitionService.recordPayment(
		'KH1',
		EID,
		{ amount: 1000000, method: 'cash', paid_date: '2026-11-20' },
		'U_STAFF',
	);
	assert.equal(inserts(n).length, 1);
});

test("S-07: thông báo khoản chờ chỉ tới phạm vi 'all' + giảng viên được phân công khóa", async () => {
	committedByOther = [];
	pushed.length = 0;
	await tuitionService.submitMine('U_HV', EID, { amount: 500000, paid_date: '2026-11-20' }, file);
	const sent = pushed.find((p) => p.type === 'tuition_submitted');
	assert.ok(sent);
	assert.deepEqual([...sent.recipients].sort(), ['U_ADMIN', 'U_GV1']);
});
