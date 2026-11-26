// Luật thuần: gộp kết quả chữ ký số (pdfSignature.verifyPdfSignatures) và dấu đỏ / chữ ký tay theo
// trang (visualMarks.detectMarks) thành 1 kết luận cho từng loại giấy tờ. Không đọc file, không
// gọi CSDL. Chỉ để CẢNH BÁO người duyệt — không tự từ chối hồ sơ.
//
//   combine(kind, digital, visualPages, opts) → { sig_verdict, sig_details }
//     sig_verdict  ok | warn | missing | unclear | n/a (cột registration_file_checks.sig_verdict)
//     sig_details  JSON lưu ở cột sig_details — KHÔNG có chữ OCR, chỉ tên / tổ chức trong chứng thư.
const { matchSignerOrganization } = require('./pdfSignature');

/**
 * @typedef {'ok' | 'warn' | 'missing' | 'unclear' | 'n/a'} SigVerdict
 *   ok       đủ yêu cầu của loại giấy tờ
 *   warn     có chữ ký nhưng có điểm cần người duyệt xem (chữ ký số hỏng / sửa sau ký / CA lạ,
 *            tổ chức người ký khác đơn vị đã khai, có hình dấu mà không có chữ ký số...)
 *   missing  thấy rõ là thiếu (vd thấy chức danh người ký mà vùng ký trống, bản màu không có dấu)
 *   unclear  không kết luận được (bản đen trắng, không OCR, ảnh mờ)
 *   n/a      loại giấy tờ không kiểm chữ ký
 */

/**
 * Yêu cầu chữ ký theo loại giấy tờ (kind của course_registration_files; 'trainee_document' = hồ sơ
 * học viên tự nộp ở /me/trainee-documents).
 *   rule     digital_or_marks — chữ ký số hợp lệ, HOẶC dấu đỏ + chữ ký tay
 *            hand_signature   — chữ ký tay (chữ ký số hợp lệ cũng được); dấu chỉ báo nếu có
 *            marks_soft       — dấu + chữ ký, thiếu chỉ cảnh báo nhẹ (warn, không 'missing')
 *            report_only      — chỉ báo có chữ ký số / dấu ở trang nào, không kết luận thiếu
 *            none             — không kiểm
 *   expect   truyền cho detectMarks (chỉ ảnh hưởng verdict từng trang)
 */
const SIGNATURE_REQUIREMENTS = Object.freeze({
	decision: { rule: 'digital_or_marks', expect: { seal: true, signature: true } },
	proposal_approved: { rule: 'hand_signature', expect: { seal: false, signature: true } },
	license: { rule: 'marks_soft', expect: { seal: true, signature: true } },
	degree: { rule: 'marks_soft', expect: { seal: true, signature: true } },
	national_id: { rule: 'none', expect: null },
	trainee_document: { rule: 'report_only', expect: { seal: true, signature: true } },
});

/** Loại có kiểm chữ ký (analyzer bỏ qua phần chữ ký với loại khác). */
const needsSignatureCheck = (kind) => {
	const r = SIGNATURE_REQUIREMENTS[kind]?.rule;
	return !!r && r !== 'none';
};

/** Lời nhắn cho người duyệt theo mã cảnh báo (sig_details.warnings). */
const SIG_WARNING_MESSAGES = Object.freeze({
	digital_invalid:
		'Chữ ký số KHÔNG hợp lệ: nội dung bị sửa sau khi ký, chữ ký hỏng, hoặc chứng thư đã hết hạn / bị thu hồi lúc ký.',
	digital_modified:
		'File có thêm nội dung sau khi ký số — phần thêm vào không được chữ ký bảo đảm.',
	digital_untrusted:
		'Chữ ký số còn nguyên vẹn nhưng không xác minh được đơn vị cấp chứng thư (không thuộc danh sách CA tin cậy).',
	chain_incomplete:
		'File thiếu chứng thư CA trung gian nên chưa nối được tới CA gốc — có thể cần bổ sung CA trung gian vào bộ tin cậy của hệ thống.',
	signer_org_mismatch:
		'Tổ chức trong chứng thư người ký không khớp đơn vị công tác đã khai trong đơn.',
	seal_image_no_digital:
		'Có hình dấu nhưng file không có chữ ký số — có thể là bản in / xuất lại từ văn bản ký số. Nên yêu cầu nộp file gốc có chữ ký số.',
	seal_missing: 'Không thấy dấu đỏ ở trang đầu / trang cuối.',
	hand_signature_missing: 'Thấy chức danh người ký nhưng vùng ký để trống.',
	signature_missing: 'Không thấy chữ ký số hợp lệ, cũng không thấy đủ dấu đỏ + chữ ký tay.',
	marks_unclear:
		'Không kiểm được dấu / chữ ký tay tự động (bản đen trắng, ảnh mờ hoặc không đọc được chức danh).',
});

