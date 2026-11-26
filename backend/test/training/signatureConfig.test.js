// Cấu hình chi tiết kiểm chữ ký (TRAINING_DOC_SIGNATURE_RULES — docCheck/signature/signatureRules.js):
// bật/tắt theo loại giấy tờ × mục kiểm + tuỳ chọn chung, áp lúc kiểm (combine) và lúc hiển thị
// (presentSignature). Dữ liệu giả lập dạng sig_details, không đọc file.
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../../src/modules/training/registration/docCheck/signature/signatureRules');

const { combine, presentSignature } = rules;

/** sig_details giả lập (dạng combine lưu). */
const details = ({
	kind = 'decision',
	digital = null,
	seal = false,
	hand = true,
	handMethod = 'ocr',
	ran = undefined,
	textLayer = false,
} = {}) => ({
	kind,
	rule: rules.SIGNATURE_REQUIREMENTS[kind].rule,
	digital,
	pages: [
		{
			page: 1,
			verdict: 'marks_missing',
			color_available: true,
			seal,
			seal_count: seal ? 1 : 0,
			hand_signature: hand,
			hand_method: handMethod,
		},
	],
	text_layer: textLayer,
	...(ran ? { ran } : {}),
});

const dig = (verdict, extra = {}) => ({
	verdict,
	signatures: verdict === 'none' ? 0 : 1,
	timestamps: 0,
	signer: verdict === 'none' ? null : { cn: 'Nguyễn Văn Ký', o: 'Bệnh viện A', issuer_cn: 'CA X' },
	signed_at: null,
	time_source: null,
	chain: verdict === 'untrusted' ? 'untrusted' : 'trusted',
	org_match: null,
	warnings: [],
	...extra,
});

const cfg = (kinds = {}, options = {}) => rules.normalizeSignatureConfig({ kinds, options });

test('normalizeSignatureConfig: rỗng / hỏng ⇒ mặc định bật hết; trường sai kiểu lấy mặc định', () => {
	const def = rules.normalizeSignatureConfig(null);
	for (const raw of ['', '{hỏng', '[]', 42, undefined]) {
		assert.deepEqual(rules.normalizeSignatureConfig(raw), def, String(raw));
	}
	assert.deepEqual(Object.keys(def.kinds), [...rules.CONFIG_KINDS]);
	assert.deepEqual(def.kinds.decision, {
		enabled: true,
		digital: true,
		seal: true,
		hand: true,
		on_missing: 'warn',
	});
	assert.deepEqual(def.options, {
		warn_untrusted: true,
		org_match: true,
		reprint_warning: true,
		ocr: true,
	});

	const c = rules.normalizeSignatureConfig(
		JSON.stringify({
			kinds: { degree: { seal: false, hand: 'x', on_missing: 'info' }, unknown_kind: {} },
			options: { ocr: false },
		}),
	);
	assert.deepEqual(c.kinds.degree, {
		enabled: true,
		digital: true,
		seal: false,
		hand: true,
		on_missing: 'info',
	});
	assert.equal(c.kinds.unknown_kind, undefined, 'loại không biết bị bỏ');
	assert.equal(c.options.ocr, false);
	assert.equal(c.options.org_match, true);
});

test('kindConfig / needsSignatureCheck: tắt loại hoặc tắt hết mục ⇒ không kiểm', () => {
	assert.ok(rules.needsSignatureCheck('decision'));
	assert.equal(rules.needsSignatureCheck('decision', cfg({ decision: { enabled: false } })), false);
	assert.equal(
		rules.needsSignatureCheck(
			'decision',
			cfg({ decision: { digital: false, seal: false, hand: false } }),
		),
		false,
	);
	assert.equal(rules.needsSignatureCheck('national_id', cfg()), false);
	assert.equal(rules.kindConfig(cfg({ license: { enabled: false } }), 'license'), null);
});

