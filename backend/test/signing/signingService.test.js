// Ký số cho các luồng nghiệp vụ (signingService) và tài khoản ký (signingAccountService) —
// repository + client VIN-HSM giả, không cần DB, không gọi mạng.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.SECRETS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rms-signing-'));
delete process.env.TOTP_ENC_KEY;

require('../../src/config/logger').error = () => {};
require('../../src/config/logger').warn = () => {};
const secretBox = require('../../src/utils/secretBox');
// Cấu hình ký số: mặc định (bật hết) — không đọc DB
const settingsStore = new Map();
require('../../src/modules/settings/systemSettingService').getValue = async (k, fb) =>
	settingsStore.get(k) ?? fb;
const repo = require('../../src/modules/signing/signingRepository');
const client = require('../../src/modules/signing/vinHsmClient');
const accounts = require('../../src/modules/signing/signingAccountService');
const service = require('../../src/modules/signing/signingService');

const logs = [];
repo.insertLog = async (l) => {
	logs.push(l);
};

const ACC = {
	id: 7,
	kind: 'personal',
	user_id: 'U1',
	region: 'hn10',
	api_key: 'APIKEY123456',
	is_active: true,
	cert_serial: 'ABC',
	label: 'Chứng thư cá nhân — A',
};

const useAccounts = ({ personal = null, certDefault = null, secret = 's3cret' } = {}) => {
	repo.findPersonalByUser = async (uid) => (personal && personal.user_id === uid ? personal : null);
	repo.findCertificateDefault = async () => certDefault;
	repo.findCredential = async (id) => {
		const a = [personal, certDefault].find((x) => x && x.id === id);
		return a ? { ...a, secret_enc: secretBox.encrypt(secret) } : null;
	};
};

test.beforeEach(() => {
	logs.length = 0;
});

test('signDocxDownload: ký bằng chứng thư của chính người tải, đổi tên file, ghi nhật ký ok', async () => {
	useAccounts({ personal: ACC });
	let usedCred = null;
	client.signOffice = async (cred, file) => {
		usedCred = cred;
		return Buffer.concat([file, Buffer.from('-signed')]);
	};
	const out = await service.signDocxDownload(
		{ id: 'U1' },
		{ buffer: Buffer.from('PK'), fileName: 'Đơn đề nghị.docx', mime: 'x' },
		{ docType: 'practice_document', docRef: 'DK1:don' },
	);
	assert.equal(out.buffer.toString(), 'PK-signed');
	assert.equal(out.fileName, 'Đơn đề nghị (ky so).docx');
	assert.equal(out.mime, 'x');
	assert.deepEqual(usedCred, {
		id: 7,
		provider: 'vin_hsm',
		apiKey: 'APIKEY123456',
		secret: 's3cret',
		region: 'hn10',
		certSerial: 'ABC',
		signatureImage: null,
		signatureShowText: false,
		signatureCaption: null,
		signatureDisplayName: null,
	});
	assert.equal(logs.length, 1);
	assert.equal(logs[0].status, 'ok');
	assert.equal(logs[0].accountId, 7);
	assert.equal(logs[0].actorId, 'U1');
	assert.equal(logs[0].docType, 'practice_document');
	assert.match(logs[0].inputSha256, /^[0-9a-f]{64}$/);
	assert.match(logs[0].outputSha256, /^[0-9a-f]{64}$/);
});

test('chưa khai báo chứng thư cá nhân ⇒ 409, không gọi VIN-HSM', async () => {
	useAccounts({});
	let called = false;
	client.signOffice = async () => {
		called = true;
		return Buffer.from('');
	};
	await assert.rejects(
		service.signOfficeAsUser('U2', Buffer.from('PK'), { docType: 'practice_document' }),
		(err) => err.statusCode === 409 && /chưa khai báo/.test(err.message),
	);
	assert.equal(called, false);
});

test('không ký được bằng chứng thư của người khác', async () => {
	useAccounts({ personal: ACC });
	await assert.rejects(
		service.signPdfAsUser('U-KHAC', Buffer.from('%PDF'), { docType: 'topic_approval' }),
		(err) => err.statusCode === 409,
	);
});

test('VIN-HSM báo lỗi ⇒ 502 kèm thông báo, nhật ký ghi error + mã lỗi', async () => {
	useAccounts({ personal: ACC });
	client.signPdf = async () => {
		throw new client.VinHsmError('Chứng thư số đã hết hạn', { code: 1002, detail: 'EXPIRED' });
	};
	await assert.rejects(
		service.signPdfAsUser('U1', Buffer.from('%PDF'), { docType: 'topic_approval', docRef: 'DT1' }),
		(err) => err.statusCode === 502 && /hết hạn/.test(err.message),
	);
	assert.equal(logs.length, 1);
	assert.equal(logs[0].status, 'error');
	assert.equal(logs[0].errorCode, 1002);
	assert.equal(logs[0].docRef, 'DT1');
	assert.match(logs[0].errorMessage, /EXPIRED/);
});

