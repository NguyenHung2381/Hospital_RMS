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

// ─── Cấu hình chi tiết (Cấu hình hệ thống TRAINING_DOC_SIGNATURE_RULES, JSON) ─────────────
// Bật/tắt theo từng loại giấy tờ × từng mục kiểm, cộng vài tuỳ chọn chung. Áp dụng 2 nơi:
//   - lúc kiểm (analyzer): mục tắt thì không chạy (đỡ CPU) — sig_details.ran ghi mục đã chạy;
//   - lúc hiển thị (presentSignature): kết luận tính lại từ sig_details theo cấu hình HIỆN TẠI,
//     nên đổi cấu hình có hiệu lực ngay, không cần kiểm lại file.
/** Loại giấy tờ có thể cấu hình (national_id không kiểm chữ ký). */
const CONFIG_KINDS = Object.freeze(
	/** @type {const} */ (['decision', 'proposal_approved', 'license', 'degree', 'trainee_document']),
);

/**
 * @typedef {{ enabled: boolean, digital: boolean, seal: boolean, hand: boolean,
 *   on_missing: 'warn' | 'info' }} KindSignatureConfig
 *   enabled    kiểm chữ ký loại này không
 *   digital    xác thực chữ ký số (PDF)
 *   seal       dò dấu đỏ
 *   hand       dò chữ ký tay
 *   on_missing thiếu dấu / chữ ký thì: 'warn' = khung cảnh báo, 'info' = chỉ ghi chú mờ
 * @typedef {{ warn_untrusted: boolean, org_match: boolean, reprint_warning: boolean, ocr: boolean }} SignatureOptions
 *   warn_untrusted  cảnh báo chữ ký số do CA ngoài danh sách tin cậy cấp (tắt = coi như không có chữ ký số)
 *   org_match       so tổ chức người ký với đơn vị công tác đã khai
 *   reprint_warning cảnh báo "có hình dấu nhưng không có chữ ký số" (bản in lại từ file ký số)
 *   ocr             dùng OCR tìm dòng chức danh người ký (tắt = chỉ dò mực xanh, nhanh hơn)
 * @typedef {{ kinds: Record<string, KindSignatureConfig>, options: SignatureOptions }} SignatureConfig
 */

/** @type {SignatureConfig} */
const DEFAULT_SIGNATURE_CONFIG = Object.freeze({
	kinds: Object.freeze(
		Object.fromEntries(
			CONFIG_KINDS.map((k) => [
				k,
				Object.freeze({ enabled: true, digital: true, seal: true, hand: true, on_missing: 'warn' }),
			]),
		),
	),
	options: Object.freeze({
		warn_untrusted: true,
		org_match: true,
		reprint_warning: true,
		ocr: true,
	}),
});

/**
 * Cấu hình đã lưu (chuỗi JSON hoặc object; rỗng / hỏng ⇒ mặc định) ⇒ cấu hình đầy đủ. Trường
 * thiếu hoặc sai kiểu lấy mặc định — không ném lỗi.
 * @param {unknown} raw
 * @returns {SignatureConfig}
 */
const normalizeSignatureConfig = (raw) => {
	let src = raw;
	if (typeof raw === 'string') {
		try {
			src = raw.trim() ? JSON.parse(raw) : null;
		} catch {
			src = null;
		}
	}
	const o = /** @type {any} */ (src && typeof src === 'object' ? src : {});
	const bool = (v, d) => (typeof v === 'boolean' ? v : d);
	const def = DEFAULT_SIGNATURE_CONFIG;
	return {
		kinds: Object.fromEntries(
			CONFIG_KINDS.map((k) => {
				const s = o.kinds?.[k] ?? {};
				const d = def.kinds[k];
				return [
					k,
					{
						enabled: bool(s.enabled, d.enabled),
						digital: bool(s.digital, d.digital),
						seal: bool(s.seal, d.seal),
						hand: bool(s.hand, d.hand),
						on_missing: s.on_missing === 'info' ? 'info' : 'warn',
					},
				];
			}),
		),
		options: /** @type {SignatureOptions} */ (
			Object.fromEntries(Object.entries(def.options).map(([k, d]) => [k, bool(o.options?.[k], d)]))
		),
	};
};

