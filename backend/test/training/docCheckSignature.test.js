// Kiểm chữ ký nối vào hàng đợi docCheck: service trên CSDL giả (hồ sơ đăng ký + hồ sơ học viên tự
// nộp), phân tích thật (docCheckAnalyzer.analyze) trên PDF ký số tự tạo (pdfSignFixtures.js) và
// trang vẽ bằng @napi-rs/canvas. Máy không có Tesseract ⇒ dò chữ ký tay bằng mực xanh.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { install } = require('../auth/fakeDb');
const fx = require('./pdfSignFixtures');

let claimed = null; // việc claimNext trả về
let jobRow = null; // dòng file của việc
let checkRows = []; // dòng registration_file_checks của 1 học viên
const log = install(async (text) => {
	if (/UPDATE registration_file_checks\s+SET status = 'running'/.test(text))
		return claimed ? [claimed] : [];
	if (/FROM training_files f\s+JOIN course_registrations r/.test(text))
		return jobRow ? [jobRow] : [];
	if (/FROM trainee_documents d\s+JOIN training_files f/.test(text)) return jobRow ? [jobRow] : [];
	if (/JOIN registration_file_checks ck ON ck.file_id = d.file_id/.test(text)) return checkRows;
	if (/SELECT id FROM trainees WHERE user_id/.test(text)) return [{ id: 'T1' }];
	return [];
});

const runner = require('../../src/modules/training/registration/docCheck/docCheckRunner');
const svc = require('../../src/modules/training/registration/docCheck/docCheckService');
const { analyze } = require('../../src/modules/training/registration/docCheck/docCheckAnalyzer');
const {
	createTrustStore,
} = require('../../src/modules/training/registration/docCheck/signature/trustStore');
const {
	combine,
} = require('../../src/modules/training/registration/docCheck/signature/signatureRules');

const lastUpdate = () =>
	[...log]
		.reverse()
		.find((l) => /UPDATE registration_file_checks\s+SET status = @status/.test(l.text));
const lastClaim = () => [...log].reverse().find((l) => /SET status = 'running'/.test(l.text));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doccheck-sig-'));
test.after(async () => {
	await runner.stop();
	fs.rmSync(tmp, { recursive: true, force: true });
});
const write = (name, buf) => {
	const p = path.join(tmp, name);
	fs.writeFileSync(p, buf);
	return p;
};

const withEnv = async (key, value, fn) => {
	const old = process.env[key];
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
	try {
		return await fn();
	} finally {
		if (old === undefined) delete process.env[key];
		else process.env[key] = old;
	}
};

// ─── Công tắc + service ──────────────────────────────────────────────────────────
test('công tắc TRAINING_DOC_SIGNATURE_CHECK mặc định tắt, chỉ "true" mới bật', async () => {
	await withEnv('TRAINING_DOC_SIGNATURE_CHECK', undefined, async () =>
		assert.equal(await svc.isSignatureEnabled(), false),
	);
	await withEnv('TRAINING_DOC_SIGNATURE_CHECK', 'true', async () =>
		assert.equal(await svc.isSignatureEnabled(), true),
	);
	const settings = require('../../src/modules/settings/systemSettingService');
	assert.equal(
		settings.validateSetting('TRAINING_DOC_SIGNATURE_CHECK', 'có'),
		'Giá trị phải là true/false',
	);
});

test('enqueue: hồ sơ đăng ký ghi source registration; hồ sơ học viên ghi trainee_document', async () => {
	log.length = 0;
	assert.equal(await svc.enqueue({ fileId: 'TF1', enrollmentId: 'E1', kind: 'decision' }), true);
	assert.match(log[0].text, /'registration', @enrollment_id/);
	assert.equal(await svc.enqueueTraineeDocument({ fileId: 'TF2', traineeDocumentId: '' }), false);
	assert.equal(await svc.enqueueTraineeDocument({ fileId: 'TF2', traineeDocumentId: 'HS1' }), true);
	const ins = log[log.length - 1];
	assert.match(ins.text, /'trainee_document', @doc_id, 'trainee_document'/);
	assert.deepEqual(ins.inputs, { file_id: 'TF2', doc_id: 'HS1' });
});