test('giấy chứng nhận: chưa đánh dấu chứng thư bệnh viện ⇒ 409 ngay, trước khi xuất file', async () => {
	useAccounts({});
	await assert.rejects(
		service.certificateSigner({ docType: 'seminar_certificate', actorId: 'U1' }),
		(err) => err.statusCode === 409 && /Ký số/.test(err.message),
	);
});

test('giấy chứng nhận: chữ ký ẩn, mỗi giấy 1 dòng nhật ký theo số giấy', async () => {
	const org = { ...ACC, id: 3, kind: 'organization', user_id: null, use_for_certificates: true };
	useAccounts({ certDefault: org });
	const opts = [];
	client.signPdf = async (_c, pdf, opt) => {
		opts.push(opt);
		return pdf;
	};
	const sign = await service.certificateSigner({
		docType: 'seminar_certificate',
		docRef: 'HN01',
		actorId: 'U1',
	});
	await sign(Buffer.from('%PDF-a'), 'HN01:0001');
	await sign(Buffer.from('%PDF-b'));
	assert.equal(opts[0].type, client.PDF_SIGNATURE_TYPE.HIDDEN);
	assert.deepEqual(
		logs.map((l) => [l.accountId, l.docRef]),
		[
			[3, 'HN01:0001'],
			[3, 'HN01'],
		],
	);
});

test('wantsSign chỉ nhận true / "true" / "1"', () => {
	assert.equal(service.wantsSign(true), true);
	assert.equal(service.wantsSign('1'), true);
	assert.equal(service.wantsSign('true'), true);
	assert.equal(service.wantsSign(false), false);
	assert.equal(service.wantsSign('0'), false);
	assert.equal(service.wantsSign(undefined), false);
});

test('mapLimit giữ thứ tự, không chạy quá số luồng', async () => {
	let running = 0;
	let peak = 0;
	const out = await service.mapLimit([5, 1, 4, 2, 3], 2, async (n) => {
		running++;
		peak = Math.max(peak, running);
		await new Promise((r) => setTimeout(r, n));
		running--;
		return n * 10;
	});
	assert.deepEqual(out, [50, 10, 40, 20, 30]);
	assert.ok(peak <= 2);
});

// ─── signingAccountService ───────────────────────────────────────────────

test('tạo tài khoản: secret mã hóa trước khi lưu, API key trả bản che', async () => {
	let inserted = null;
	repo.findPersonalByUser = async () => null;
	repo.insertAccount = async (d) => {
		inserted = d;
		return 11;
	};
	repo.findCredential = async () => ({
		id: 11,
		region: 'hn10',
		api_key: 'KEY-1234567890',
		secret_enc: inserted.secretEnc,
		is_active: true,
	});
	repo.saveCheckResult = async () => {};
	repo.findById = async () => ({ id: 11, api_key: 'KEY-1234567890', cert_serial: null });
	client.getCertificate = async () => {
		throw new client.VinHsmError('Không kết nối được máy chủ ký VIN-HSM');
	};
	const acc = await accounts.createAccount(
		{
			label: 'BV',
			kind: 'organization',
			region: 'HN10',
			api_key: 'KEY-1234567890',
			secret: 'plain-secret',
		},
		'ADMIN',
	);
	assert.equal(inserted.region, 'hn10');
	assert.notEqual(inserted.secretEnc, 'plain-secret');
	assert.ok(secretBox.isEncrypted(inserted.secretEnc));
	assert.equal(secretBox.decrypt(inserted.secretEnc), 'plain-secret');
	assert.equal(acc.api_key, 'KEY-…7890');
	assert.equal('secret_enc' in acc, false);
});

test('tạo tài khoản cá nhân thứ 2 cho cùng người ⇒ 409', async () => {
	repo.findPersonalByUser = async () => ACC;
	await assert.rejects(
		accounts.createAccount(
			{ label: 'x', kind: 'personal', user_id: 'U1', region: 'hn10', api_key: 'k', secret: 's' },
			'ADMIN',
		),
		(err) => err.statusCode === 409,
	);
});

test('sửa tài khoản: gửi lại API key bản che + secret trống = giữ nguyên thông tin đăng nhập', async () => {
	let patch = null;
	repo.findById = async () => ({ ...ACC, kind: 'organization', api_key: 'APIKEY123456' });
	repo.updateAccount = async (_id, p) => {
		patch = p;
		return 1;
	};
	await accounts.updateAccount(7, { label: 'Mới', api_key: 'APIK…3456', secret: '' }, 'ADMIN');
	assert.deepEqual(patch, { label: 'Mới' });
});

test('vùng máy chủ sai ⇒ 400', async () => {
	repo.findPersonalByUser = async () => null;
	await assert.rejects(
		accounts.createAccount(
			{ label: 'x', kind: 'organization', region: 'hn-10', api_key: 'k', secret: 's' },
			'ADMIN',
		),
		(err) => err.statusCode === 400,
	);
});

// ─── Ký PDF tự tải lên (signUserPdf) ─────────────────────────────────────