/**
 * Cấu hình của 1 loại; null = loại này không kiểm chữ ký (tắt, hoặc tắt hết các mục kiểm).
 * @param {SignatureConfig | null | undefined} config
 * @param {string} kind
 * @returns {KindSignatureConfig | null}
 */
const kindConfig = (config, kind) => {
	const kc = (config ?? DEFAULT_SIGNATURE_CONFIG).kinds?.[kind];
	if (!kc || !kc.enabled || !(kc.digital || kc.seal || kc.hand)) return null;
	return kc;
};

/** Loại có kiểm chữ ký (analyzer bỏ qua phần chữ ký với loại khác / loại bị tắt trong cấu hình). */
const needsSignatureCheck = (kind, config = null) => {
	const r = SIGNATURE_REQUIREMENTS[kind]?.rule;
	return !!r && r !== 'none' && !!kindConfig(config, kind);
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
	digital_missing: 'Không có chữ ký số hợp lệ.',
	marks_unclear:
		'Không kiểm được dấu / chữ ký tay tự động (bản đen trắng, ảnh mờ hoặc không đọc được chức danh).',
	config_changed:
		'Có mục kiểm vừa bật sau khi file được kiểm nên chưa có kết quả — bấm "Kiểm lại chữ ký" ở Cấu hình hệ thống.',
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
 * @returns {{ seal: 'present' | 'absent' | 'unknown', hand: 'present' | 'absent' | 'unknown' }}
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
 * @typedef {'present' | 'absent' | 'unknown' | 'off'} MarkState  off = mục kiểm đang tắt
 * @typedef {{
 *   verdict: SigVerdict, warnings: string[], marks: { seal: MarkState, hand: MarkState },
 *   needed: Array<'seal' | 'hand'>, digital_only: boolean, missing_only: boolean,
 *   on_missing: 'warn' | 'info',
 * }} SignatureEvaluation
 *   needed       dấu / chữ ký tay mà loại này cần (đã bỏ mục tắt)
 *   digital_only chỉ còn chữ ký số để kết luận (dấu + chữ ký tay đều tắt)
 *   missing_only kết luận xấu CHỈ vì thiếu (không có chữ ký số hỏng / CA lạ / sai tổ chức...)
 */

/**
 * Kết luận chữ ký từ dữ liệu đã tóm tắt (cột sig_details) theo cấu hình. Hàm thuần — gọi lúc kiểm
 * (combine) và gọi lại lúc hiển thị (presentSignature) với cấu hình hiện tại.
 * @param {Record<string, any>} d sig_details: kind, rule, digital, pages, text_layer?, ran?
 * @param {SignatureConfig | null} [config] null ⇒ mặc định (bật hết)
 * @returns {SignatureEvaluation | null} null = loại không kiểm / bị tắt trong cấu hình
 */
const evaluateDetails = (d, config = null) => {
	const cfg = config ?? DEFAULT_SIGNATURE_CONFIG;
	const kind = d?.kind;
	const rule = d?.rule ?? SIGNATURE_REQUIREMENTS[kind]?.rule ?? 'none';
	const kc = kindConfig(cfg, kind);
	if (rule === 'none' || !kc) return null;
	const opt = cfg.options;
	// Dòng cũ (trước khi có cấu hình) không có `ran` ⇒ coi như đã chạy đủ
	const ran = { digital: true, seal: true, hand: true, ...(d.ran ?? {}) };
	const pages = Array.isArray(d.pages) ? d.pages : [];
	const agg = aggregateMarks(pages);
	const digitalChecked = kc.digital && ran.digital;
	const dig = digitalChecked ? (d.digital ?? null) : null;
	/** @type {MarkState} */
	const seal = !kc.seal ? 'off' : ran.seal ? agg.seal : 'unknown';
	/** @type {MarkState} */
	const hand = !kc.hand ? 'off' : ran.hand ? agg.hand : 'unknown';
	const stale = (kc.digital && !ran.digital) || (kc.seal && !ran.seal) || (kc.hand && !ran.hand);

	/** @type {string[]} */
	const warnings = [];
	const warn = (code) => {
		if (!warnings.includes(code)) warnings.push(code);
	};

	// ─ Chữ ký số. Chỉ có dấu thời gian tài liệu (không ai ký) ⇒ coi như không có chữ ký số.
	const rawDv = !dig || (dig.verdict === 'valid' && !dig.signatures) ? 'none' : dig.verdict;
	// Tắt cảnh báo CA lạ ⇒ chữ ký đó không tính (không cảnh báo, cũng không thay được dấu + chữ ký)
	const dv = rawDv === 'untrusted' && !opt.warn_untrusted ? 'none' : rawDv;
	/** @type {SigVerdict} */
	let digitalVerdict = 'n/a'; // không có chữ ký số
	if (dv === 'valid') digitalVerdict = 'ok';
	else if (dv !== 'none') {
		digitalVerdict = 'warn';
		warn(`digital_${dv}`); // digital_invalid | digital_modified | digital_untrusted
		if (
			dv === 'untrusted' &&
			(dig?.chain === 'incomplete' || dig?.warnings?.includes('chain_incomplete'))
		)
			warn('chain_incomplete');
	}
	if (opt.org_match && dig?.org_match === false && dv !== 'none') {
		warn('signer_org_mismatch');
		digitalVerdict = worst(digitalVerdict, 'warn');
	}

	// ─ Dấu / chữ ký tay
	// Dòng cũ chưa lưu text_layer: cảnh báo bản in lại chỉ từng bật khi có lớp chữ
	const textLayer =
		d.text_layer ?? (Array.isArray(d.warnings) && d.warnings.includes('seal_image_no_digital'));
	// PDF xuất từ máy (có lớp chữ), có hình dấu mà không chữ ký số ⇒ có thể là bản in lại
	if (opt.reprint_warning && dig && rawDv === 'none' && textLayer && seal === 'present')
		warn('seal_image_no_digital');

	const state = (m) => (m === 'seal' ? seal : hand);
	/** @type {Array<'seal' | 'hand'>} */
	let needed = /** @type {Array<'seal' | 'hand'>} */ (
		rule === 'report_only' ? [] : rule === 'hand_signature' ? ['hand'] : ['seal', 'hand']
	).filter((m) => state(m) !== 'off');
	// Loại chỉ cần chữ ký tay mà tắt chữ ký tay, còn bật dấu ⇒ kết luận theo dấu
	if (rule === 'hand_signature' && hand === 'off' && seal !== 'off') needed = ['seal'];
	const digitalOnly = rule !== 'report_only' && seal === 'off' && hand === 'off';

	/** @type {SigVerdict} */
	let verdict;
	let missingOnly = false;
	if (rule === 'report_only') {
		// Hồ sơ học viên: chỉ báo, không kết luận thiếu
		const anything = dv === 'valid' || seal === 'present' || hand === 'present';
		verdict = digitalVerdict === 'warn' ? 'warn' : anything ? 'ok' : 'unclear';
		const i = warnings.indexOf('seal_image_no_digital');
		if (i >= 0) warnings.splice(i, 1);
	} else if (digitalVerdict === 'ok') {
		verdict = 'ok'; // chữ ký số hợp lệ đáp ứng mọi yêu cầu
	} else if (!needed.length) {
		// Chỉ còn chữ ký số để kết luận (dấu / chữ ký tay đều tắt, hoặc loại chỉ cần chữ ký tay mà tắt)
		if (digitalVerdict === 'warn') verdict = 'warn';
		else if (digitalChecked && digitalOnly) {
			verdict = 'missing';
			missingOnly = true;
			warn('digital_missing');
		} else verdict = 'unclear';
	} else {
		const all = needed.every((m) => state(m) === 'present');
		const absent = needed.some((m) => state(m) === 'absent');
		/** @type {SigVerdict} */
		let byMarks = all ? 'ok' : absent ? 'missing' : 'unclear';
		if (needed.includes('seal') && seal === 'absent') warn('seal_missing');
		if (needed.includes('hand') && hand === 'absent') warn('hand_signature_missing');
		if (rule === 'digital_or_marks' && absent && digitalVerdict === 'n/a' && kc.digital)
			warn('signature_missing');
		if (rule === 'marks_soft' && byMarks === 'missing') byMarks = 'warn';
		missingOnly = absent && digitalVerdict !== 'warn';
		verdict = digitalVerdict === 'warn' ? worst('warn', byMarks) : byMarks;
		if (verdict === 'ok' && warnings.includes('seal_image_no_digital')) verdict = 'warn';
	}
	const marksUnclear =
		(rule === 'report_only' || needed.length > 0) &&
		(!pages.length ||
			((seal === 'unknown' || seal === 'off') && (hand === 'unknown' || hand === 'off')));
	if (verdict === 'unclear' && marksUnclear && (seal !== 'off' || hand !== 'off'))
		warn('marks_unclear');
	if (verdict === 'ok' && warnings.includes('signer_org_mismatch')) verdict = 'warn';
	if (
		warnings.some(
			(w) =>
				w !== 'seal_missing' &&
				w !== 'hand_signature_missing' &&
				w !== 'signature_missing' &&
				w !== 'digital_missing' &&
				w !== 'marks_unclear',
		)
	)
		missingOnly = false;
	if (stale) warn('config_changed');

	return {
		verdict,
		warnings,
		marks: { seal, hand },
		needed,
		digital_only: digitalOnly,
		missing_only: missingOnly,
		on_missing: kc.on_missing,
	};
};

/**
 * @param {string} kind loại giấy tờ (khóa của SIGNATURE_REQUIREMENTS)
 * @param {import('./pdfSignature').PdfSignatureResult | null} digital null = không phải PDF / không kiểm
 * @param {VisualPage[]} visualPages các trang đã dò dấu (thường trang đầu + trang cuối)
 * @param {{ unit?: string | null, textLayer?: boolean, pageCount?: number | null,
 *   ran?: { digital: boolean, seal: boolean, hand: boolean } }} [opts]
 *   unit = đơn vị công tác đã khai (so mờ với tổ chức người ký); textLayer = PDF có lớp chữ
 *   (file xuất từ máy, không phải bản scan); pageCount = số trang của file; ran = mục đã chạy
 *   (mặc định: đủ cả 3)
 * @param {SignatureConfig | null} [config] null ⇒ mặc định (bật hết)
 * @returns {{ sig_verdict: SigVerdict, sig_details: Record<string, any> }}
 */
const combine = (kind, digital, visualPages = [], opts = {}, config = null) => {
	const rule = SIGNATURE_REQUIREMENTS[kind]?.rule ?? 'none';
	if (rule === 'none') return { sig_verdict: 'n/a', sig_details: { kind, rule, warnings: [] } };
	const details = {
		kind,
		rule,
		digital: summarizeDigital(digital, opts.unit),
		pages: visualPages.map(summarizePage),
		page_count: opts.pageCount ?? null,
		text_layer: !!opts.textLayer,
		ran: opts.ran ?? { digital: true, seal: true, hand: true },
	};
	const ev = evaluateDetails(details, config);
	if (!ev) return { sig_verdict: 'n/a', sig_details: { kind, rule, warnings: [] } };
	return {
		sig_verdict: ev.verdict,
		sig_details: { ...details, marks: ev.marks, warnings: ev.warnings },
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

const MARK_LABEL = { seal: 'dấu đỏ', hand: 'chữ ký tay' };

/**
 * Khối `signature` gửi FE (gắn trong `check` của từng file). null = chưa kiểm chữ ký / loại
 * giấy tờ không kiểm / bị tắt trong cấu hình. Kết luận tính lại từ sig_details theo `config`
 * (cấu hình hiện tại) — cột sig_verdict chỉ dùng khi sig_details không đủ để tính lại.
 * @param {string | null | undefined} verdict cột sig_verdict
 * @param {string | Record<string, any> | null | undefined} detailsJson cột sig_details
 * @param {{ trainee?: boolean, config?: SignatureConfig | null }} [opts] trainee = hồ sơ học viên
 *   (chỉ báo, không kết luận thiếu); config = cấu hình TRAINING_DOC_SIGNATURE_RULES (null ⇒ mặc định)
 * @returns {SignaturePresentation | null}
 */
const presentSignature = (verdict, detailsJson, { trainee = false, config = null } = {}) => {
	if (!verdict || verdict === 'n/a') return null;
	const d = parseJson(detailsJson) ?? {};
	const ev = d.kind ? evaluateDetails(d, config) : null;
	if (d.kind && !ev) return null; // loại này đang tắt trong cấu hình
	const v = /** @type {SigVerdict} */ (ev?.verdict ?? verdict);
	const warnings = (ev ? ev.warnings : Array.isArray(d.warnings) ? d.warnings : [])
		.filter((c) => SIG_WARNING_MESSAGES[c])
		.map((c) => ({ code: c, message: SIG_WARNING_MESSAGES[c] }));
	const kc = d.kind ? kindConfig(config, d.kind) : null;
	const ran = { digital: true, seal: true, hand: true, ...(d.ran ?? {}) };
	const dig = !kc || (kc.digital && ran.digital) ? (d.digital ?? null) : null;
	const pages = (Array.isArray(d.pages) ? d.pages : []).map((p) => ({
		...p,
		seal: kc && !kc.seal ? null : p.seal,
		hand_signature: kc && !kc.hand ? null : p.hand_signature,
	}));
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
	const markState = ev?.marks ?? d.marks ?? {};
	const seal = TRI[markState.seal] ?? null;
	const hand = TRI[markState.hand] ?? null;

	/** @type {'ok' | 'warn' | 'info'} */
	let level = v === 'ok' ? 'ok' : v === 'unclear' ? 'info' : 'warn';
	// Cấu hình "thiếu thì chỉ ghi chú": chỉ hạ mức khi xấu CHỈ vì thiếu (chữ ký số hỏng vẫn cảnh báo)
	if (level === 'warn' && ev?.missing_only && ev.on_missing === 'info') level = 'info';
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
		// Thứ tự: loại cần chữ ký tay ⇒ chữ ký tay trước
		const order = d.rule === 'hand_signature' ? ['hand', 'seal'] : ['seal', 'hand'];
		const have = order.filter((m) => (m === 'seal' ? seal : hand) === true);
		if (dig?.verdict === 'valid' && dig.signatures)
			message = `Có chữ ký số hợp lệ${who ? ` của ${who}` : ''}.`;
		else
			message = have.length
				? `Có ${have.map((m) => MARK_LABEL[m]).join(' và ')}.`
				: 'Đạt yêu cầu chữ ký.';
	} else if (v === 'missing') {
		const needed = ev?.needed ?? (d.rule === 'hand_signature' ? ['hand'] : ['seal', 'hand']);
		const labels = needed.map((m) => MARK_LABEL[m]);
		if (ev?.digital_only) message = 'Thiếu chữ ký số hợp lệ.';
		else if (d.rule === 'digital_or_marks' && (!kc || kc.digital))
			message = `Thiếu chữ ký số hợp lệ hoặc ${labels.join(' + ')}.`;
		else message = `Thiếu ${labels.join(' hoặc ')}.`;
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
	CONFIG_KINDS,
	DEFAULT_SIGNATURE_CONFIG,
	normalizeSignatureConfig,
	kindConfig,
	needsSignatureCheck,
	evaluateDetails,
	combine,
	presentSignature,
};
