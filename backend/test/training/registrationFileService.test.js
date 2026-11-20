// registrationFileService (file hồ sơ bắt buộc của 1 lượt đăng ký khóa đào tạo liên tục) trên CSDL giả:
// bóc req.files theo loại, kiểm bộ file gửi kèm, tóm tắt cho FE, nộp / thay từng file.
process.env.JWT_SECRET = 'test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { install } = require('../auth/fakeDb');

let prev = null; // dòng course_registration_files cũ của loại đang nộp
let docStatus = 'pending'; // trạng thái dòng trainee_documents cũ
let listed = []; // kết quả liệt kê hồ sơ của lượt
const log = install(async (text) => {
	if (/SELECT file_id, trainee_document_id FROM course_registration_files/.test(text))
		return prev ? [prev] : [];
	if (/INSERT INTO course_registration_files/.test(text))
		return [{ uploaded_at: new Date('2026-11-19T08:00:00Z') }];
	if (/SELECT status FROM trainee_documents/.test(text)) return [{ status: docStatus }];
	if (/FROM course_registration_files crf\s+JOIN training_files/.test(text)) return listed;
	return [];
});

const trainingFileService = require('../../src/modules/training/trainingFileService');
const saved = [];
trainingFileService.saveUploadedFile = async (entity, entityId, file, actorId) => {
	saved.push({ entity, entityId, name: file.originalname, actorId });
	return { id: `TF_NEW${saved.length}` };
};
const softDeleted = [];
trainingFileService.softDelete = async (id, actorId) => softDeleted.push([id, actorId]);
const traineeService = require('../../src/modules/training/trainees/traineeService');
const added = [];
const removed = [];
traineeService.addDocument = async (traineeId, file, actorId, opts) => {
	added.push({ traineeId, name: file.originalname, actorId, ...opts });
	return { id: `HS_NEW${added.length}`, file_id: `TF_DOC${added.length}` };
};
traineeService.removeDocument = async (id, actorId) => removed.push([id, actorId]);

const svc = require('../../src/modules/training/registration/registrationFileService');

const file = (name, over = {}) => ({
	originalname: name,
	filename: `x-${name}`,
	size: 10,
	mimetype: 'application/pdf',
	...over,
});
const INT = { application_signed: file('don.pdf'), proposal_approved: file('tt.jpg') };
const EXT = {
	national_id: file('cccd.pdf'),
	degree: file('bang.jpg'),
	license: file('cchn.png'),
	decision: file('qd.pdf'),
};
const reset = () => {
	log.length = 0;
	saved.length = 0;
	softDeleted.length = 0;
	added.length = 0;
	removed.length = 0;
	prev = null;
	docStatus = 'pending';
	listed = [];
};

test('collectByKind: bóc files[<kind>] của multer .fields(); mảng / undefined ⇒ {}', () => {
	const a = file('a.pdf');
	const b = file('b.png');
	assert.deepEqual(svc.collectByKind({ 'files[national_id]': [a], 'files[degree]': [b] }), {
		national_id: a,
		degree: b,
	});
	assert.deepEqual(svc.collectByKind({ 'files[license]': [a, b] }), { license: a }, 'lấy file đầu');
	assert.deepEqual(svc.collectByKind({ khac: [a], files: [b] }), {}, 'tên phần lạ bị bỏ');
	assert.deepEqual(svc.collectByKind([a, b]), {});
	assert.deepEqual(svc.collectByKind(undefined), {});
	assert.deepEqual(svc.collectByKind(null), {});
});

test('assertSubmission: đủ hồ sơ thì qua; nội viện có thể gửi JPG / PNG', () => {
	assert.doesNotThrow(() => svc.assertSubmission('internal', INT));
	assert.doesNotThrow(() => svc.assertSubmission('external', EXT));
});

test('assertSubmission: loại của đối tượng kia ⇒ 400 đúng câu', () => {
	assert.throws(
		() => svc.assertSubmission('external', { ...EXT, application_signed: INT.application_signed }),
		{
			statusCode: 400,
			message: 'Hồ sơ "Đơn đăng ký đã ký" không thuộc đối tượng đăng ký đã chọn.',
		},
	);
	assert.throws(() => svc.assertSubmission('internal', { ...INT, degree: EXT.degree }), {
		statusCode: 400,
		message: 'Hồ sơ "Bằng tốt nghiệp" không thuộc đối tượng đăng ký đã chọn.',
	});
	assert.throws(() => svc.assertSubmission('internal', { ...INT, dossier: file('g.pdf') }), {
		statusCode: 400,
		message:
			'Hồ sơ "Hồ sơ nộp bổ sung (đơn + tờ trình, 1 file)" không thuộc đối tượng đăng ký đã chọn.',
	});
});