test('processOne: công tắc chữ ký truyền vào claimNext và input của job', async () => {
	const orig = runner.run;
	let got = null;
	runner.run = async (input) => {
		got = input;
		return { status: 'done', sha256: 'a'.repeat(64), verdict: 'ok', warnings: [] };
	};
	claimed = {
		file_id: 'TF3',
		source: 'registration',
		enrollment_id: 'E1',
		kind: 'decision',
		attempts: 1,
	};
	jobRow = {
		file_url: '/uploads/training/x/qd.pdf',
		mime_type: 'application/pdf',
		snapshot: JSON.stringify({ full_name: 'A', workplace: 'Trung tâm Y tế Diễn Châu' }),
		reg_source: 'external',
	};
	try {
		await withEnv('TRAINING_DOC_SIGNATURE_CHECK', undefined, () => svc.processOne());
		assert.equal(lastClaim()?.inputs.sig, false);
		assert.equal(got.signature, false);
		assert.equal(got.source, 'registration');
		assert.equal(got.unit, 'Trung tâm Y tế Diễn Châu');

		jobRow = { ...jobRow, snapshot: '{}', reg_source: 'internal' };
		await withEnv('TRAINING_DOC_SIGNATURE_CHECK', 'true', () => svc.processOne());
		assert.equal(lastClaim()?.inputs.sig, true);
		assert.equal(got.signature, true);
		assert.match(got.unit, /Bệnh viện Hữu nghị/, 'nội viện ⇒ so với tên bệnh viện');
		assert.match(lastClaim()?.text ?? '', /source = 'registration' OR @sig/);
	} finally {
		runner.run = orig;
	}
});

test('processOne: hồ sơ học viên — lấy file qua trainee_documents, ghi sig_verdict / sig_details', async () => {
	const orig = runner.run;
	let got = null;
	const sig = combine('trainee_document', null, []);
	runner.run = async (input) => {
		got = input;
		return { status: 'done', sha256: 'b'.repeat(64), verdict: null, ...sig };
	};
	claimed = {
		file_id: 'TF4',
		source: 'trainee_document',
		enrollment_id: null,
		trainee_document_id: 'HS1',
		kind: 'trainee_document',
		attempts: 1,
	};
	jobRow = {
		file_url: '/uploads/training/trainee_document/T1/hs.pdf',
		mime_type: 'application/pdf',
	};
	try {
		await withEnv('TRAINING_DOC_SIGNATURE_CHECK', 'true', () => svc.processOne());
	} finally {
		runner.run = orig;
	}
	const q = [...log]
		.reverse()
		.find((l) => /FROM trainee_documents d\s+JOIN training_files/.test(l.text));
	assert.deepEqual(q?.inputs, { file_id: 'TF4', doc_id: 'HS1' });
	assert.equal(got.source, 'trainee_document');
	assert.equal(got.unit, null);
	assert.deepEqual(got.identity, {});
	const u = lastUpdate();
	assert.equal(u?.inputs.status, 'done');
	assert.equal(u?.inputs.verdict, null);
	assert.equal(u?.inputs.sig_verdict, 'unclear');
	assert.deepEqual(JSON.parse(u?.inputs.sig_details).warnings, ['marks_unclear']);

	// file đã xóa ⇒ skipped
	jobRow = null;
	await withEnv('TRAINING_DOC_SIGNATURE_CHECK', 'true', () => svc.processOne());
	assert.equal(lastUpdate()?.inputs.error, 'file_missing');
});

test('processOne: kết quả skipped (thiếu OCR) vẫn ghi kết quả chữ ký', async () => {
	const orig = runner.run;
	runner.run = async () => ({
		status: 'skipped',
		reason: 'ocr_unavailable',
		sha256: 'c'.repeat(64),
		sig_verdict: 'ok',
		sig_details: { warnings: [] },
	});
	claimed = {
		file_id: 'TF5',
		source: 'registration',
		enrollment_id: 'E1',
		kind: 'decision',
		attempts: 1,
	};
	jobRow = { file_url: '/uploads/training/x/qd.pdf', mime_type: null, snapshot: '{}' };
	try {
		await svc.processOne();
	} finally {
		runner.run = orig;
	}
	const u = lastUpdate();
	assert.equal(u?.inputs.status, 'skipped');
	assert.equal(u?.inputs.sig_verdict, 'ok');
	assert.equal(u?.inputs.sig_details, '{"warnings":[]}');
});

