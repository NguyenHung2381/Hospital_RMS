// Tập huấn bệnh viện (seminars/hospitalTraining + hospitalTrainingSelfService) với CSDL
// giả: bộ lọc danh sách, tiết ⇒ tín chỉ CME, ghi khoa bắt buộc, nhân viên tự đăng ký /
// hủy (chỉ dòng tự đăng ký, chưa điểm danh, trước ngày học, khoa không bắt buộc).
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let row = null; // dòng buổi tập huấn trả cho SELECT của self-service
const log = install(async (text) => (text.includes('FROM seminars s') ? (row ? [row] : []) : []));
const db = require('../../src/config/db');

const ht = require('../../src/modules/seminars/hospitalTraining');
const participants = require('../../src/modules/seminars/seminarParticipantService');
const calls = [];
let inserted = 1;
participants.addUsers = async (...a) => {
	calls.push(['addUsers', ...a]);
	return { inserted };
};
participants.remove = async (...a) => {
	calls.push(['remove', ...a]);
};
const self = require('../../src/modules/seminars/hospitalTrainingSelfService');

test('trainingFilter: 1 = chỉ tập huấn BV, 0 = loại trừ, khác = không lọc', () => {
	assert.equal(ht.trainingFilter('1'), ht.HOSPITAL_TRAINING_SQL);
	assert.equal(ht.trainingFilter(true), ht.HOSPITAL_TRAINING_SQL);
	assert.equal(ht.trainingFilter('0'), `NOT ${ht.HOSPITAL_TRAINING_SQL}`);
	assert.equal(ht.trainingFilter(false), `NOT ${ht.HOSPITAL_TRAINING_SQL}`);
	for (const v of [undefined, '', '2', 'true']) assert.equal(ht.trainingFilter(v), '');
});

test('applyLessonCredits: tập huấn có số tiết ⇒ tín chỉ mặc định = số tiết; loại khác / thiếu tiết giữ nguyên', () => {
	assert.equal(
		ht.applyLessonCredits({ event_type: 'training', lesson_hours: 3.5, cme_default_credits: 1 })
			.cme_default_credits,
		3.5,
	);
	for (const d of [
		{ event_type: 'training', lesson_hours: '', cme_default_credits: 1 },
		{ event_type: 'training', lesson_hours: null, cme_default_credits: 1 },
		{ event_type: 'seminar', lesson_hours: 4, cme_default_credits: 1 },
	])
		assert.equal(ht.applyLessonCredits(d).cme_default_credits, 1);
});

test('parseTraining: khoa bắt buộc dạng JSON ⇒ mảng, rỗng ⇒ []', () => {
	assert.deepEqual(
		ht.parseTraining({ id: 'S1', required_departments: '[{"id":"K1"}]' }).required_departments,
		[{ id: 'K1' }],
	);
	assert.deepEqual(
		ht.parseTraining({ id: 'S1', required_departments: null }).required_departments,
		[],
	);
});

const pool = { request: () => new db.sql.Request() };

test('setRequiredDepartments: undefined ⇒ không đổi; [] ⇒ chỉ xóa; bỏ trùng / rỗng, mã qua tham số', async () => {
	log.length = 0;
	await ht.setRequiredDepartments(pool, 'S1', undefined);
	assert.equal(log.length, 0);

	await ht.setRequiredDepartments(pool, 'S1', []);
	assert.match(log[0].text, /DELETE FROM seminar_required_departments WHERE seminar_id = @sid/);
	assert.ok(!log[0].text.includes('INSERT'));

	log.length = 0;
	await ht.setRequiredDepartments(pool, 'S1', ['K1', 'K1', '', null, "K2'); DROP TABLE x; --"]);
	const all = log.map((l) => l.text).join('\n');
	assert.ok(!all.includes('DROP TABLE'));
	const inputs = Object.assign({}, ...log.map((l) => l.inputs));
	assert.deepEqual(
		Object.keys(inputs)
			.filter((k) => /^d\d+$/.test(k))
			.map((k) => inputs[k]),
		['K1', "K2'); DROP TABLE x; --"],
	);
	assert.equal(inputs.sid, 'S1');
});