// Ưu tiên khi gộp: kết luận "xấu" hơn thắng
const RANK = { 'n/a': 0, ok: 1, unclear: 2, warn: 3, missing: 4 };
/** @param {SigVerdict[]} vs */
const worst = (...vs) =>
	vs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), /** @type {SigVerdict} */ ('n/a'));

/**
 * Tóm tắt chữ ký số để lưu — chỉ chữ ký (không tính dấu thời gian tài liệu), lấy người ký của
 * chữ ký CUỐI (bản cuối cùng của văn bản).
 * @param {import('./pdfSignature').PdfSignatureResult | null | undefined} digital
 * @param {string | null | undefined} unit đơn vị công tác đã khai
 */
const summarizeDigital = (digital, unit) => {
	if (!digital) return null;
	const sigs = (digital.signatures ?? []).filter((s) => s.kind === 'signature');
	const last = sigs[sigs.length - 1] ?? null;
	const signer = last?.signer
		? {
				cn: last.signer.cn ?? null,
				o: last.signer.o ?? null,
				issuer_cn: last.signer.issuer_cn ?? null,
			}
		: null;
	return {
		verdict: digital.verdict,
		signatures: sigs.length,
		timestamps: (digital.signatures ?? []).length - sigs.length,
		signer,
		signed_at: last?.signed_at ?? null,
		time_source: last?.time_source ?? null,
		chain: last?.chain ?? null,
		org_match: signer && unit ? matchSignerOrganization(signer, unit) : null,
		warnings: [...(digital.warnings ?? [])],
	};
};

/**
 * @typedef {{ page: number, result: ReturnType<typeof import('./visualMarks').detectMarks> | null }} VisualPage
 *   page 1-based; result null = trang không dựng / dò được
 */

/** Tóm tắt 1 trang — không toạ độ, không chữ. */
const summarizePage = (/** @type {VisualPage} */ { page, result }) =>
	result
		? {
				page,
				verdict: result.verdict,
				color_available: result.color_available,
				seal: result.seal.found,
				seal_count: result.seal.count,
				hand_signature: result.hand_signature.found,
				hand_method: result.hand_signature.method,
			}
		: {
				page,
				verdict: 'unclear',
				color_available: null,
				seal: null,
				seal_count: 0,
				hand_signature: null,
				hand_method: null,
			};

/**
 * Gộp các trang đã dò: 'present' nếu trang nào cũng có; 'absent' nếu không trang nào có VÀ có
 * ít nhất 1 trang kết luận được là không có; còn lại 'unknown'.
 * @param {ReturnType<typeof summarizePage>[]} pages
 */
const aggregateMarks = (pages) => {
	const seal = pages.some((p) => p.seal === true)
		? 'present'
		: pages.some((p) => p.seal === false)
			? 'absent'
			: 'unknown';
	// Thiếu chữ ký tay chỉ khi đã thấy chức danh (OCR) mà vùng ký trống
	const hand = pages.some((p) => p.hand_signature === true)
		? 'present'
		: pages.some((p) => p.hand_method === 'ocr' && p.hand_signature === false)
			? 'absent'
			: 'unknown';
	return { seal, hand };
};

/**
 * @param {string} kind loại giấy tờ (khóa của SIGNATURE_REQUIREMENTS)
 * @param {import('./pdfSignature').PdfSignatureResult | null} digital null = không phải PDF / không kiểm
 * @param {VisualPage[]} visualPages các trang đã dò dấu (thường trang đầu + trang cuối)
 * @param {{ unit?: string | null, textLayer?: boolean, pageCount?: number | null }} [opts]
 *   unit = đơn vị công tác đã khai (so mờ với tổ chức người ký); textLayer = PDF có lớp chữ
 *   (file xuất từ máy, không phải bản scan); pageCount = số trang của file
 * @returns {{ sig_verdict: SigVerdict, sig_details: Record<string, any> }}
 */