test('queueStats: đếm thêm chữ ký số không hợp lệ + thiếu dấu / chữ ký', async () => {
	log.length = 0;
	await svc.queueStats();
	assert.match(log[0].text, /AS sig_invalid/);
	assert.match(log[0].text, /\{digital,verdict\}' IN \('invalid', 'modified'\)/);
	assert.match(log[0].text, /sig_verdict = 'missing'\)::int AS sig_missing/);
});

const sigDetails = (kind, digital, pages) => {
	const r = combine(kind, digital, pages);
	return { check_sig_verdict: r.sig_verdict, check_sig_details: JSON.stringify(r.sig_details) };
};
const pageMarks = (n, seal, hand) => ({
	page: n,
	result: {
		verdict: 'marks_ok',
		color_available: true,
		seal: { found: seal, count: seal ? 1 : 0, boxes: [] },
		hand_signature: { found: hand, near_title: false, title_found: false, method: 'ink_only' },
		signals: { ms: 0, red_px: 0, blue_px: 0, colorful_px: 0 },
	},
});

test('present / presentAll: thêm khối signature, ẩn khi công tắc tắt hoặc đang kiểm', () => {
	const row = {
		kind: 'decision',
		check_status: 'done',
		check_verdict: 'ok',
		check_detected_kind: 'decision',
		check_warnings: '[]',
		...sigDetails('decision', null, [pageMarks(1, false, true)]),
	};
	const p = svc.present(row);
	assert.equal(p?.level, 'ok', 'mức của kiểm loại không đổi');
	assert.equal(p?.signature?.level, 'warn');
	assert.equal(p?.signature?.verdict, 'missing');
	assert.deepEqual(
		p?.signature?.warnings.map((w) => w.code),
		['seal_missing', 'signature_missing'],
	);
	assert.equal(svc.present(row, { withSignature: false })?.signature, null);
	assert.equal(svc.present({ ...row, check_status: 'pending' })?.signature, null);
	assert.equal(
		svc.present({ ...row, check_sig_verdict: null })?.signature,
		null,
		'chưa kiểm chữ ký',
	);
	assert.equal(svc.presentAll([row]).get('decision')?.signature?.verdict, 'missing');
	assert.equal(svc.presentAll([row], { withSignature: false }).get('decision')?.signature, null);
});

test('registrationFileService.summarize: check.signature theo công tắc', () => {
	const fileSvc = require('../../src/modules/training/registration/registrationFileService');
	const rows = [
		{
			kind: 'decision',
			file_name: 'qd.pdf',
			check_status: 'done',
			check_verdict: 'ok',
			check_warnings: '[]',
			...sigDetails('decision', null, [pageMarks(1, true, true)]),
		},
	];
	const on = fileSvc.summarize('external', rows).find((x) => x.kind === 'decision');
	assert.equal(on?.check?.signature?.verdict, 'ok');
	assert.equal(on?.check?.signature?.message, 'Có dấu đỏ và chữ ký tay.');
	const off = fileSvc
		.summarize('external', rows, { withSignature: false })
		.find((x) => x.kind === 'decision');
	assert.equal(off?.check?.signature, null);
});