test('setRequiredDepartments: mỗi lần query chỉ 1 câu SQL (PostgreSQL không nhận nhiều câu có tham số)', async () => {
	log.length = 0;
	await ht.setRequiredDepartments(pool, 'S1', ['K1', 'K2']);
	for (const { text } of log) {
		const statements = text.split(';').filter((s) => s.trim());
		assert.equal(statements.length, 1, text);
	}
});

// ── Nhân viên tự đăng ký ────────────────────────────────────────────────────
const base = (over = {}) => ({
	id: 'S1',
	title: 'Tập huấn PCCC',
	participant_id: null,
	self_registered: false,
	required: false,
	checked_in_at: null,
	open: true,
	before_day: true,
	...over,
});

test('listForMe: tính registered / can_register / can_cancel cho từng buổi', async () => {
	const cases = [
		[base(), { registered: false, can_register: true, can_cancel: false }],
		[base({ open: false }), { registered: false, can_register: false, can_cancel: false }],
		[
			base({ participant_id: 5, self_registered: true }),
			{ registered: true, can_register: false, can_cancel: true },
		],
		[
			base({ participant_id: 5, self_registered: true, required: true }),
			{ registered: true, can_register: false, can_cancel: false },
		],
		[
			base({ participant_id: 5, self_registered: true, checked_in_at: new Date() }),
			{ registered: true, can_register: false, can_cancel: false },
		],
		[
			base({ participant_id: 5, self_registered: true, before_day: false }),
			{ registered: true, can_register: false, can_cancel: false },
		],
		[
			base({ participant_id: 5, self_registered: false }),
			{ registered: true, can_register: false, can_cancel: false },
		],
	];
	for (const [r, want] of cases) {
		row = r;
		const [got] = await self.listForMe('U1');
		assert.deepEqual(
			{ registered: got.registered, can_register: got.can_register, can_cancel: got.can_cancel },
			want,
			JSON.stringify(r),
		);
	}
	assert.equal(log.at(-1).inputs.uid, 'U1');
	assert.match(log.at(-1).text, /s\.event_type = 'training' AND s\.scope = 'hosted'/);
});

test('register: không tồn tại ⇒ 404; đã có tên / đã diễn ra ⇒ 409, không thêm', async () => {
	calls.length = 0;
	row = null;
	await assert.rejects(self.register('S9', 'U1'), { statusCode: 404 });
	row = base({ participant_id: 5 });
	await assert.rejects(self.register('S1', 'U1'), {
		statusCode: 409,
		message: /đã có trong danh sách/,
	});
	row = base({ open: false });
	await assert.rejects(self.register('S1', 'U1'), { statusCode: 409, message: /đã diễn ra/ });
	assert.equal(calls.length, 0);
});

test('register: thêm chính mình (người tạo = mình); yêu cầu song song chèn 0 dòng ⇒ 409', async () => {
	calls.length = 0;
	row = base();
	inserted = 1;
	await self.register('S1', 'U1');
	assert.deepEqual(calls[0], ['addUsers', 'S1', ['U1'], 'U1']);
	inserted = 0;
	await assert.rejects(self.register('S1', 'U1'), { statusCode: 409 });
	inserted = 1;
});

test('cancel: chưa đăng ký ⇒ 404; không hủy được ⇒ 409 nêu đúng lý do; được ⇒ xóa đúng dòng của mình', async () => {
	calls.length = 0;
	row = base();
	await assert.rejects(self.cancel('S1', 'U1'), { statusCode: 404 });
	const reg = { participant_id: 5, self_registered: true };
	for (const [over, why] of [
		[{ required: true }, /khoa của bạn bắt buộc/],
		[{ self_registered: false }, /phòng Đào tạo thêm/],
		[{ checked_in_at: new Date() }, /đã điểm danh/],
		[{ before_day: false }, /đã tới ngày học/],
	]) {
		row = base({ ...reg, ...over });
		await assert.rejects(self.cancel('S1', 'U1'), { statusCode: 409, message: why });
	}
	assert.equal(calls.length, 0);
	row = base(reg);
	await self.cancel('S1', 'U1');
	assert.deepEqual(calls[0], ['remove', 'S1', 5, 'U1']);
});
