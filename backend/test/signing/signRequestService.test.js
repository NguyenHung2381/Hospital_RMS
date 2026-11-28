// Luồng trình ký (signRequestService): bước nối tiếp, ký song song all / any, hoàn tất, từ chối,
// ký lỗi giữa chừng. Repository / file / VIN-HSM / thông báo đều giả — không cần DB, không ra mạng.
const test = require('node:test');
const assert = require('node:assert/strict');

require('../../src/config/logger').error = () => {};
const db = require('../../src/config/db');
// Cấu hình ký số: mặc định (bật hết) — không đọc DB
const settingsStore = new Map();
require('../../src/modules/settings/systemSettingService').getValue = async (k, fb) =>
	settingsStore.get(k) ?? fb;
const repo = require('../../src/modules/signing/requests/signRequestRepository');
const storage = require('../../src/modules/signing/requests/signRequestStorage');
const signing = require('../../src/modules/signing/signingService');
const notif = require('../../src/modules/notifications/notificationService');
require('../../src/modules/events/eventService').broadcast = () => {};
const service = require('../../src/modules/signing/requests/signRequestService');

db.withTransaction = async (fn) => fn({});
const notices = [];
notif.pushWithEmail = async (type, _title, ids) => {
	notices.push([type, [...ids].sort()]);
};
signing.signerNameOf = async (_uid, fb) => fb;

// ─── Trạng thái giả trong bộ nhớ ───────────────────────────────────────────
let S;
const files = new Map();
const reset = ({ steps, docs = 1, fields = [] }) => {
	notices.length = 0;
	files.clear();
	let sid = 0;
	S = {
		req: { id: 1, title: 'Hồ sơ A', status: 'in_progress', current_step: 1, created_by: 'C' },
		steps: steps.map((s, i) => ({ step_no: i + 1, mode: s.mode })),
		signers: steps.flatMap((s, i) =>
			s.users.map((u) => ({
				id: ++sid,
				step_no: i + 1,
				user_id: u,
				status: i === 0 ? 'pending' : 'waiting',
			})),
		),
		docs: Array.from({ length: docs }, (_, i) => ({
			id: 10 + i,
			file_name: `vb${i + 1}.pdf`,
			page_count: 2,
			current_version: 1,
			current_path: `p/${10 + i}-v1`,
		})),
		fields,
		events: [],
	};
	for (const d of S.docs) files.set(d.current_path, Buffer.from('%PDF-1.7 goc'));
};
repo.lockRequest = async () => S.req;
repo.findRequest = async () => ({
	...S.req,
	creator_name: 'Người tạo',
	total_steps: S.steps.length,
});
repo.listSigners = async () => S.signers.map((s) => ({ ...s }));
repo.listSteps = async () => S.steps;
repo.listDocuments = async () => S.docs;
repo.listFields = async () => S.fields;
repo.listEvents = async () => S.events;
repo.updateSigner = async (_tx, id, { status, note }) => {
	Object.assign(
		S.signers.find((s) => s.id === id),
		{ status, note },
	);
};
repo.setStepSignersStatus = async (_tx, _rid, step, from, to) =>
	S.signers
		.filter((s) => s.step_no === step && s.status === from)
		.map((s) => {
			s.status = to;
			return s.user_id;
		});
repo.closeOpenSigners = async () => {
	for (const s of S.signers)
		if (s.status === 'waiting' || s.status === 'pending') s.status = 'skipped';
};
repo.updateRequest = async (_tx, _id, d) => {
	if (d.status) S.req.status = d.status;
	if (d.currentStep) S.req.current_step = d.currentStep;
};
repo.insertEvent = async (_tx, e) => S.events.push(e);
repo.insertVersion = async () => {};
repo.setDocumentCurrent = async (_tx, docId, { version, path }) => {
	Object.assign(
		S.docs.find((d) => d.id === docId),
		{ current_version: version, current_path: path },
	);
};
storage.read = async (rel) => files.get(rel);
storage.write = async (rel, buf) => files.set(rel, buf);
const removed = [];
storage.removeAll = async (rels) => {
	removed.push(...rels);
	rels.forEach((r) => files.delete(r));
};
let signCalls = [];
signing.signPdfAsUser = async (uid, pdf, opt) => {
	signCalls.push({ uid, ...opt });
	return Buffer.concat([pdf, Buffer.from(` +${uid}`)]);
};
const field = (doc, signerId) => ({
	document_id: doc,
	signer_id: signerId,
	page: 1,
	x: 300,
	y: 100,
	width: 180,
	height: 57,
});
const status = () => Object.fromEntries(S.signers.map((s) => [s.user_id, s.status]));