test('withTraineeDocumentChecks: gắn check cho từng file hồ sơ học viên (màn cán bộ)', async () => {
	const checklist = {
		state: 'pending',
		documents: [{ id: 'HS1' }, { id: 'HS2' }, { id: 'HS3' }],
	};
	checkRows = [
		{
			document_id: 'HS1',
			check_source: 'trainee_document',
			kind: 'trainee_document',
			check_status: 'done',
			...sigDetails('trainee_document', null, [
				pageMarks(1, false, false),
				pageMarks(3, true, true),
			]),
		},
		{
			document_id: 'HS2',
			check_source: 'registration',
			kind: 'degree',
			check_status: 'done',
			check_verdict: 'ok',
			check_detected_kind: 'degree',
			check_warnings: '[]',
		},
	];
	await withEnv('TRAINING_DOC_SIGNATURE_CHECK', 'true', async () => {
		const out = await svc.withTraineeDocumentChecks('T1', checklist);
		assert.equal(out.state, 'pending');
		const [a, b, c] = out.documents;
		assert.equal(a.check?.level, 'info');
		assert.equal(a.check?.verdict, null);
		assert.equal(a.check?.signature?.message, 'Dấu đỏ ở trang 3; chữ ký tay ở trang 3.');
		assert.deepEqual(a.check?.signature?.marks.pages, [
			{ page: 1, seal: false, hand_signature: false },
			{ page: 3, seal: true, hand_signature: true },
		]);
		assert.match(b.check?.message ?? '', /Nhận diện đúng loại/);
		assert.equal(c.check, null);
		const q = [...log].reverse().find((l) => /JOIN registration_file_checks ck/.test(l.text));
		assert.deepEqual(q?.inputs, { trainee_id: 'T1' });
	});
	await withEnv('TRAINING_DOC_SIGNATURE_CHECK', undefined, async () => {
		const out = await svc.withTraineeDocumentChecks('T1', checklist);
		assert.equal(out.documents[0].check, null, 'công tắc chữ ký tắt ⇒ ẩn kết quả hồ sơ học viên');
		assert.match(out.documents[1].check?.message ?? '', /Nhận diện đúng loại/);
	});
	await withEnv('TRAINING_REGISTRATION_DOC_CHECK', 'false', async () => {
		const out = await svc.withTraineeDocumentChecks('T1', checklist);
		assert.ok(
			out.documents.every((d) => d.check === null),
			'tắt tự kiểm tra ⇒ ẩn hết',
		);
	});
	// trạng thái đang chờ
	checkRows = [{ document_id: 'HS1', check_source: 'trainee_document', check_status: 'pending' }];
	await withEnv('TRAINING_DOC_SIGNATURE_CHECK', 'true', async () => {
		const out = await svc.withTraineeDocumentChecks('T1', checklist);
		assert.equal(out.documents[0].check?.message, 'Đang kiểm tra tự động…');
		assert.equal(out.documents[0].check?.signature, null);
	});
});

test('addMyDocument: xếp hàng kiểm chữ ký + kick worker', async () => {
	const rec = require('../../src/modules/training/trainees/traineeRecordService');
	const trainingFileService = require('../../src/modules/training/trainingFileService');
	const worker = require('../../src/modules/training/registration/docCheck/docCheckWorker');
	const origSave = trainingFileService.saveUploadedFile;
	const origKick = worker.kick;
	let kicked = 0;
	trainingFileService.saveUploadedFile = async () => ({ id: 'TF9' });
	worker.kick = () => kicked++;
	log.length = 0;
	try {
		// Kết quả trả về (myChecklist) không phải đối tượng của test này — CSDL giả trả rỗng
		await rec
			.addMyDocument('U1', { originalname: 'hs.pdf', mimetype: 'application/pdf' })
			.catch(() => {});
	} finally {
		trainingFileService.saveUploadedFile = origSave;
		worker.kick = origKick;
	}
	const doc = log.find((l) => /INSERT INTO trainee_documents/.test(l.text));
	const ins = log.find((l) => /'trainee_document', @doc_id/.test(l.text));
	assert.ok(doc && ins, 'đã ghi trainee_documents rồi xếp hàng');
	assert.equal(ins?.inputs.file_id, 'TF9');
	assert.equal(ins?.inputs.doc_id, doc?.inputs.new_id);
	assert.equal(kicked, 1);
});

