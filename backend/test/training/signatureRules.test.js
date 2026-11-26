// Luật gộp kết quả chữ ký (docCheck/signature/signatureRules.js) — dữ liệu đầu vào giả lập dạng trả
// về của verifyPdfSignatures / detectMarks, không đọc file.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	SIGNATURE_REQUIREMENTS,
	SIG_WARNING_MESSAGES,
	needsSignatureCheck,
	combine,
	presentSignature,
} = require('../../src/modules/training/registration/docCheck/signature/signatureRules');

const signer = {
	cn: 'NGUYỄN VĂN AN',
	o: 'Bệnh viện Hữu nghị Đa khoa Nghệ An',
	serial: '0a',
	issuer_cn: 'VNPT Certification Authority',
};
/** Kết quả verifyPdfSignatures giả lập. */
const digital = (verdict, extra = {}) => ({
	verdict,
	warnings: extra.warnings ?? [],
	signatures:
		verdict === 'none'
			? []
			: [
					{
						kind: 'signature',
						sub_filter: 'adbe.pkcs7.detached',
						covers_whole_file: true,
						integrity: verdict !== 'invalid',
						chain: extra.chain ?? (verdict === 'untrusted' ? 'untrusted' : 'trusted'),
						cert_valid_at_signing: true,
						time_source: 'tsa',
						revocation: 'unknown',
						signer: extra.signer ?? signer,
						signed_at: '2026-11-20T03:00:00.000Z',
						warnings: [],
					},
				],
});
/** Kết quả detectMarks giả lập cho 1 trang. */
const marks = ({ seal = null, hand = false, method = 'ink_only', color = seal !== null } = {}) => ({
	verdict: 'unclear',
	color_available: color,
	seal: { found: seal, count: seal ? 1 : 0, boxes: [] },
	hand_signature: {
		found: hand,
		near_title: hand && method === 'ocr',
		title_found: method === 'ocr',
		method,
	},
	signals: { ms: 1, red_px: 0, blue_px: 0, colorful_px: 0 },
});
const page = (n, m) => ({ page: n, result: marks(m) });

test('bảng yêu cầu: đủ các loại, CCCD không kiểm', () => {
	for (const k of [
		'decision',
		'proposal_approved',
		'license',
		'degree',
		'national_id',
		'trainee_document',
	])
		assert.ok(SIGNATURE_REQUIREMENTS[k], k);
	assert.equal(needsSignatureCheck('national_id'), false);
	assert.equal(needsSignatureCheck('decision'), true);
	assert.equal(needsSignatureCheck('lạ'), false);
	assert.deepEqual(combine('national_id', digital('valid'), []).sig_verdict, 'n/a');
});

test('decision: chữ ký số hợp lệ ⇒ ok dù không có dấu', () => {
	const r = combine('decision', digital('valid'), [
		page(1, { seal: false, hand: false, method: 'ocr' }),
	]);
	assert.equal(r.sig_verdict, 'ok');
	assert.equal(r.sig_details.digital.signer.cn, 'NGUYỄN VĂN AN');
	assert.equal(r.sig_details.digital.signer.issuer_cn, 'VNPT Certification Authority');
	assert.equal(r.sig_details.digital.signed_at, '2026-11-20T03:00:00.000Z');
	assert.ok(!('serial' in r.sig_details.digital.signer), 'không lưu serial');
});

test('decision: không chữ ký số ⇒ cần dấu đỏ + chữ ký tay', () => {
	assert.equal(
		combine('decision', digital('none'), [page(1, { seal: true, hand: true })]).sig_verdict,
		'ok',
	);
	assert.equal(
		combine('decision', null, [page(1, { seal: true, hand: true })]).sig_verdict,
		'ok',
		'ảnh',
	);
	const noSeal = combine('decision', null, [page(1, { seal: false, hand: true })]);
	assert.equal(noSeal.sig_verdict, 'missing');
	assert.deepEqual(noSeal.sig_details.warnings, ['seal_missing', 'signature_missing']);
	const blank = combine('decision', null, [page(1, { seal: true, hand: false, method: 'ocr' })]);
	assert.equal(blank.sig_verdict, 'missing');
	assert.ok(blank.sig_details.warnings.includes('hand_signature_missing'));
	// Bản đen trắng, không OCR ⇒ không kết luận thiếu
	const bw = combine('decision', null, [page(1, { seal: null, hand: false })]);
	assert.equal(bw.sig_verdict, 'unclear');
	assert.deepEqual(bw.sig_details.warnings, ['marks_unclear']);
});