test.beforeEach(() => {
	signCalls = [];
	removed.length = 0;
});

test('bước "all": đủ người ký mới sang bước sau; bước sau được báo tới lượt', async () => {
	reset({
		steps: [
			{ mode: 'all', users: ['A', 'B'] },
			{ mode: 'all', users: ['D'] },
		],
		fields: [field(10, 1), field(10, 2), field(10, 3)],
	});
	const o = await service.sign(1, { id: 'A', full_name: 'Anh A' });
	assert.equal(o.status, 'in_progress');
	assert.equal(S.req.current_step, 1);
	assert.deepEqual(status(), { A: 'signed', B: 'pending', D: 'waiting' });
	await service.sign(1, { id: 'B' });
	assert.equal(S.req.current_step, 2);
	assert.deepEqual(status(), { A: 'signed', B: 'signed', D: 'pending' });
	assert.deepEqual(notices.at(-1), ['sign_request', ['D']]);
	// Ký nối tiếp: B ký lên bản A đã ký
	assert.equal(files.get(S.docs[0].current_path).toString(), '%PDF-1.7 goc +A +B');
	assert.equal(S.docs[0].current_version, 3);
});

test('bước "any": 1 người ký là đủ, người còn lại chuyển skipped', async () => {
	reset({
		steps: [
			{ mode: 'any', users: ['A', 'B'] },
			{ mode: 'all', users: ['D'] },
		],
		fields: [field(10, 1), field(10, 3)],
	});
	await service.sign(1, { id: 'A' });
	assert.deepEqual(status(), { A: 'signed', B: 'skipped', D: 'pending' });
	await assert.rejects(service.sign(1, { id: 'B' }), (e) => e.statusCode === 409);
});

test('bước cuối xong ⇒ hồ sơ hoàn tất, báo người tạo + mọi người ký', async () => {
	reset({ steps: [{ mode: 'all', users: ['A'] }], docs: 2, fields: [field(10, 1), field(11, 1)] });
	const o = await service.sign(1, { id: 'A' });
	assert.equal(o.status, 'completed');
	assert.equal(S.req.status, 'completed');
	assert.equal(signCalls.length, 2, 'ký mọi văn bản của hồ sơ trong 1 lần');
	assert.deepEqual(notices.at(-1), ['sign_request_completed', ['A', 'C']]);
	assert.ok(S.events.some((e) => e.action === 'completed'));
});

test('chưa tới lượt (bước sau) ⇒ 409, không ký', async () => {
	reset({
		steps: [
			{ mode: 'all', users: ['A'] },
			{ mode: 'all', users: ['D'] },
		],
		fields: [field(10, 1), field(10, 2)],
	});
	await assert.rejects(service.sign(1, { id: 'D' }), (e) => e.statusCode === 409);
	assert.equal(signCalls.length, 0);
});

test('văn bản chưa có khung ⇒ người ký tự đặt (placements); thiếu cả hai ⇒ 400', async () => {
	reset({ steps: [{ mode: 'all', users: ['A'] }], docs: 2, fields: [field(10, 1)] });
	await assert.rejects(
		service.sign(1, { id: 'A' }),
		(e) => e.statusCode === 400 && /vb2\.pdf/.test(e.message),
	);
	assert.equal(signCalls.length, 0);
	await service.sign(
		1,
		{ id: 'A' },
		{ placements: [{ document_id: 11, page: 2, x: 50, y: 60, width: 150, height: 48 }] },
	);
	assert.deepEqual(
		signCalls.map((c) => [c.docRef, c.page, c.x]),
		[
			['1:10', 1, 300],
			['1:11', 2, 50],
		],
	);
});