test('assertSubmission: thiếu ⇒ 400 liệt kê nhãn đúng thứ tự khai báo', () => {
	assert.throws(() => svc.assertSubmission('external', {}), {
		statusCode: 400,
		message:
			'Vui lòng đính kèm đủ hồ sơ bắt buộc: Căn cước công dân, Bằng tốt nghiệp, Chứng chỉ hành nghề, Quyết định cử đi học.',
	});
	const { degree: _d, decision: _x, ...two } = EXT;
	assert.throws(() => svc.assertSubmission('external', two), {
		message: 'Vui lòng đính kèm đủ hồ sơ bắt buộc: Bằng tốt nghiệp, Quyết định cử đi học.',
	});
	assert.throws(
		() => svc.assertSubmission('internal', { proposal_approved: INT.proposal_approved }),
		{
			message: 'Vui lòng đính kèm đủ hồ sơ bắt buộc: Đơn đăng ký đã ký.',
		},
	);
});

test('assertSubmission: file không phải PDF / JPG / PNG ⇒ 400', () => {
	for (const bad of ['don.docx', 'don.exe', 'don', 'don.pdf.exe']) {
		assert.throws(
			() => svc.assertSubmission('internal', { ...INT, application_signed: file(bad) }),
			{
				statusCode: 400,
				message: 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.',
			},
		);
	}
	// Đuôi hoa + jpeg vẫn nhận
	assert.doesNotThrow(() =>
		svc.assertSubmission('internal', { ...INT, application_signed: file('ĐƠN.JPEG') }),
	);
});

const row = (kind, over = {}) => ({
	kind,
	uploaded_at: new Date('2026-11-19T08:00:00Z'),
	trainee_document_id: null,
	file_id: `TF_${kind}`,
	file_name: `${kind}.pdf`,
	file_url: `/uploads/${kind}.pdf`,
	mime_type: 'application/pdf',
	file_size: 10,
	review_status: null,
	...over,
});

test('summarize: luôn đủ dòng theo đối tượng + dossier cuối; file_url null khi withUrl:false', () => {
	const none = svc.summarize('external', []);
	assert.deepEqual(
		none.map((x) => [x.kind, x.required, x.legacy, x.uploaded_at, x.file_name, x.file_url]),
		[
			['national_id', true, false, null, null, null],
			['degree', true, false, null, null, null],
			['license', true, false, null, null, null],
			['decision', true, false, null, null, null],
		],
	);
	const rows = [row('application_signed'), row('dossier')];
	const noUrl = svc.summarize('internal', rows);
	assert.deepEqual(
		noUrl.map((x) => [x.kind, x.legacy, x.file_url === null]),
		[
			['application_signed', false, true],
			['proposal_approved', false, true],
			['dossier', true, true],
		],
	);
	assert.equal(noUrl[2].label, 'Hồ sơ nộp bổ sung (đơn + tờ trình, 1 file)');
	assert.equal(noUrl[2].required, false);
	assert.deepEqual(Object.keys(noUrl[0]).sort(), [
		'file_name',
		'file_url',
		'kind',
		'label',
		'legacy',
		'mime_type',
		'required',
		'review_status',
		'uploaded_at',
	]);
	const withUrl = svc.summarize('internal', rows, { withUrl: true });
	assert.equal(withUrl[0].file_url, '/uploads/application_signed.pdf');
	assert.equal(withUrl[1].file_url, null, 'loại chưa nộp không có link');
	// Dòng dossier chỉ có khi đơn có file gộp
	assert.equal(svc.summarize('internal', []).length, 2);
	// Không có dòng nào của loại đối tượng kia lọt vào
	assert.ok(!svc.summarize('internal', [row('national_id')]).some((x) => x.kind === 'national_id'));
});

test('rejected tính là thiếu (presentKinds / describe) nhưng dòng vẫn hiện review_status', async () => {
	reset();
	listed = [
		row('national_id', { review_status: 'rejected' }),
		row('degree', { review_status: 'approved' }),
		row('license', { review_status: 'pending' }),
	];
	assert.deepEqual(svc.presentKinds(listed), ['degree', 'license']);
	const d = await svc.describe({ enrollment_id: 'E1', source: 'external' });
	assert.deepEqual(d.files_missing, ['national_id', 'decision']);
	assert.deepEqual(
		d.files.map((x) => [x.kind, x.review_status]),
		[
			['national_id', 'rejected'],
			['degree', 'approved'],
			['license', 'pending'],
			['decision', null],
		],
	);
	assert.ok(d.files.every((x) => x.file_url === null));
	const withUrl = await svc.describe(
		{ enrollment_id: 'E1', source: 'external' },
		{ withUrl: true },
	);
	assert.equal(withUrl.files[0].file_url, '/uploads/national_id.pdf');
	// Câu truy vấn chỉ đọc file chưa xóa
	const q = log.find((x) => /FROM course_registration_files crf/.test(x.text));
	assert.match(q.text, /f\.is_deleted = 'false'/);
	assert.equal(q.inputs.id, 'E1');
});