test('evaluateDetails: tắt dò dấu ⇒ Quyết định chỉ cần chữ ký tay', () => {
	const d = details({ seal: false, hand: true });
	assert.equal(rules.evaluateDetails(d)?.verdict, 'missing', 'mặc định: thiếu dấu');
	const ev = rules.evaluateDetails(d, cfg({ decision: { seal: false } }));
	assert.equal(ev?.verdict, 'ok');
	assert.deepEqual(ev?.marks, { seal: 'off', hand: 'present' });
	assert.deepEqual(ev?.needed, ['hand']);
	assert.ok(!ev?.warnings.includes('seal_missing'));
});

test('evaluateDetails: chỉ bật chữ ký số ⇒ không có là thiếu, hợp lệ là đạt, hỏng là cảnh báo', () => {
	const only = cfg({ license: { seal: false, hand: false } });
	const none = rules.evaluateDetails(details({ kind: 'license', digital: dig('none') }), only);
	assert.equal(none?.verdict, 'missing');
	assert.ok(none?.digital_only);
	assert.deepEqual(none?.warnings, ['digital_missing']);
	// Ảnh (không phải PDF) cũng không thể có chữ ký số
	assert.equal(
		rules.evaluateDetails(details({ kind: 'license', digital: null }), only)?.verdict,
		'missing',
	);
	assert.equal(
		rules.evaluateDetails(details({ kind: 'license', digital: dig('valid') }), only)?.verdict,
		'ok',
	);
	const bad = rules.evaluateDetails(details({ kind: 'license', digital: dig('invalid') }), only);
	assert.equal(bad?.verdict, 'warn');
	assert.equal(bad?.missing_only, false);
});

test('evaluateDetails: tắt chữ ký số ⇒ bỏ cảnh báo chữ ký số, kết luận theo dấu + chữ ký tay', () => {
	const d = details({ digital: dig('invalid'), seal: true, hand: true });
	assert.equal(rules.evaluateDetails(d)?.verdict, 'warn');
	const ev = rules.evaluateDetails(d, cfg({ decision: { digital: false } }));
	assert.equal(ev?.verdict, 'ok');
	assert.deepEqual(ev?.warnings, []);
	// Thiếu dấu + không kiểm chữ ký số ⇒ không nhắc "không thấy chữ ký số hợp lệ"
	const miss = rules.evaluateDetails(
		details({ seal: false }),
		cfg({ decision: { digital: false } }),
	);
	assert.equal(miss?.verdict, 'missing');
	assert.ok(!miss?.warnings.includes('signature_missing'));
});

test('evaluateDetails: Tờ trình tắt chữ ký tay, còn bật dấu ⇒ kết luận theo dấu', () => {
	const c = cfg({ proposal_approved: { hand: false } });
	const withSeal = details({ kind: 'proposal_approved', seal: true, hand: null });
	assert.equal(rules.evaluateDetails(withSeal, c)?.verdict, 'ok');
	const noSeal = details({ kind: 'proposal_approved', seal: false, hand: null });
	assert.equal(rules.evaluateDetails(noSeal, c)?.verdict, 'missing');
});