// ─── Phân tích thật ────────────────────────────────────────────────────────────────
let pki;
test.before(async () => {
	const longAgo = new Date('2015-01-01T00:00:00Z');
	const farAway = new Date('2045-01-01T00:00:00Z');
	const root = await fx.makeCert({
		cn: 'Test Root CA',
		o: 'Test PKI',
		ca: true,
		notBefore: longAgo,
		notAfter: farAway,
	});
	const leaf = await fx.makeCert({
		cn: 'NGUYỄN VĂN AN',
		o: 'Bệnh viện Hữu nghị Đa khoa Nghệ An',
		issuer: root,
	});
	pki = { root, leaf, trust: createTrustStore({ roots: [root.pem] }) };
});

/** Trang A4 150 dpi: giấy ngả màu, chức danh, (dấu đỏ), (chữ ký mực xanh). */
const drawPage = ({ seal = false, signature = true } = {}) => {
	const W = 1240;
	const H = 1754;
	const canvas = createCanvas(W, H);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#faf5e8';
	ctx.fillRect(0, 0, W, H);
	ctx.fillStyle = '#111';
	ctx.font = 'bold 28px Arial, "DejaVu Sans", sans-serif';
	ctx.fillText('KT. GIAM DOC', 800, 1050);
	for (let i = 0; i < 12; i++) ctx.fillText('Noi dung van ban dong ' + (i + 1), 120, 300 + i * 40);
	if (signature) {
		ctx.strokeStyle = '#1e3a9e';
		ctx.lineWidth = 4;
		ctx.beginPath();
		ctx.moveTo(800, 1230);
		ctx.bezierCurveTo(830, 1120, 870, 1130, 860, 1220);
		ctx.bezierCurveTo(850, 1280, 900, 1150, 940, 1180);
		ctx.bezierCurveTo(980, 1210, 960, 1250, 1010, 1190);
		ctx.moveTo(790, 1250);
		ctx.bezierCurveTo(880, 1235, 960, 1240, 1030, 1225);
		ctx.stroke();
	}
	if (seal) {
		ctx.strokeStyle = '#d42a35';
		ctx.fillStyle = '#d42a35';
		ctx.lineWidth = 6;
		ctx.beginPath();
		ctx.arc(780, 1180, 118, 0, Math.PI * 2);
		ctx.stroke();
		ctx.lineWidth = 3;
		ctx.beginPath();
		ctx.arc(780, 1180, 80, 0, Math.PI * 2);
		ctx.stroke();
		ctx.font = 'bold 16px Arial, "DejaVu Sans", sans-serif';
		const label = 'BENH VIEN DA KHOA TINH * SO Y TE * ';
		for (let i = 0; i < label.length; i++) {
			const a = (i / label.length) * Math.PI * 2;
			ctx.save();
			ctx.translate(780 + Math.cos(a) * 98, 1180 + Math.sin(a) * 98);
			ctx.rotate(a + Math.PI / 2);
			ctx.fillText(label[i], -5, 6);
			ctx.restore();
		}
	}
	return canvas.toBuffer('image/png');
};

/** PDF nhiều trang: các trang trắng + trang `marked` (1-based) là ảnh đã vẽ; textLayer ⇒ thêm chữ. */
const imagePdf = async ({ pages = 1, marked = pages, png, textLayer = false }) => {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const img = await doc.embedPng(png);
	for (let i = 1; i <= pages; i++) {
		const page = doc.addPage([595, 842]);
		if (i === marked) page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
		if (textLayer)
			for (let l = 0; l < 6; l++)
				page.drawText(`Quyet dinh cu vien chuc di hoc - dong ${l + 1}`, {
					x: 60,
					y: 800 - l * 16,
					size: 10,
					font,
				});
	}
	return Buffer.from(await doc.save());
};