test('signUserPdf: đặt khung đúng vị trí người dùng chọn, tên = họ tên hiển thị, ghi nhật ký', async () => {
	useAccounts({ personal: { ...ACC, signature_display_name: 'ThS.BS. A' } });
	let opt = null;
	client.signPdf = async (_c, pdf, o) => {
		opt = o;
		return pdf;
	};
	await service.signUserPdf({ id: 'U1', full_name: 'A' }, Buffer.from('%PDF-1.7 ...'), {
		fileName: 'Quyet dinh.pdf',
		page: 2,
		x: 320.5,
		y: 96,
		width: 180,
		height: 57,
	});
	assert.deepEqual(
		{ page: opt.page, x: opt.x, y: opt.y, width: opt.width, height: opt.height, text: opt.text },
		{ page: 2, x: 320.5, y: 96, width: 180, height: 57, text: 'ThS.BS. A' },
	);
	assert.equal(logs.at(-1).docType, 'user_document');
	assert.equal(logs.at(-1).docRef, 'Quyet dinh.pdf');
});

test('signUserPdf: không phải PDF ⇒ 400, không gọi VIN-HSM', async () => {
	useAccounts({ personal: ACC });
	let called = false;
	client.signPdf = async () => {
		called = true;
		return Buffer.from('');
	};
	await assert.rejects(
		service.signUserPdf({ id: 'U1' }, Buffer.from('PK\x03\x04'), {
			fileName: 'x.pdf',
			page: 1,
			x: 0,
			y: 0,
			width: 100,
			height: 40,
		}),
		(e) => e.statusCode === 400,
	);
	assert.equal(called, false);
});

// ─── Cấu hình bật / tắt (signingConfig, khóa SIGNING_CONFIG) ───────────────
const signingConfig = require('../../src/modules/signing/signingConfig');
const setConfig = (cfg) =>
	settingsStore.set('SIGNING_CONFIG', cfg == null ? '' : JSON.stringify(cfg));

test('cấu hình: thiếu / hỏng ⇒ bật hết; chỉ đúng false mới là tắt', async () => {
	setConfig(null);
	const d = await signingConfig.getConfig();
	assert.equal(d.enabled, true);
	assert.equal(d.self_manage, true);
	assert.ok(Object.values(d.features).every(Boolean));
	assert.equal(d.providers.vin_hsm, true);
	settingsStore.set('SIGNING_CONFIG', '{hỏng');
	assert.equal((await signingConfig.getConfig()).enabled, true);
	const n = signingConfig.normalize({ enabled: 0, features: { topic_approval: false, lạ: false } });
	assert.equal(n.enabled, true);
	assert.equal(n.features.topic_approval, false);
	assert.equal('lạ' in n.features, false);
	setConfig(null);
});

test('cấu hình: nơi dùng tắt ⇒ 409, không gọi VIN-HSM, không ghi nhật ký; nơi khác vẫn ký', async () => {
	useAccounts({ personal: ACC });
	let calls = 0;
	client.signOffice = async (_c, file) => {
		calls++;
		return file;
	};
	setConfig({ enabled: true, self_manage: true, features: { training_documents: false } });
	logs.length = 0;
	await assert.rejects(
		service.signOfficeAsUser('U1', Buffer.from('PK'), { docType: 'practice_document' }),
		(e) => e.statusCode === 409 && /Văn bản đào tạo/.test(e.message),
	);
	assert.equal(calls, 0);
	assert.equal(logs.length, 0);
	await service.signOfficeAsUser('U1', Buffer.from('PK'), { docType: 'topic_approval' });
	assert.equal(calls, 1);
	setConfig(null);
});

test('cấu hình: tắt tổng ⇒ chặn mọi nơi dùng; ký thử vẫn được, trừ khi tắt nhà cung cấp', async () => {
	setConfig({ enabled: false, self_manage: true });
	await assert.rejects(
		signingConfig.assertCall('topic_approval', 'vin_hsm'),
		(e) => e.statusCode === 409,
	);
	await assert.rejects(
		signingConfig.assertCall('sign_request', 'vin_hsm'),
		(e) => e.statusCode === 409,
	);
	await signingConfig.assertCall('test', 'vin_hsm');
	const pub = await signingConfig.publicConfig();
	assert.ok(Object.values(pub.features).every((v) => v === false));
	setConfig({ enabled: true, self_manage: true, providers: { vin_hsm: false } });
	await assert.rejects(
		signingConfig.assertCall('test', 'vin_hsm'),
		(e) => e.statusCode === 409 && /VIN-HSM/.test(e.message),
	);
	setConfig(null);
});

test('cấu hình: tắt tự khai báo ⇒ cán bộ không lưu / xóa được chứng thư của mình', async () => {
	setConfig({ enabled: true, self_manage: false });
	await assert.rejects(
		accounts.saveMine('U1', { api_key: 'k', secret: 's' }, 'A'),
		(e) => e.statusCode === 403,
	);
	await assert.rejects(accounts.removeMine('U1'), (e) => e.statusCode === 403);
	setConfig(null);
});