test('attach nội viện: lần đầu ⇒ file entity course_registration + 1 dòng upsert; không xóa gì', async () => {
	reset();
	const out = await svc.attach(
		{ enrollment_id: 'E1', source: 'internal', trainee_id: 'T1' },
		'application_signed',
		file('don.pdf'),
		null,
	);
	assert.equal(out.kind, 'application_signed');
	assert.ok(out.uploaded_at instanceof Date);
	assert.deepEqual(saved, [
		{ entity: 'course_registration', entityId: 'E1', name: 'don.pdf', actorId: null },
	]);
	const ins = log.filter((q) => /INSERT INTO course_registration_files/.test(q.text));
	assert.equal(ins.length, 1);
	assert.match(ins[0].text, /ON CONFLICT \(enrollment_id, kind\) DO UPDATE/);
	assert.deepEqual(
		[ins[0].inputs.id, ins[0].inputs.kind, ins[0].inputs.file_id, ins[0].inputs.doc_id],
		['E1', 'application_signed', 'TF_NEW1', null],
	);
	assert.deepEqual(softDeleted, []);
	assert.equal(added.length, 0);
});

test('attach nội viện: thay file ⇒ xóa mềm file cũ cùng loại, người nộp được ghi', async () => {
	reset();
	prev = { file_id: 'TF_OLD', trainee_document_id: null };
	await svc.attach(
		{ enrollment_id: 'E1', source: 'internal' },
		'proposal_approved',
		file('tt-moi.png'),
		'U9',
	);
	assert.deepEqual(softDeleted, [['TF_OLD', 'U9']]);
	assert.equal(saved[0].actorId, 'U9');
	const ins = log.find((q) => /INSERT INTO course_registration_files/.test(q.text));
	assert.equal(ins.inputs.actor_id, 'U9');
	assert.equal(ins.inputs.kind, 'proposal_approved');
});

test('attach ngoại viện: file vào hồ sơ học viên (pending, đúng doc_type); thay file ⇒ xóa dòng cũ pending, giữ approved / rejected', async () => {
	reset();
	const reg = { enrollment_id: 'E2', source: 'external', trainee_id: 'HV1' };
	await svc.attach(reg, 'license', file('cchn.png'), null);
	assert.deepEqual(added, [
		{ traineeId: 'HV1', name: 'cchn.png', actorId: null, status: 'pending', docType: 'license' },
	]);
	assert.equal(saved.length, 0, 'không ghi file entity course_registration');
	let ins = log.find((q) => /INSERT INTO course_registration_files/.test(q.text));
	assert.deepEqual(
		[ins.inputs.file_id, ins.inputs.doc_id],
		['TF_DOC1', 'HS_NEW1'],
		'trỏ đúng file và dòng giấy tờ của hồ sơ học viên',
	);
	assert.deepEqual(removed, []);

	for (const [status, expected] of [
		['pending', [['HS_OLD', null]]],
		['approved', []],
		['rejected', []],
	]) {
		reset();
		prev = { file_id: 'TF_OLD', trainee_document_id: 'HS_OLD' };
		docStatus = status;
		await svc.attach(reg, 'license', file('cchn2.jpg'), null);
		assert.deepEqual(removed, expected, status);
		assert.deepEqual(softDeleted, [], 'ngoại viện không xóa mềm file trực tiếp');
		ins = log.filter((q) => /INSERT INTO course_registration_files/.test(q.text));
		assert.equal(ins.length, 1, `${status}: đúng 1 dòng / loại (upsert)`);
	}
});

test('attach: loại không thuộc đối tượng / đuôi sai ⇒ 400, không ghi gì', async () => {
	reset();
	await assert.rejects(
		svc.attach({ enrollment_id: 'E1', source: 'internal' }, 'national_id', file('a.pdf'), null),
		{ statusCode: 400, message: 'Loại hồ sơ không hợp lệ cho đơn này.' },
	);
	await assert.rejects(
		svc.attach({ enrollment_id: 'E1', source: 'internal' }, 'dossier', file('a.pdf'), null),
		{ statusCode: 400 },
	);
	await assert.rejects(
		svc.attach(
			{ enrollment_id: 'E1', source: 'external', trainee_id: 'H' },
			'degree',
			file('a.docx'),
			null,
		),
		{ statusCode: 400, message: 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.' },
	);
	assert.equal(saved.length + added.length, 0);
	assert.ok(!log.some((q) => /INSERT INTO course_registration_files/.test(q.text)));
});

test('attachAll: nộp lần lượt theo thứ tự loại của đối tượng', async () => {
	reset();
	const out = await svc.attachAll(
		{ enrollment_id: 'E2', source: 'external', trainee_id: 'HV1' },
		{
			decision: EXT.decision,
			national_id: EXT.national_id,
			license: EXT.license,
			degree: EXT.degree,
		},
		null,
	);
	assert.deepEqual(
		out.map((x) => x.kind),
		['national_id', 'degree', 'license', 'decision'],
	);
	assert.deepEqual(
		added.map((a) => a.docType),
		['national_id', 'degree', 'license', 'decision'],
	);
	reset();
	await svc.attachAll({ enrollment_id: 'E1', source: 'internal' }, INT, null);
	assert.deepEqual(
		log
			.filter((q) => /INSERT INTO course_registration_files/.test(q.text))
			.map((q) => q.inputs.kind),
		['application_signed', 'proposal_approved'],
	);
});
