// Tự kiểm tra file hồ sơ đăng ký khóa ĐTLT: hàng đợi (docCheckService) trên CSDL giả, phân tích
// thật (docCheckAnalyzer qua worker thread) trên file PDF có lớp chữ + ảnh mã QR sinh ngay trong
// test — 2 tầng này không cần Tesseract nên chạy được ở mọi máy.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { install } = require('../auth/fakeDb');

let claimed = null; // việc claimNext trả về
let jobRow = null; // dòng training_files + snapshot
const log = install(async (text) => {
	if (/UPDATE registration_file_checks\s+SET status = 'running'/.test(text))
		return claimed ? [claimed] : [];
	if (/FROM training_files f\s+JOIN course_registrations r/.test(text))
		return jobRow ? [jobRow] : [];
	return [];
});

const { UPLOADS_ROOT } = require('../../src/utils/uploadPaths');
const runner = require('../../src/modules/training/registration/docCheck/docCheckRunner');
const svc = require('../../src/modules/training/registration/docCheck/docCheckService');
const { analyze } = require('../../src/modules/training/registration/docCheck/docCheckAnalyzer');

const lastUpdate = () =>
	[...log]
		.reverse()
		.find((l) => /UPDATE registration_file_checks\s+SET status = @status/.test(l.text));

test.after(() => runner.stop());

test('enqueue: chỉ xếp hàng loại có luật nhận diện', async () => {
	log.length = 0;
	assert.equal(await svc.enqueue({ fileId: 'TF1', enrollmentId: 'E1', kind: 'dossier' }), false);
	assert.equal(await svc.enqueue({ fileId: 'TF1', enrollmentId: 'E1', kind: 'national_id' }), true);
	assert.equal(log.length, 1);
	assert.match(log[0].text, /INSERT INTO registration_file_checks/);
	assert.deepEqual(log[0].inputs, { file_id: 'TF1', enrollment_id: 'E1', kind: 'national_id' });
});

test('processOne: hàng đợi trống ⇒ false', async () => {
	claimed = null;
	assert.equal(await svc.processOne(), false);
});

test('processOne: file đã xóa ⇒ skipped file_missing', async () => {
	claimed = { file_id: 'TF2', enrollment_id: 'E1', kind: 'license', attempts: 1 };
	jobRow = null;
	assert.equal(await svc.processOne(), true);
	const u = lastUpdate();
	assert.equal(u?.inputs.status, 'skipped');
	assert.equal(u?.inputs.error, 'file_missing');
});

test('processOne: file_url ngoài thư mục uploads ⇒ không đọc', async () => {
	claimed = { file_id: 'TF3', enrollment_id: 'E1', kind: 'license', attempts: 1 };
	jobRow = { file_url: '/uploads/../../etc/passwd', mime_type: null, snapshot: '{}' };
	await svc.processOne();
	assert.equal(lastUpdate()?.inputs.error, 'file_missing');
});

test('processOne: lỗi phân tích ⇒ thử lại (pending), hết lượt ⇒ error', async () => {
	const orig = runner.run;
	runner.run = async () => {
		throw new Error('hỏng');
	};
	jobRow = { file_url: '/uploads/training/x/a.pdf', mime_type: 'application/pdf', snapshot: '{}' };
	try {
		claimed = { file_id: 'TF4', enrollment_id: 'E1', kind: 'license', attempts: 1 };
		await svc.processOne();
		assert.equal(lastUpdate()?.inputs.status, 'pending');
		claimed = { ...claimed, attempts: svc.MAX_ATTEMPTS };
		await svc.processOne();
		assert.equal(lastUpdate()?.inputs.status, 'error');
		assert.equal(lastUpdate()?.inputs.error, 'hỏng');
	} finally {
		runner.run = orig;
	}
});

