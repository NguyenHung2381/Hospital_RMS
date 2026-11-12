// Vé QR hội nghị (ticket_code) chỉ trả cho chính chủ ở cổng "CME của tôi" —
// nhân viên nội viện tự đăng ký không nhận vé trên trình duyệt nên phải mở được ở
// đây; hồ sơ học viên (getTraineeCme) không được lộ vé (vé = điểm danh + làm bài test).
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../../src/config/db');
db.getPool = async () => ({
	request: () => ({
		input() {
			return this;
		},
	}),
});
db.queryAll = async () => [
	[
		{
			id: 'SPT1',
			seminar_id: 'S1',
			cme_year: null,
			cme_credits: null,
			ticket_code: 'a'.repeat(32),
			checked_in_at: null,
		},
	],
	[],
	[],
];
require('../../src/modules/forms/formCustomValueService').attach = async (_k, rows) => rows;

const { getUserCme } = require('../../src/modules/cme/cmeUserService');

test('getUserCme: mặc định không trả ticket_code', async () => {
	const r = await getUserCme('U1', null);
	assert.equal('ticket_code' in r.seminars[0], false);
});

test('getUserCme: withTicket (cổng của tôi) trả ticket_code', async () => {
	const r = await getUserCme('U1', null, { withTicket: true });
	assert.equal(r.seminars[0].ticket_code, 'a'.repeat(32));
});