test('analyze: PDF ký số hợp lệ ⇒ sig ok, lưu người ký / CA / thời điểm; vẫn đoán loại như cũ', async () => {
	const signed = await fx.signPdf(await fx.makeUnsignedPdf(), { signer: pki.leaf, chain: [] });
	const file = write('signed.pdf', signed);
	const r = await analyze(
		{
			filePath: file,
			kind: 'decision',
			signature: true,
			unit: 'Bệnh viện Hữu nghị Đa khoa Nghệ An',
		},
		{ trust: pki.trust },
	);
	assert.equal(r.sig_verdict, 'ok');
	assert.equal(r.sig_details?.digital.verdict, 'valid');
	assert.equal(r.sig_details?.digital.signer.cn, 'NGUYỄN VĂN AN');
	assert.equal(r.sig_details?.digital.signer.issuer_cn, 'Test Root CA');
	assert.equal(r.sig_details?.digital.org_match, true);
	assert.ok(r.sig_details?.digital.signed_at);
	assert.deepEqual(
		r.sig_details?.pages.map((p) => p.page),
		[1],
	);
	// phần đoán loại vẫn chạy (file không phải Quyết định ⇒ mismatch, hoặc chờ OCR)
	assert.ok(r.status === 'skipped' ? r.reason === 'ocr_unavailable' : r.verdict !== undefined);
	assert.ok(!JSON.stringify(r.sig_details).includes('Ho so dang ky'), 'không lưu chữ trong file');

	const off = await analyze({ filePath: file, kind: 'decision' }, { trust: pki.trust });
	assert.equal(off.sig_verdict, undefined, 'công tắc tắt ⇒ không kiểm chữ ký');

	const untrusted = await analyze({ filePath: file, kind: 'decision', signature: true });
	assert.equal(untrusted.sig_verdict, 'warn');
	assert.ok(untrusted.sig_details?.warnings.includes('digital_untrusted'));

	const other = await analyze(
		{ filePath: file, kind: 'decision', signature: true, unit: 'Trung tâm Y tế huyện Quỳnh Lưu' },
		{ trust: pki.trust },
	);
	assert.equal(other.sig_verdict, 'warn');
	assert.deepEqual(other.sig_details?.warnings, ['signer_org_mismatch']);

	const modified = write(
		'modified.pdf',
		fx.appendUpdate(signed, '9999 0 obj\n<< /X 1 >>\nendobj\n'),
	);
	const m = await analyze(
		{ filePath: modified, kind: 'decision', signature: true },
		{ trust: pki.trust },
	);
	assert.equal(m.sig_verdict, 'warn');
	assert.ok(m.sig_details?.warnings.includes('digital_modified'));

	const cccd = await analyze({ filePath: file, kind: 'national_id', signature: true });
	assert.equal(cccd.sig_verdict, undefined, 'CCCD không kiểm chữ ký');
});

test('analyze: ảnh scan có dấu đỏ + chữ ký xanh ⇒ ok; thiếu dấu ⇒ missing', async () => {
	const ok = await analyze({
		filePath: write('qd.png', drawPage({ seal: true })),
		kind: 'decision',
		signature: true,
	});
	assert.equal(ok.sig_verdict, 'ok');
	assert.equal(ok.sig_details?.digital, null, 'ảnh ⇒ không kiểm chữ ký số');
	assert.deepEqual(ok.sig_details?.marks, { seal: 'present', hand: 'present' });

	const noSeal = await analyze({
		filePath: write('qd2.png', drawPage({ seal: false })),
		kind: 'decision',
		signature: true,
	});
	assert.equal(noSeal.sig_verdict, 'missing');
	assert.deepEqual(noSeal.sig_details?.warnings, ['seal_missing', 'signature_missing']);

	const tt = await analyze({
		filePath: write('tt.png', drawPage({ seal: false })),
		kind: 'proposal_approved',
		signature: true,
	});
	assert.equal(tt.sig_verdict, 'ok', 'tờ trình chỉ cần chữ ký tay');
});

test('analyze: cấu hình chi tiết — mục tắt thì không chạy, loại tắt thì không kiểm chữ ký', async () => {
	const file = write('qd-cfg.png', drawPage({ seal: false }));
	const off = { kinds: { decision: { seal: false, hand: false } } };
	const r = await analyze({ filePath: file, kind: 'decision', signature: true, sigConfig: off });
	assert.deepEqual(r.sig_details?.ran, { digital: true, seal: false, hand: false });
	assert.deepEqual(r.sig_details?.pages, [], 'không dò dấu / chữ ký tay');
	assert.equal(r.sig_details?.ocr, false, 'không OCR khi không dò chữ ký tay');
	assert.equal(r.sig_verdict, 'missing', 'chỉ còn chữ ký số mà ảnh thì không có');

	const kindOff = await analyze({
		filePath: file,
		kind: 'decision',
		signature: true,
		sigConfig: JSON.stringify({ kinds: { decision: { enabled: false } } }),
	});
	assert.equal(kindOff.sig_verdict, undefined, 'loại tắt ⇒ không có kết quả chữ ký');
	assert.equal(kindOff.sig_details, undefined);
});

