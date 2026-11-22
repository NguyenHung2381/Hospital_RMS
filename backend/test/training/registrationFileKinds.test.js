// Loại file hồ sơ bắt buộc khi đăng ký khóa đào tạo liên tục (registrationFileKinds.js):
// quy tắc "đủ hồ sơ" theo đối tượng, nhãn, danh sách loại nộp được, mô tả gửi FE.
// File thuần — không cần CSDL.
const test = require('node:test');
const assert = require('node:assert/strict');
const kinds = require('../../src/modules/training/registration/registrationFileKinds');

test('missingKinds: nội viện đủ khi có file gộp cũ (dossier) hoặc tờ trình đã duyệt', () => {
	assert.deepEqual(kinds.missingKinds('internal', ['dossier']), []);
	assert.deepEqual(kinds.missingKinds('internal', ['proposal_approved']), []);
	// Đơn đăng ký đã ký thôi yêu cầu: có file cũ hay không cũng không đổi kết quả
	assert.deepEqual(kinds.missingKinds('internal', ['dossier', 'application_signed']), []);
});

test('missingKinds: tờ trình nội viện nộp bổ sung sau — lúc gửi không đòi, trạng thái hồ sơ vẫn báo thiếu', () => {
	assert.deepEqual(kinds.missingKinds('internal', []), ['proposal_approved']);
	assert.deepEqual(kinds.missingKinds('internal', ['application_signed']), ['proposal_approved']);
	assert.deepEqual(kinds.missingKinds('internal', [], { atSubmit: true }), []);
	// Loại của ngoại viện không giúp đơn nội viện đủ hồ sơ
	assert.deepEqual(kinds.missingKinds('internal', ['national_id', 'degree']), [
		'proposal_approved',
	]);
	// Ngoại viện: lúc gửi vẫn bắt buộc đủ 4 loại
	assert.deepEqual(kinds.missingKinds('external', ['degree'], { atSubmit: true }), [
		'national_id',
		'license',
		'decision',
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

test('UPLOADABLE_KINDS: 5 loại nộp mới, không có dossier / đơn đã ký; FORM_FIELD đúng tên phần multipart', () => {
	assert.deepEqual(kinds.UPLOADABLE_KINDS, [
		'proposal_approved',
		'national_id',
		'degree',
		'license',
		'decision',
	]);
	assert.ok(!kinds.UPLOADABLE_KINDS.includes('dossier'));
	assert.ok(!kinds.UPLOADABLE_KINDS.includes('application_signed'));
	assert.equal(kinds.FORM_FIELD('national_id'), 'files[national_id]');
});

test('kindDef / kindsFor: tra theo đối tượng; loại của đối tượng kia, dossier hoặc đơn đã ký ⇒ null', () => {
	assert.equal(kinds.kindDef('internal', 'proposal_approved').label, 'Tờ trình đã duyệt');
	assert.equal(kinds.kindDef('external', 'decision').doc_type, 'decision');
	assert.equal(kinds.kindDef('internal', 'national_id'), null);
	assert.equal(kinds.kindDef('internal', 'application_signed'), null);
	assert.equal(kinds.kindDef('external', 'proposal_approved'), null);
	assert.equal(kinds.kindDef('internal', 'dossier'), null);
	assert.deepEqual(kinds.kindsFor('lạ'), []);
});

test('retiredKindsIn: đơn cũ có đơn đã ký thì vẫn liệt kê để hiển thị', () => {
	assert.deepEqual(
		kinds.retiredKindsIn(['application_signed', 'proposal_approved']).map((k) => k.key),
		['application_signed'],
	);
	assert.deepEqual(kinds.retiredKindsIn(['proposal_approved']), []);
});

test('publicKinds: gửi FE đủ key / label / hint / required (+ later), bỏ doc_type; đuôi file cố định', () => {
	const pub = kinds.publicKinds();
	assert.deepEqual(Object.keys(pub).sort(), ['external', 'internal']);
	assert.deepEqual(
		pub.internal.map((k) => k.key),
		['proposal_approved'],
	);
	assert.deepEqual(
		pub.external.map((k) => k.key),
		['national_id', 'degree', 'license', 'decision'],
	);
	assert.deepEqual(Object.keys(pub.internal[0]).sort(), [
		'hint',
		'key',
		'label',
		'later',
		'required',
	]);
	assert.equal(pub.internal[0].required, false);
	assert.equal(pub.internal[0].later, true);
	for (const k of pub.external) {
		assert.deepEqual(Object.keys(k).sort(), ['hint', 'key', 'label', 'required']);
		assert.equal(k.required, true);
	}
	for (const k of [...pub.internal, ...pub.external]) assert.ok(k.hint.length > 0);
	assert.deepEqual(kinds.REGISTRATION_FILE_EXTENSIONS, ['.pdf', '.jpg', '.jpeg', '.png']);
	assert.equal(kinds.ACCEPT_MESSAGE, 'Hồ sơ chỉ nhận file PDF, JPG hoặc PNG.');
});
