// Chặn lỗi ở tầng ứng dụng thay vì để ràng buộc CHECK của CSDL bắn ra:
// - đợt nghiên cứu: ngày kết thúc < ngày bắt đầu ⇒ 400 trước khi ghi (chk_rr_dates);
// - cấp tài khoản học viên: lỗi CSDL (vd. chk_user_id) không trả nguyên văn ra "lý do bỏ qua".
process.env.LOG_LEVEL = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let handler = async () => [];
const log = install((text, inputs) => handler(text, inputs));
require('../../src/modules/events/eventService').broadcast = () => {};
const roundService = require('../../src/modules/rounds/roundService');
const traineeAccount = require('../../src/modules/training/trainees/traineeAccountService');

const wrote = (re) => log.some((l) => re.test(l.text));

test('đợt nghiên cứu: tạo với ngày kết thúc trước ngày bắt đầu ⇒ 400, không ghi', async () => {
	log.length = 0;
	handler = async () => [];
	await assert.rejects(
		roundService.create(
			{
				name: 'Đợt 1',
				year: 2027,
				round_number: 1,
				start_date: '2027-05-10',
				end_date: '2027-05-01',
				level_ids: ['CD01'],
			},
			'ADMIN',
		),
		(e) => e.statusCode === 400 && /Ngày kết thúc đợt/.test(e.message),
	);
	assert.equal(wrote(/INSERT INTO research_rounds/), false);
});

test('đợt nghiên cứu: sửa cả 2 ngày ngược nhau ⇒ 400, không UPDATE', async () => {
	log.length = 0;
	handler = async () => [];
	await assert.rejects(
		roundService.update('DOT20271', { start_date: '2027-05-10', end_date: '2027-05-01' }, 'ADMIN'),
		(e) => e.statusCode === 400,
	);
	assert.equal(wrote(/UPDATE research_rounds/), false);
});

test('đợt nghiên cứu: chỉ sửa ngày kết thúc, trước ngày bắt đầu đang lưu ⇒ 400, không UPDATE', async () => {
	log.length = 0;
	handler = async (text) => (/COALESCE\(@end_date, end_date\)/.test(text) ? [{ x: 1 }] : []);
	await assert.rejects(
		roundService.update('DOT20271', { end_date: '2027-01-01' }, 'ADMIN'),
		(e) => e.statusCode === 400 && /Ngày kết thúc đợt/.test(e.message),
	);
	assert.equal(wrote(/UPDATE research_rounds/), false);
});

test('đợt nghiên cứu: ngày hợp lệ ⇒ vẫn UPDATE', async () => {
	log.length = 0;
	handler = async () => [];
	// getById sau UPDATE không có dữ liệu giả ⇒ có thể ném lỗi; chỉ cần đã ghi
	await roundService.update('DOT20271', { end_date: '2027-12-31' }, 'ADMIN').catch(() => {});
	assert.equal(wrote(/UPDATE research_rounds/), true);
});

test('cấp tài khoản học viên: lỗi CSDL ⇒ lý do bỏ qua là thông điệp chung, không lộ tên ràng buộc', async () => {
	log.length = 0;
	handler = async (text) => {
		if (/FROM trainees t/.test(text))
			return [
				{
					id: 'HV20270001',
					full_name: 'Nguyễn Văn A',
					email: null,
					phone: null,
					is_active: true,
					hidden_at: null,
					account_granted: false,
				},
			];
		if (/FROM roles/.test(text)) return [{ id: 'VT09', code: 'trainee' }];
		if (/INSERT INTO users/.test(text))
			throw Object.assign(
				new Error('new row for relation "users" violates check constraint "chk_user_id"'),
				{ code: '23514', severity: 'ERROR', constraint: 'chk_user_id' },
			);
		return [];
	};
	const r = await traineeAccount.grantAccounts(['HV20270001'], 'ADMIN');
	assert.equal(r.credentials.length, 0);
	assert.equal(r.skipped.length, 1);
	assert.equal(wrote(/INSERT INTO users/), true, 'phải chạy tới câu INSERT bị lỗi');
	assert.doesNotMatch(r.skipped[0].reason, /chk_user_id|violates|relation/);
	assert.equal(wrote(/^ROLLBACK$/), true);
});