const combine = (kind, digital, visualPages = [], opts = {}) => {
	const req = SIGNATURE_REQUIREMENTS[kind];
	const rule = req?.rule ?? 'none';
	if (rule === 'none') return { sig_verdict: 'n/a', sig_details: { kind, rule, warnings: [] } };

	const dig = summarizeDigital(digital, opts.unit);
	const pages = visualPages.map(summarizePage);
	const marks = aggregateMarks(pages);
	/** @type {string[]} */
	const warnings = [];
	const warn = (code) => {
		if (!warnings.includes(code)) warnings.push(code);
	};

	// ─ Chữ ký số
	// Chỉ có dấu thời gian tài liệu (không ai ký) ⇒ coi như không có chữ ký số
	const dv = !dig || (dig.verdict === 'valid' && !dig.signatures) ? 'none' : dig.verdict;
	/** @type {SigVerdict} */
	let digitalVerdict = 'n/a'; // không có chữ ký số
	if (dv === 'valid') digitalVerdict = 'ok';
	else if (dv !== 'none') {
		digitalVerdict = 'warn';
		warn(`digital_${dv}`); // digital_invalid | digital_modified | digital_untrusted
		if (
			dv === 'untrusted' &&
			(dig?.chain === 'incomplete' || dig?.warnings.includes('chain_incomplete'))
		)
			warn('chain_incomplete');
	}
	if (dig?.org_match === false && dv !== 'none') {
		warn('signer_org_mismatch');
		digitalVerdict = worst(digitalVerdict, 'warn');
	}

	// ─ Dấu / chữ ký tay
	const marksUnclear = !pages.length || (marks.seal === 'unknown' && marks.hand === 'unknown');
	// PDF xuất từ máy (có lớp chữ), có hình dấu mà không chữ ký số ⇒ có thể là bản in lại
	if (digital && dv === 'none' && opts.textLayer && marks.seal === 'present')
		warn('seal_image_no_digital');

	/** @type {SigVerdict} */
	let verdict;
	if (rule === 'report_only') {
		// Hồ sơ học viên: chỉ báo, không kết luận thiếu
		const anything = dv === 'valid' || marks.seal === 'present' || marks.hand === 'present';
		verdict = digitalVerdict === 'warn' ? 'warn' : anything ? 'ok' : 'unclear';
		const i = warnings.indexOf('seal_image_no_digital');
		if (i >= 0) warnings.splice(i, 1);
	} else if (digitalVerdict === 'ok') {
		verdict = 'ok'; // chữ ký số hợp lệ đáp ứng mọi yêu cầu
	} else {
		/** @type {SigVerdict} */
		let byMarks;
		if (rule === 'hand_signature') {
			byMarks = marks.hand === 'present' ? 'ok' : marks.hand === 'absent' ? 'missing' : 'unclear';
			if (marks.hand === 'absent') warn('hand_signature_missing');
		} else {
			// digital_or_marks / marks_soft: cần cả dấu và chữ ký tay
			const both = marks.seal === 'present' && marks.hand === 'present';
			const absent = marks.seal === 'absent' || marks.hand === 'absent';
			byMarks = both ? 'ok' : absent ? 'missing' : 'unclear';
			if (marks.seal === 'absent') warn('seal_missing');
			if (marks.hand === 'absent') warn('hand_signature_missing');
			if (rule === 'digital_or_marks' && absent && digitalVerdict === 'n/a')
				warn('signature_missing');
			if (rule === 'marks_soft' && byMarks === 'missing') byMarks = 'warn';
		}
		verdict = digitalVerdict === 'warn' ? worst('warn', byMarks) : byMarks;
		if (verdict === 'ok' && warnings.includes('seal_image_no_digital')) verdict = 'warn';
	}
	if (verdict === 'unclear' && marksUnclear) warn('marks_unclear');
	if (verdict === 'ok' && warnings.includes('signer_org_mismatch')) verdict = 'warn';

	return {
		sig_verdict: verdict,
		sig_details: {
			kind,
			rule,
			digital: dig,
			pages,
			page_count: opts.pageCount ?? null,
			marks,
			warnings,
		},
	};
};

// ─── Dạng gửi FE ────────────────────────────────────────────────────────────────
const parseJson = (s) => {
	if (s == null || s === '') return null;
	if (typeof s === 'object') return s;
	try {
		return JSON.parse(s);
	} catch {
		return null;
	}
};

const TRI = { present: true, absent: false, unknown: null };
const pageList = (pages, key) => pages.filter((p) => p[key] === true).map((p) => p.page);

/**
 * @typedef {{
 *   level: 'ok' | 'warn' | 'info',
 *   message: string,
 *   verdict: SigVerdict,
 *   digital: 'valid' | 'invalid' | 'modified' | 'untrusted' | 'none' | null,
 *   signer?: { cn: string | null, o: string | null, issuer_cn: string | null,
 *     signed_at: string | null, time_source: 'tsa' | 'claimed' | null },
 *   marks: { seal: boolean | null, hand_signature: boolean | null,
 *     pages: Array<{ page: number, seal: boolean | null, hand_signature: boolean | null }> },
 *   warnings: Array<{ code: string, message: string }>,
 * }} SignaturePresentation
 */