test('decision: gộp nhiều trang — dấu ở trang cuối, chức danh trống ở trang đầu không làm "thiếu"', () => {
	const r = combine('decision', null, [
		page(1, { seal: false, hand: false }),
		page(3, { seal: true, hand: true, method: 'ocr' }),
	]);
	assert.equal(r.sig_verdict, 'ok');
	assert.deepEqual(r.sig_details.marks, { seal: 'present', hand: 'present' });
	assert.deepEqual(
		r.sig_details.pages.map((p) => [p.page, p.seal, p.hand_signature]),
		[
			[1, false, false],
			[3, true, true],
		],
	);
	// trang dò lỗi ⇒ unclear
	assert.equal(combine('decision', null, [{ page: 1, result: null }]).sig_verdict, 'unclear');
});

test('chữ ký số có vấn đề ⇒ warn kèm mã; thiếu CA trung gian ⇒ gợi ý', () => {
	const inv = combine('decision', digital('invalid'), [page(1, { seal: true, hand: true })]);
	assert.equal(inv.sig_verdict, 'warn');
	assert.deepEqual(inv.sig_details.warnings, ['digital_invalid']);
	assert.equal(
		combine('decision', digital('modified'), []).sig_details.warnings[0],
		'digital_modified',
	);
	const unt = combine(
		'decision',
		digital('untrusted', { chain: 'incomplete', warnings: ['chain_incomplete'] }),
		[],
	);
	assert.equal(unt.sig_verdict, 'warn');
	assert.deepEqual(unt.sig_details.warnings, ['digital_untrusted', 'chain_incomplete']);
	// chữ ký số hỏng + rõ ràng thiếu dấu ⇒ missing
	const worse = combine('decision', digital('invalid'), [
		page(1, { seal: false, hand: false, method: 'ocr' }),
	]);
	assert.equal(worse.sig_verdict, 'missing');
	// chỉ có dấu thời gian tài liệu ⇒ coi như không có chữ ký số
	const tsOnly = digital('valid');
	tsOnly.signatures[0].kind = 'timestamp';
	assert.equal(
		combine('decision', tsOnly, [page(1, { seal: false, hand: true })]).sig_verdict,
		'missing',
	);
});

test('so mờ tổ chức người ký với đơn vị đã khai', () => {
	const same = combine('decision', digital('valid'), [], {
		unit: 'Bệnh viện Hữu nghị Đa khoa Nghệ An',
	});
	assert.equal(same.sig_verdict, 'ok');
	assert.equal(same.sig_details.digital.org_match, true);
	const other = combine('decision', digital('valid'), [], {
		unit: 'Trung tâm Y tế huyện Quỳnh Lưu',
	});
	assert.equal(other.sig_verdict, 'warn');
	assert.deepEqual(other.sig_details.warnings, ['signer_org_mismatch']);
	assert.equal(
		combine('decision', digital('valid'), []).sig_details.digital.org_match,
		null,
		'không khai ⇒ không so',
	);
});

test('có hình dấu nhưng không chữ ký số (PDF xuất từ máy) ⇒ warn bản in lại', () => {
	const r = combine('decision', digital('none'), [page(1, { seal: true, hand: true })], {
		textLayer: true,
	});
	assert.equal(r.sig_verdict, 'warn');
	assert.deepEqual(r.sig_details.warnings, ['seal_image_no_digital']);
	// bản scan (không lớp chữ) ⇒ bình thường
	assert.equal(
		combine('decision', digital('none'), [page(1, { seal: true, hand: true })], {
			textLayer: false,
		}).sig_verdict,
		'ok',
	);
});

test('proposal_approved: cần chữ ký tay, dấu không bắt buộc', () => {
	assert.equal(
		combine('proposal_approved', null, [page(1, { seal: false, hand: true })]).sig_verdict,
		'ok',
	);
	const miss = combine('proposal_approved', null, [
		page(1, { seal: true, hand: false, method: 'ocr' }),
	]);
	assert.equal(miss.sig_verdict, 'missing');
	assert.deepEqual(miss.sig_details.warnings, ['hand_signature_missing']);
	assert.equal(
		combine('proposal_approved', null, [page(1, { seal: null })]).sig_verdict,
		'unclear',
	);
	assert.equal(combine('proposal_approved', digital('valid'), []).sig_verdict, 'ok');
});

test('license / degree: thiếu chỉ cảnh báo nhẹ (warn, không missing)', () => {
	for (const kind of ['license', 'degree']) {
		assert.equal(combine(kind, null, [page(1, { seal: true, hand: true })]).sig_verdict, 'ok');
		const r = combine(kind, null, [page(1, { seal: false, hand: true })]);
		assert.equal(r.sig_verdict, 'warn', kind);
		assert.deepEqual(r.sig_details.warnings, ['seal_missing']);
	}
});