test('processOne: kết quả phân tích ⇒ ghi verdict, cảnh báo, sha256; truyền họ tên / CCCD đã khai', async () => {
	const orig = runner.run;
	let got = null;
	runner.run = async (input) => {
		got = input;
		return {
			status: 'done',
			sha256: 'a'.repeat(64),
			verdict: 'mismatch',
			detected_kind: 'decision',
			confidence: 60,
			warnings: [],
			signals: { method: 'pdf_text' },
		};
	};
	claimed = { file_id: 'TF5', enrollment_id: 'E1', kind: 'national_id', attempts: 1 };
	jobRow = {
		file_url: '/uploads/training/trainee_document/T1/cccd.pdf',
		mime_type: 'application/pdf',
		snapshot: JSON.stringify({
			full_name: 'Nguyễn Văn An',
			national_id: '001099012345',
			phone: '09',
		}),
	};
	try {
		await svc.processOne();
	} finally {
		runner.run = orig;
	}
	assert.equal(
		got.filePath,
		path.join(UPLOADS_ROOT, 'training', 'trainee_document', 'T1', 'cccd.pdf'),
	);
	assert.equal(got.identity.full_name, 'Nguyễn Văn An');
	assert.equal(got.identity.phone, undefined, 'chỉ gửi trường cần đối chiếu');
	const u = lastUpdate();
	assert.equal(u?.inputs.status, 'done');
	assert.equal(u?.inputs.verdict, 'mismatch');
	assert.equal(u?.inputs.detected_kind, 'decision');
	assert.equal(u?.inputs.sha256, 'a'.repeat(64));
});

test('present: lời nhắn theo kết quả', () => {
	const base = { kind: 'national_id', check_status: 'done' };
	assert.equal(svc.present({ kind: 'degree' }), null, 'chưa có dòng kiểm ⇒ null');
	assert.equal(svc.present({ ...base, check_status: 'pending' })?.level, 'info');
	const ok = svc.present({
		...base,
		check_verdict: 'ok',
		check_detected_kind: 'national_id',
		check_warnings: '[]',
	});
	assert.equal(ok?.level, 'ok');
	const mis = svc.present({
		...base,
		check_verdict: 'mismatch',
		check_detected_kind: 'decision',
		check_warnings: '[]',
	});
	assert.equal(mis?.level, 'warn');
	assert.match(mis?.message ?? '', /Quyết định cử đi học.*không phải.*Căn cước công dân/);
	const back = svc.present({
		...base,
		check_verdict: 'ok',
		check_detected_kind: 'national_id',
		check_warnings: '["cccd_missing_back","lạ"]',
	});
	assert.equal(back?.level, 'warn');
	assert.deepEqual(
		back?.warnings.map((w) => w.code),
		['cccd_missing_back'],
		'bỏ mã lạ',
	);
});

test('presentAll: cùng 1 file nộp cho 2 loại ⇒ cả 2 dòng cảnh báo trùng', () => {
	const sha = 'b'.repeat(64);
	const rows = [
		{
			kind: 'degree',
			check_status: 'done',
			check_verdict: 'ok',
			check_sha256: sha,
			check_warnings: '[]',
		},
		{
			kind: 'license',
			check_status: 'done',
			check_verdict: 'mismatch',
			check_detected_kind: 'degree',
			check_sha256: sha,
		},
		{ kind: 'decision', check_status: 'done', check_verdict: 'ok', check_sha256: 'c'.repeat(64) },
	];
	const m = svc.presentAll(rows);
	assert.match(m.get('degree')?.warnings[0]?.message ?? '', /Chứng chỉ hành nghề/);
	assert.match(m.get('license')?.warnings[0]?.message ?? '', /Bằng tốt nghiệp/);
	assert.deepEqual(m.get('decision')?.warnings, []);
});

// ─── Phân tích thật trên file sinh trong test ──────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doccheck-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const makePdf = async (file, lines) => {
	const { PDFDocument } = require('pdf-lib');
	const fontkit = require('@pdf-lib/fontkit');
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	const font = await doc.embedFont(
		fs.readFileSync(path.join(__dirname, '../../src/assets/fonts/Inter-Regular.ttf')),
	);
	const page = doc.addPage([595, 842]);
	lines.forEach((l, i) => page.drawText(l, { x: 50, y: 780 - i * 26, size: 12, font }));
	const out = path.join(tmp, file);
	fs.writeFileSync(out, await doc.save());
	return out;
};