/**
 * Khối `signature` gửi FE (gắn trong `check` của từng file). null = chưa kiểm chữ ký / loại
 * giấy tờ không kiểm.
 * @param {string | null | undefined} verdict cột sig_verdict
 * @param {string | Record<string, any> | null | undefined} detailsJson cột sig_details
 * @param {{ trainee?: boolean }} [opts] trainee = hồ sơ học viên (chỉ báo, không kết luận thiếu)
 * @returns {SignaturePresentation | null}
 */
const presentSignature = (verdict, detailsJson, { trainee = false } = {}) => {
	if (!verdict || verdict === 'n/a') return null;
	const v = /** @type {SigVerdict} */ (verdict);
	const d = parseJson(detailsJson) ?? {};
	const warnings = (Array.isArray(d.warnings) ? d.warnings : [])
		.filter((c) => SIG_WARNING_MESSAGES[c])
		.map((c) => ({ code: c, message: SIG_WARNING_MESSAGES[c] }));
	const dig = d.digital ?? null;
	const pages = Array.isArray(d.pages) ? d.pages : [];
	const hasSigner = !!(dig?.signatures && dig.signer);
	const signer = hasSigner
		? {
				cn: dig.signer.cn ?? null,
				o: dig.signer.o ?? null,
				issuer_cn: dig.signer.issuer_cn ?? null,
				signed_at: dig.signed_at ?? null,
				time_source: dig.time_source ?? null,
			}
		: undefined;
	const who = signer ? [signer.cn, signer.o].filter(Boolean).join(' – ') : '';
	const seal = TRI[d.marks?.seal] ?? null;
	const hand = TRI[d.marks?.hand] ?? null;

	/** @type {'ok' | 'warn' | 'info'} */
	let level = v === 'ok' ? 'ok' : v === 'unclear' ? 'info' : 'warn';
	let message;
	if (trainee) {
		// Chỉ báo: có gì ở đâu
		if (v !== 'warn') level = 'info';
		const parts = [];
		if (dig?.verdict === 'valid' && dig.signatures)
			parts.push(`Có ${dig.signatures} chữ ký số hợp lệ${who ? ` (${who})` : ''}`);
		else if (dig?.signatures) parts.push(`Có ${dig.signatures} chữ ký số cần kiểm tra lại`);
		const sealPages = pageList(pages, 'seal');
		const handPages = pageList(pages, 'hand_signature');
		if (sealPages.length) parts.push(`dấu đỏ ở trang ${sealPages.join(', ')}`);
		if (handPages.length) parts.push(`chữ ký tay ở trang ${handPages.join(', ')}`);
		message = parts.length
			? `${parts.join('; ')}.`.replace(/^./, (c) => c.toUpperCase())
			: 'Không thấy chữ ký số hay dấu đỏ ở trang đầu / trang cuối.';
	} else if (v === 'ok') {
		if (dig?.verdict === 'valid' && dig.signatures)
			message = `Có chữ ký số hợp lệ${who ? ` của ${who}` : ''}.`;
		else if (d.rule === 'hand_signature')
			message = seal ? 'Có chữ ký tay và dấu đỏ.' : 'Có chữ ký tay.';
		else message = 'Có dấu đỏ và chữ ký tay.';
	} else if (v === 'missing') {
		message =
			d.rule === 'hand_signature'
				? 'Thiếu chữ ký tay.'
				: d.rule === 'digital_or_marks'
					? 'Thiếu chữ ký số hợp lệ hoặc dấu đỏ + chữ ký tay.'
					: 'Thiếu dấu đỏ hoặc chữ ký tay.';
	} else if (v === 'warn') {
		message = warnings[0]?.message ?? 'Chữ ký cần người duyệt kiểm tra lại.';
	} else {
		message = 'Không kiểm được chữ ký / dấu tự động.';
	}

	return {
		level,
		message,
		verdict: v,
		digital: dig?.verdict ?? null,
		...(signer ? { signer } : {}),
		marks: {
			seal,
			hand_signature: hand,
			pages: pages.map((p) => ({
				page: p.page,
				seal: p.seal ?? null,
				hand_signature: p.hand_signature ?? null,
			})),
		},
		warnings,
	};
};

module.exports = {
	SIGNATURE_REQUIREMENTS,
	SIG_WARNING_MESSAGES,
	needsSignatureCheck,
	combine,
	presentSignature,
};