test('trainee_document: chỉ báo, không kết luận thiếu', () => {
	const none = combine('trainee_document', digital('none'), [
		page(1, { seal: false, hand: false, method: 'ocr' }),
	]);
	assert.equal(none.sig_verdict, 'unclear');
	assert.ok(!none.sig_details.warnings.includes('hand_signature_missing'));
	const seal = combine(
		'trainee_document',
		digital('none'),
		[page(1, { seal: false }), page(5, { seal: true })],
		{ textLayer: true, pageCount: 5 },
	);
	assert.equal(seal.sig_verdict, 'ok');
	assert.equal(seal.sig_details.page_count, 5);
	assert.deepEqual(seal.sig_details.warnings, [], 'không cảnh báo bản in lại cho hồ sơ học viên');
	assert.equal(combine('trainee_document', digital('invalid'), []).sig_verdict, 'warn');
});

test('mọi mã cảnh báo đều có lời nhắn', () => {
	const cases = [
		combine('decision', digital('untrusted', { chain: 'incomplete' }), []),
		combine('decision', digital('valid'), [], { unit: 'Trường Đại học Y Hà Nội' }),
		combine('decision', digital('none'), [page(1, { seal: true, hand: false, method: 'ocr' })], {
			textLayer: true,
		}),
		combine('decision', null, [page(1, { seal: false, hand: true })]),
		combine('decision', null, [page(1, { seal: null })]),
	];
	for (const c of cases)
		for (const code of c.sig_details.warnings) assert.ok(SIG_WARNING_MESSAGES[code], code);
});

test('presentSignature: khối gửi FE', () => {
	assert.equal(presentSignature(null, null), null);
	assert.equal(presentSignature('n/a', '{}'), null);

	const ok = combine('decision', digital('valid'), [page(2, { seal: true, hand: true })]);
	const p = presentSignature(ok.sig_verdict, JSON.stringify(ok.sig_details));
	assert.equal(p?.level, 'ok');
	assert.equal(p?.verdict, 'ok');
	assert.equal(p?.digital, 'valid');
	assert.match(p?.message ?? '', /chữ ký số hợp lệ của NGUYỄN VĂN AN – Bệnh viện Hữu nghị/);
	assert.deepEqual(p?.signer, {
		cn: 'NGUYỄN VĂN AN',
		o: 'Bệnh viện Hữu nghị Đa khoa Nghệ An',
		issuer_cn: 'VNPT Certification Authority',
		signed_at: '2026-11-20T03:00:00.000Z',
		time_source: 'tsa',
	});
	assert.deepEqual(p?.marks, {
		seal: true,
		hand_signature: true,
		pages: [{ page: 2, seal: true, hand_signature: true }],
	});
	assert.deepEqual(p?.warnings, []);

	const miss = combine('decision', null, [page(1, { seal: false, hand: true })]);
	const pm = presentSignature(miss.sig_verdict, miss.sig_details);
	assert.equal(pm?.level, 'warn');
	assert.equal(pm?.signer, undefined, 'không chữ ký số ⇒ không có signer');
	assert.match(pm?.message ?? '', /Thiếu chữ ký số hợp lệ hoặc dấu đỏ/);
	assert.deepEqual(
		pm?.warnings.map((w) => w.code),
		['seal_missing', 'signature_missing'],
	);

	const w = combine('decision', digital('modified'), []);
	const pw = presentSignature(w.sig_verdict, w.sig_details);
	assert.equal(pw?.level, 'warn');
	assert.equal(pw?.message, SIG_WARNING_MESSAGES.digital_modified);

	const un = presentSignature('unclear', '{"warnings":["marks_unclear","lạ"]}');
	assert.equal(un?.level, 'info');
	assert.deepEqual(
		un?.warnings.map((x) => x.code),
		['marks_unclear'],
		'bỏ mã lạ',
	);
	assert.equal(presentSignature('ok', 'không phải JSON')?.level, 'ok');
});

test('presentSignature (hồ sơ học viên): chỉ báo trang có dấu / chữ ký số', () => {
	const r = combine('trainee_document', digital('valid'), [
		page(1, { seal: false }),
		page(4, { seal: true, hand: true }),
	]);
	const p = presentSignature(r.sig_verdict, r.sig_details, { trainee: true });
	assert.equal(p?.level, 'info');
	assert.equal(
		p?.message,
		'Có 1 chữ ký số hợp lệ (NGUYỄN VĂN AN – Bệnh viện Hữu nghị Đa khoa Nghệ An); dấu đỏ ở trang 4; chữ ký tay ở trang 4.',
	);
	const none = combine('trainee_document', null, [page(1, { seal: false })]);
	assert.match(
		presentSignature(none.sig_verdict, none.sig_details, { trainee: true })?.message ?? '',
		/Không thấy chữ ký số hay dấu đỏ/,
	);
	const bad = combine('trainee_document', digital('invalid'), []);
	assert.equal(
		presentSignature(bad.sig_verdict, bad.sig_details, { trainee: true })?.level,
		'warn',
	);
});
