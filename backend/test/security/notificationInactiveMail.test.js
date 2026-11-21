// L-02 (run-5): pushWithEmail chỉ ghi thông báo trong ứng dụng cho tài khoản đang hoạt
// động, nhưng email (job nền) trước đây chọn lại người nhận theo danh sách gốc, không lọc
// is_active → tài khoản đã khóa / hết hạn vẫn nhận email kết luận duyệt kèm nhận xét.
// CSDL giả chỉ lọc is_active khi câu SQL có điều kiện đó — đúng như CSDL thật.
process.env.LOG_LEVEL = 'silent';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');
const db = require('../../src/config/db');

const USERS = [
	{ id: 'U_ACTIVE', is_active: true, email: 'active@example.test', full_name: 'Đang hoạt động' },
	{ id: 'U_LOCKED', is_active: false, email: 'locked@example.test', full_name: 'Đã khóa' },
];

const log = install(async (text, inputs) => {
	if (/FROM users/.test(text)) {
		const ids = inputs.user_ids
			? JSON.parse(inputs.user_ids)
			: Object.keys(inputs)
					.filter((k) => k !== 'active')
					.map((k) => inputs[k]);
		const filterActive = /is_active\s*=\s*@active/.test(text);
		return USERS.filter((u) => ids.includes(u.id) && (!filterActive || u.is_active));
	}
	return [];
});
db.nextSequenceValues = async (_pool, _name, n) => Array.from({ length: n }, (_, i) => i + 1);

const mailService = require('../../src/modules/notifications/mailService');
const sent = [];
mailService.isEnabled = async () => true;
mailService.send = async (m) => {
	sent.push(m);
};
const mailQueue = require('../../src/modules/notifications/mailQueue');
const notificationService = require('../../src/modules/notifications/notificationService');

test('pushWithEmail: tài khoản is_active = false không nhận thông báo lẫn email', async () => {
	await notificationService.pushWithEmail(
		'topic_result',
		'Kết luận duyệt đề tài',
		['U_ACTIVE', 'U_LOCKED'],
		{ message: 'NHAN_XET_PHAN_BIEN', mailEvent: 'TOPIC_RESULT' },
	);
	await mailQueue.drain();

	const insert = log.find((l) => /INSERT INTO notifications/.test(l.text));
	assert.ok(insert);
	assert.deepEqual(
		Object.keys(insert.inputs)
			.filter((k) => /^u\d+$/.test(k))
			.map((k) => insert.inputs[k]),
		['U_ACTIVE'],
	);

	assert.deepEqual(
		sent.map((m) => m.to),
		['active@example.test'],
	);
	const mailQuery = log.find((l) => /SELECT id, email, full_name FROM users/.test(l.text));
	assert.match(mailQuery.text, /is_active\s*=\s*@active/);
	assert.equal(mailQuery.inputs.active, true);
});