const DECISION_LINES = [
	'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM',
	'QUYẾT ĐỊNH',
	'Về việc cử viên chức đi học',
	'Căn cứ Luật Viên chức;',
	'Theo đề nghị của Trưởng phòng Tổ chức cán bộ,',
	'Điều 1. Cử bà Nguyễn Văn An tham gia khóa học đào tạo liên tục.',
	'Điều 2. Thủ trưởng các đơn vị chịu trách nhiệm thi hành quyết định này.',
	'Nơi nhận: như Điều 2.',
];

test('analyze: PDF có lớp chữ — đúng ô ⇒ ok, nộp nhầm ô ⇒ mismatch (không cần OCR)', async () => {
	const pdf = await makePdf('qd.pdf', DECISION_LINES);
	const ok = await runner.run({ filePath: pdf, kind: 'decision', identity: {} });
	assert.equal(ok.status, 'done');
	assert.equal(ok.verdict, 'ok');
	assert.equal(ok.signals?.method, 'pdf_text');
	assert.match(ok.sha256, /^[0-9a-f]{64}$/);
	const wrong = await runner.run({ filePath: pdf, kind: 'license', identity: {} });
	assert.equal(wrong.verdict, 'mismatch');
	assert.equal(wrong.detected_kind, 'decision');
});

test('analyze: ảnh có mã QR CCCD ⇒ nhận ra CCCD, đối chiếu số đã khai', async () => {
	const QR = require('qrcode');
	const png = path.join(tmp, 'cccd.png');
	fs.writeFileSync(
		png,
		await QR.toBuffer('001099012345|123456789|Nguyễn Văn An|01011999|Nam|Hà Nội|15082021', {
			scale: 8,
			margin: 20,
		}),
	);
	const r = await analyze({
		filePath: png,
		kind: 'national_id',
		identity: { full_name: 'Nguyễn Văn An', national_id: '079199000111' },
	});
	assert.equal(r.status, 'done');
	assert.equal(r.verdict, 'ok');
	assert.equal(r.signals?.qr_cccd, true);
	assert.equal(r.signals?.id_match, false);
	assert.ok(r.warnings?.includes('id_mismatch'));
	const asDegree = await analyze({ filePath: png, kind: 'degree', identity: {} });
	assert.equal(asDegree.verdict, 'mismatch');
	assert.equal(asDegree.detected_kind, 'national_id');
});

test('analyze: file hỏng ⇒ unclear + unreadable, không ném lỗi', async () => {
	const bad = path.join(tmp, 'hong.pdf');
	fs.writeFileSync(bad, 'không phải PDF');
	const r = await analyze({ filePath: bad, kind: 'license', identity: {} });
	assert.equal(r.verdict, 'unclear');
	assert.deepEqual(r.warnings, ['unreadable']);
});

// ─── Công tắc bật / tắt (TRAINING_REGISTRATION_DOC_CHECK) ───────────────────────
test('tắt công tắc ⇒ summarize ẩn kết quả, worker để nguyên hàng đợi', async () => {
	const fileSvc = require('../../src/modules/training/registration/registrationFileService');
	const worker = require('../../src/modules/training/registration/docCheck/docCheckWorker');
	const rows = [
		{
			kind: 'degree',
			file_name: 'b.pdf',
			check_status: 'done',
			check_verdict: 'mismatch',
			check_warnings: '[]',
		},
	];
	const shown = fileSvc.summarize('external', rows).find((x) => x.kind === 'degree');
	assert.equal(shown?.check?.verdict, 'mismatch');
	const hidden = fileSvc
		.summarize('external', rows, { withChecks: false })
		.find((x) => x.kind === 'degree');
	assert.equal(hidden?.check, null);

	const origEnabled = svc.isEnabled;
	const origProcess = svc.processOne;
	let processed = 0;
	svc.isEnabled = async () => false;
	svc.processOne = async () => {
		processed++;
		return false;
	};
	try {
		process.env.DOC_CHECK_ENABLED = 'true';
		await worker.start();
		worker.kick();
		await new Promise((r) => setTimeout(r, 50));
		assert.equal(processed, 0, 'tắt ⇒ không nhận việc');
		svc.isEnabled = async () => true;
		worker.kick();
		await new Promise((r) => setTimeout(r, 50));
		assert.equal(processed, 1, 'bật lại ⇒ chạy tiếp hàng đợi');
	} finally {
		await worker.stop();
		svc.isEnabled = origEnabled;
		svc.processOne = origProcess;
	}
});
