// Loại file hồ sơ bắt buộc khi đăng ký khóa đào tạo liên tục (registrationFileKinds.js):
// quy tắc "đủ hồ sơ" theo đối tượng, nhãn, danh sách loại nộp được, mô tả gửi FE.
// File thuần — không cần CSDL.
const test = require('node:test');
const assert = require('node:assert/strict');
const kinds = require('../../src/modules/training/registration/registrationFileKinds');

test('missingKinds: nội viện đủ khi có file gộp cũ (dossier) hoặc cả đơn đã ký + tờ trình đã duyệt', () => {
	assert.deepEqual(kinds.missingKinds('internal', ['dossier']), []);
	assert.deepEqual(kinds.missingKinds('internal', ['application_signed', 'proposal_approved']), []);
	// Có file gộp cũ thì loại nào khác cũng không cần
	assert.deepEqual(kinds.missingKinds('internal', ['dossier', 'application_signed']), []);
});

test('missingKinds: nội viện thiếu 1 loại ⇒ đúng khóa; chưa nộp gì ⇒ cả 2 theo thứ tự khai báo', () => {
	assert.deepEqual(kinds.missingKinds('internal', ['application_signed']), ['proposal_approved']);
	assert.deepEqual(kinds.missingKinds('internal', ['proposal_approved']), ['application_signed']);
	assert.deepEqual(kinds.missingKinds('internal', []), ['application_signed', 'proposal_approved']);
	// Loại của ngoại viện không giúp đơn nội viện đủ hồ sơ
	assert.deepEqual(kinds.missingKinds('internal', ['national_id', 'degree']), [
		'application_signed',
		'proposal_approved',
	]);
});

test('missingKinds: ngoại viện đủ khi có cả 4 loại; file gộp cũ (dossier) không thay được', () => {
	const all = ['national_id', 'degree', 'license', 'decision'];
	assert.deepEqual(kinds.missingKinds('external', all), []);
	assert.deepEqual(kinds.missingKinds('external', new Set(all)), [], 'nhận cả Set');
	assert.deepEqual(kinds.missingKinds('external', ['dossier']), all);
	assert.deepEqual(kinds.missingKinds('external', ['national_id', 'license']), [
		'degree',
		'decision',
	]);
	assert.deepEqual(kinds.missingKinds('lạ', []), [], 'đối tượng lạ ⇒ không đòi gì');
});

test('labelOf: nhãn từng loại, kể cả file gộp cũ; khóa lạ trả lại chính nó', () => {
	assert.equal(kinds.labelOf('dossier'), 'Hồ sơ nộp bổ sung (đơn + tờ trình, 1 file)');
	assert.equal(kinds.labelOf('application_signed'), 'Đơn đăng ký đã ký');
	assert.equal(kinds.labelOf('proposal_approved'), 'Tờ trình đã duyệt');
	assert.equal(kinds.labelOf('national_id'), 'Căn cước công dân');
	assert.equal(kinds.labelOf('degree'), 'Bằng tốt nghiệp');
	assert.equal(kinds.labelOf('license'), 'Chứng chỉ hành nghề');
	assert.equal(kinds.labelOf('decision'), 'Quyết định cử đi học');
	assert.equal(kinds.labelOf('khong-co'), 'khong-co');
});

test('UPLOADABLE_KINDS: đủ 6 loại nộp mới, không có dossier; FORM_FIELD đúng tên phần multipart', () => {
	assert.deepEqual(kinds.UPLOADABLE_KINDS, [
		'application_signed',
		'proposal_approved',
		'national_id',
		'degree',
		'license',
		'decision',
	]);
	assert.ok(!kinds.UPLOADABLE_KINDS.includes('dossier'));
	assert.equal(kinds.FORM_FIELD('national_id'), 'files[national_id]');
});

test('kindDef / kindsFor: tra theo đối tượng; loại của đối tượng kia hoặc dossier ⇒ null', () => {
	assert.equal(kinds.kindDef('internal', 'application_signed').label, 'Đơn đăng ký đã ký');
	assert.equal(kinds.kindDef('external', 'decision').doc_type, 'decision');
	assert.equal(kinds.kindDef('internal', 'national_id'), null);
	assert.equal(kinds.kindDef('external', 'application_signed'), null);
	assert.equal(kinds.kindDef('internal', 'dossier'), null);
	assert.deepEqual(kinds.kindsFor('lạ'), []);
});

test('publicKinds: gửi FE đủ key / label / hint / required, bỏ doc_type; đuôi file cố định', () => {
	const pub = kinds.publicKinds();
	assert.deepEqual(Object.keys(pub).sort(), ['external', 'internal']);
	assert.deepEqual(
		pub.internal.map((k) => k.key),
		['application_signed', 'proposal_approved'],
	);
	assert.deepEqual(
		pub.external.map((k) => k.key),
		['national_id', 'degree', 'license', 'decision'],
	);
	for (const k of [...pub.internal, ...pub.external]) {
		assert.deepEqual(Object.keys(k).sort(), ['hint', 'key', 'label', 'required']);
		assert.equal(k.required, true);
		assert.ok(k.hint.length > 0);
	}
	assert.deepEqual(kinds.REGISTRATION_FILE_EXTENSIONS, ['.pdf', '.jpg', '.jpeg', '.png']);
	assert.equal(kinds.ACCEPT_MESSAGE, 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.');
});