test('evaluateDetails: tuỳ chọn chung — CA lạ, so tổ chức, bản in lại', () => {
	const untrusted = details({ digital: dig('untrusted'), seal: true, hand: true });
	assert.equal(rules.evaluateDetails(untrusted)?.verdict, 'warn');
	const off = rules.evaluateDetails(untrusted, cfg({}, { warn_untrusted: false }));
	assert.equal(off?.verdict, 'ok', 'CA lạ không cảnh báo — đủ dấu + chữ ký tay');
	assert.ok(!off?.warnings.includes('digital_untrusted'));
	// Chữ ký CA lạ bị bỏ qua không bị coi là "bản in lại"
	const offReprint = rules.evaluateDetails(
		{ ...untrusted, text_layer: true },
		cfg({}, { warn_untrusted: false }),
	);
	assert.ok(!offReprint?.warnings.includes('seal_image_no_digital'));

	const mism = details({ digital: dig('valid', { org_match: false }) });
	assert.ok(rules.evaluateDetails(mism)?.warnings.includes('signer_org_mismatch'));
	const noOrg = rules.evaluateDetails(mism, cfg({}, { org_match: false }));
	assert.equal(noOrg?.verdict, 'ok');
	assert.deepEqual(noOrg?.warnings, []);

	const reprint = details({ digital: dig('none'), seal: true, hand: true, textLayer: true });
	assert.equal(rules.evaluateDetails(reprint)?.verdict, 'warn');
	assert.equal(rules.evaluateDetails(reprint, cfg({}, { reprint_warning: false }))?.verdict, 'ok');
});

test('evaluateDetails: mục bật sau khi file đã kiểm ⇒ không kết luận thiếu, nhắc kiểm lại', () => {
	const d = details({ seal: false, hand: true, ran: { digital: true, seal: false, hand: true } });
	const ev = rules.evaluateDetails(d);
	assert.equal(ev?.marks.seal, 'unknown', 'dấu chưa dò ⇒ không biết, không phải "thiếu"');
	assert.ok(!ev?.warnings.includes('seal_missing'));
	assert.ok(ev?.warnings.includes('config_changed'));
	// Dòng cũ (không có ran) ⇒ coi như đã chạy đủ, không nhắc
	assert.ok(!rules.evaluateDetails(details())?.warnings.includes('config_changed'));
});

test('presentSignature: áp cấu hình hiện tại lúc hiển thị', () => {
	const json = JSON.stringify(details({ seal: false, hand: true }));
	assert.equal(presentSignature('missing', json)?.level, 'warn');
	// Tắt loại ⇒ ẩn
	assert.equal(
		presentSignature('missing', json, { config: cfg({ decision: { enabled: false } }) }),
		null,
	);
	// Tắt dò dấu ⇒ đạt ngay, không cần kiểm lại
	const p = presentSignature('missing', json, { config: cfg({ decision: { seal: false } }) });
	assert.equal(p?.verdict, 'ok');
	assert.equal(p?.message, 'Có chữ ký tay.');
	assert.equal(p?.marks.seal, null);
	// Thiếu thì chỉ ghi chú ⇒ mức info; chữ ký số hỏng thì vẫn cảnh báo
	const info = cfg({ decision: { on_missing: 'info' } });
	assert.equal(presentSignature('missing', json, { config: info })?.level, 'info');
	const broken = JSON.stringify(details({ digital: dig('invalid'), seal: false }));
	assert.equal(presentSignature('warn', broken, { config: info })?.level, 'warn');
	// Chỉ bật chữ ký số
	const only = presentSignature('missing', JSON.stringify(details({ digital: dig('none') })), {
		config: cfg({ decision: { seal: false, hand: false } }),
	});
	assert.equal(only?.message, 'Thiếu chữ ký số hợp lệ.');
	// Hồ sơ học viên tắt ⇒ ẩn
	const tr = JSON.stringify(details({ kind: 'trainee_document', seal: true }));
	const trOff = cfg({ trainee_document: { enabled: false } });
	assert.equal(presentSignature('ok', tr, { trainee: true, config: trOff }), null);
});

test('combine: ghi mục đã chạy (ran) + lớp chữ để tính lại lúc hiển thị; loại tắt ⇒ n/a', () => {
	const r = combine('decision', null, [], {
		textLayer: true,
		ran: { digital: false, seal: true, hand: true },
	});
	assert.deepEqual(r.sig_details.ran, { digital: false, seal: true, hand: true });
	assert.equal(r.sig_details.text_layer, true);
	const off = combine('decision', null, [], {}, cfg({ decision: { enabled: false } }));
	assert.equal(off.sig_verdict, 'n/a');
});