test('VIN-HSM lỗi ở văn bản thứ 2 ⇒ xóa file vừa ghi, không đổi trạng thái', async () => {
	reset({ steps: [{ mode: 'all', users: ['A'] }], docs: 2, fields: [field(10, 1), field(11, 1)] });
	let n = 0;
	const real = signing.signPdfAsUser;
	signing.signPdfAsUser = async (...a) => {
		if (++n === 2) throw Object.assign(new Error('Ký số không thành công'), { statusCode: 502 });
		return real(...a);
	};
	await assert.rejects(service.sign(1, { id: 'A' }), (e) => e.statusCode === 502);
	signing.signPdfAsUser = real;
	assert.deepEqual(removed, ['sign-requests/1/d10-v2.pdf']);
	// (giao dịch thật rollback DB; ở đây chỉ kiểm file mới đã bị dọn)
	assert.equal(files.has('sign-requests/1/d10-v2.pdf'), false);
});

test('từ chối ⇒ hồ sơ dừng, báo người tạo + người đã ký; cần lý do', async () => {
	reset({
		steps: [
			{ mode: 'all', users: ['A'] },
			{ mode: 'all', users: ['D', 'E'] },
			{ mode: 'all', users: ['F'] },
		],
		fields: [field(10, 1), field(10, 2), field(10, 3), field(10, 4)],
	});
	await service.sign(1, { id: 'A' });
	await assert.rejects(service.reject(1, { id: 'D' }, '  '), (e) => e.statusCode === 400);
	await service.reject(1, { id: 'D', full_name: 'D' }, 'Sai số liệu ở mục 2');
	assert.equal(S.req.status, 'rejected');
	assert.equal(status().D, 'rejected');
	// Người cùng bước và bước sau không còn "chờ ký"
	assert.equal(status().E, 'skipped');
	assert.equal(status().F, 'skipped');
	assert.deepEqual(notices.at(-1), ['sign_request_rejected', ['A', 'C']]);
	await assert.rejects(service.sign(1, { id: 'D' }), (e) => e.statusCode === 409);
});

test('hủy: chỉ người tạo (hoặc quản trị ký số)', async () => {
	reset({ steps: [{ mode: 'all', users: ['A'] }], fields: [] });
	await assert.rejects(
		service.cancel(1, { id: 'A', permissions: new Set() }, null),
		(e) => e.statusCode === 403,
	);
	await service.cancel(1, { id: 'C', permissions: new Set() }, 'Gửi nhầm');
	assert.equal(S.req.status, 'cancelled');
	assert.equal(status().A, 'skipped');
});

test('người ngoài hồ sơ không xem được (404)', async () => {
	reset({ steps: [{ mode: 'all', users: ['A'] }], fields: [] });
	await assert.rejects(
		service.getDetail(1, { id: 'X', permissions: new Set() }),
		(e) => e.statusCode === 404,
	);
	const d = await service.getDetail(1, { id: 'A', permissions: new Set() });
	assert.equal(d.can_sign, true);
	assert.deepEqual(d.missing_field_document_ids, [10]);
});

test('tạo hồ sơ: chặn người trùng, bước rỗng, file không phải PDF', async () => {
	const pdf = { originalname: 'a.pdf', buffer: Buffer.from('%PDF-1.7 x') };
	const base = { title: 'T', steps: [{ mode: 'all', signers: ['A'] }] };
	await assert.rejects(
		service.create({ id: 'C' }, [pdf], {
			...base,
			steps: [
				{ mode: 'all', signers: ['A'] },
				{ mode: 'all', signers: ['A'] },
			],
		}),
		(e) => e.statusCode === 400 && /1 lần/.test(e.message),
	);
	await assert.rejects(
		service.create({ id: 'C' }, [pdf], { ...base, steps: [] }),
		(e) => e.statusCode === 400,
	);
	await assert.rejects(
		service.create({ id: 'C' }, [{ originalname: 'b.pdf', buffer: Buffer.from('PK..') }], base),
		(e) => e.statusCode === 400 && /PDF/.test(e.message),
	);
});
