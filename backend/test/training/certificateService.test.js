// Quy tắc cấp / thu hồi chứng chỉ khóa học (certificateService) — test với
// repository giả: không cần DB, không cần khớp chuỗi SQL. Mẫu cho service đã
// tách repository (xem backend/README.md, mục Khuôn module).
const test = require('node:test');
const assert = require('node:assert/strict');

const events = [];
require('../../src/modules/events/eventService').broadcast = (type, payload) =>
	events.push(payload.entity);
const repo = require('../../src/modules/training/courses/certificateRepository');
const service = require('../../src/modules/training/courses/certificateService');
// logger.error gửi cảnh báo (mail / DB) — tắt trong test
const loggedErrors = [];
require('../../src/config/logger').error = (msg) => loggedErrors.push(msg);
// CME đi kèm giấy (courseCmeService) — thay bằng hàm ghi lại lời gọi, không đụng DB
const cme = require('../../src/modules/training/courses/courseCmeService');
const cmeCalls = [];
cme.syncTrainees = async (...args) => cmeCalls.push(['syncTrainees', ...args]);
cme.withdrawForCertificate = async (...args) => cmeCalls.push(['withdrawForCertificate', ...args]);

// Thay toàn bộ hàm của repository cho từng test; ghi lại lời gọi
const fakeRepo = (impl) => {
	const calls = [];
	for (const name of Object.keys(repo)) {
		repo[name] = async (...args) => {
			calls.push([name, ...args]);
			if (!impl[name]) throw new Error(`repository.${name} không được mong đợi`);
			return impl[name](...args);
		};
	}
	events.length = 0;
	cmeCalls.length = 0;
	return calls;
};
const rejectsWith = (p, statusCode, re) =>
	assert.rejects(p, (e) => e.statusCode === statusCode && re.test(e.message));

test('cấp chứng chỉ cho đăng ký đã duyệt: ghi đúng năm hiện tại, phát sự kiện', async () => {
	const calls = fakeRepo({
		findEnrollmentStatus: () => 'approved',
		insert: () => ({ id: 'CERT01', cert_no: 'CC20260001' }),
	});
	const cert = await service.issueCertificate('DK01', 'NV01', '2027-12-31');
	assert.deepEqual(cert, { id: 'CERT01', cert_no: 'CC20260001' });
	assert.deepEqual(calls[1], [
		'insert',
		{
			enrollmentId: 'DK01',
			actorId: 'NV01',
			year: new Date().getFullYear(),
			expiryDate: '2027-12-31',
		},
	]);
	assert.deepEqual(events, ['certificate']);
});

test('không có đăng ký ⇒ 404; chưa duyệt ⇒ 409; cả hai không ghi gì', async () => {
	let calls = fakeRepo({ findEnrollmentStatus: () => null });
	await rejectsWith(service.issueCertificate('X', 'NV01'), 404, /Không tìm thấy đăng ký/);
	assert.deepEqual(
		calls.map((c) => c[0]),
		['findEnrollmentStatus'],
	);

	calls = fakeRepo({ findEnrollmentStatus: () => 'pending' });
	await rejectsWith(service.issueCertificate('DK02', 'NV01'), 409, /đã được duyệt/);
	assert.deepEqual(
		calls.map((c) => c[0]),
		['findEnrollmentStatus'],
	);
	assert.deepEqual(events, []);
});

test('đăng ký đã có chứng chỉ (repository trả null) ⇒ 409, không phát sự kiện', async () => {
	fakeRepo({ findEnrollmentStatus: () => 'approved', insert: () => null });
	await rejectsWith(service.issueCertificate('DK01', 'NV01'), 409, /đã được cấp chứng chỉ/);
	assert.deepEqual(events, []);
});

test('thu hồi: không có dòng nào đổi ⇒ 404; có ⇒ phát sự kiện', async () => {
	fakeRepo({ revoke: () => 0 });
	await rejectsWith(service.revokeCertificate('C1', 'cấp nhầm', 'NV01'), 404, /đã bị thu hồi/);
	assert.deepEqual(events, []);

	const calls = fakeRepo({ revoke: () => 1 });
	await service.revokeCertificate('C1', 'cấp nhầm', 'NV01');
	assert.deepEqual(calls, [['revoke', { certId: 'C1', reason: 'cấp nhầm', actorId: 'NV01' }]]);
	assert.deepEqual(events, ['certificate']);
});

test('CME đi kèm giấy: cấp ⇒ ghi CME hồ sơ đó; thu hồi ⇒ thu hồi; xoá ⇒ xoá trước khi xoá giấy', async () => {
	fakeRepo({
		findEnrollmentStatus: () => 'approved',
		insert: () => ({ id: 'CERT01', cert_no: 'CC20260001', course_id: 'KH01' }),
	});
	await service.issueCertificate('DK01', 'NV01');
	assert.deepEqual(cmeCalls, [['syncTrainees', 'KH01', 'NV01', { enrollmentId: 'DK01' }]]);

	fakeRepo({ revoke: () => 1 });
	await service.revokeCertificate('C1', 'cấp nhầm', 'NV01');
	assert.deepEqual(cmeCalls, [['withdrawForCertificate', 'C1', 'NV01', { reason: 'cấp nhầm' }]]);

	const calls = fakeRepo({ deleteById: () => cmeCalls.push(['deleteById']) });
	await service.removeCertificate('C1', 'NV01');
	assert.deepEqual(cmeCalls, [
		['withdrawForCertificate', 'C1', 'NV01', { remove: true }],
		['deleteById'],
	]);
	assert.deepEqual(calls, [['deleteById', 'C1']]);
});

test('ghi CME lỗi không làm hỏng việc cấp giấy', async () => {
	const orig = cme.syncTrainees;
	cme.syncTrainees = async () => {
		throw new Error('DB lỗi');
	};
	try {
		fakeRepo({
			findEnrollmentStatus: () => 'approved',
			insert: () => ({ id: 'CERT02', cert_no: 'CC20260002', course_id: 'KH01' }),
		});
		const cert = await service.issueCertificate('DK02', 'NV01');
		assert.equal(cert.id, 'CERT02');
		assert.match(loggedErrors.at(-1), /\[course-cme\] cấp giấy: DB lỗi/);
		assert.deepEqual(events, ['certificate']);
	} finally {
		cme.syncTrainees = orig;
	}
});