test('analyze: ảnh quá nhỏ / trang trắng ⇒ không kết luận thiếu dấu hay có chữ ký', async () => {
	const { createCanvas } = require('@napi-rs/canvas');
	const png = (w, h, color) => {
		const c = createCanvas(w, h);
		const ctx = c.getContext('2d');
		ctx.fillStyle = color;
		ctx.fillRect(0, 0, w, h);
		return c.toBuffer('image/png');
	};
	for (const [name, buf] of [
		['tiny.png', png(8, 8, '#2244cc')], // ảnh vài điểm ảnh (màu xanh như mực ký)
		['blank.png', png(1240, 1754, '#ffffff')], // trang trắng
	]) {
		const r = await analyze({ filePath: write(name, buf), kind: 'degree', signature: true });
		assert.deepEqual(r.sig_details?.marks, { seal: 'unknown', hand: 'unknown' }, name);
		assert.ok(!r.sig_details?.warnings.includes('seal_missing'), name);
		assert.notEqual(r.sig_verdict, 'missing', name);
	}
});

test('analyze: PDF nhiều trang — dò trang cuối + trang đầu; có hình dấu mà không ký số ⇒ cảnh báo bản in lại', async () => {
	const png = drawPage({ seal: true });
	const scan = write('scan3.pdf', await imagePdf({ pages: 3, marked: 3, png }));
	const r = await analyze({ filePath: scan, kind: 'decision', signature: true });
	assert.deepEqual(
		r.sig_details?.pages.map((p) => [p.page, p.seal]),
		[
			[1, null],
			[3, true],
		],
	);
	assert.equal(r.sig_details?.page_count, 3);
	assert.equal(r.sig_verdict, 'ok');

	const reprint = write('reprint.pdf', await imagePdf({ pages: 1, png, textLayer: true }));
	const rp = await analyze({ filePath: reprint, kind: 'decision', signature: true });
	assert.equal(rp.sig_verdict, 'warn');
	assert.deepEqual(rp.sig_details?.warnings, ['seal_image_no_digital']);
});

test('analyze: hồ sơ học viên — chỉ kiểm chữ ký, không đoán loại', async () => {
	const file = write(
		'hs.pdf',
		await imagePdf({ pages: 4, marked: 4, png: drawPage({ seal: true }) }),
	);
	const r = await analyze({
		filePath: file,
		kind: 'trainee_document',
		source: 'trainee_document',
		signature: true,
	});
	assert.equal(r.status, 'done');
	assert.equal(r.verdict, null);
	assert.equal(r.detected_kind, undefined);
	assert.equal(r.sig_verdict, 'ok');
	assert.equal(r.signals?.method, 'signature_only');
	const off = await analyze({
		filePath: file,
		kind: 'trainee_document',
		source: 'trainee_document',
	});
	assert.equal(off.status, 'skipped');
	assert.equal(off.reason, 'signature_disabled');

	const bad = await analyze({
		filePath: write('hong.pdf', Buffer.from('không phải PDF')),
		kind: 'trainee_document',
		source: 'trainee_document',
		signature: true,
	});
	assert.equal(bad.status, 'done');
	assert.equal(bad.sig_verdict, 'unclear');
});

test('runner: công tắc chữ ký đi qua worker thread', async () => {
	const file = write('qd3.png', drawPage({ seal: true }));
	const r = await runner.run({ filePath: file, kind: 'decision', signature: true, identity: {} });
	assert.equal(r.sig_verdict, 'ok');
	const off = await runner.run({ filePath: file, kind: 'decision', identity: {} });
	assert.equal(off.sig_verdict, undefined);
});
