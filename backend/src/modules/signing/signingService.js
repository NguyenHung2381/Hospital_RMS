/**
 * signingService.js — ký tài liệu qua VIN-HSM cho các module nghiệp vụ, mỗi lần ký ghi 1 dòng
 * signing_logs (thành công lẫn lỗi, chỉ lưu SHA-256 trước/sau, không lưu nội dung).
 *
 * Chọn chứng thư:
 *  - giấy chứng nhận CME: tài khoản TỔ CHỨC được đánh dấu "dùng ký giấy chứng nhận"
 *    (quyền signing:sign_org mới được dùng — kiểm ở route);
 *  - văn bản đào tạo, phiếu phê duyệt đề tài: tài khoản CÁ NHÂN của chính người thao tác.
 *    Không có đường nào ký bằng chứng thư cá nhân của người khác.
 */
const crypto = require('crypto');
const { httpError } = require('../../utils/httpError');
const logger = require('../../config/logger');
// Gọi qua `repo.xxx` / `client.xxx` / `accounts.xxx` để test thay được từng hàm.
const repo = require('./signingRepository');
const client = require('./vinHsmClient');
const accounts = require('./signingAccountService');
const signingPdf = require('./signingPdf');
const signatureImage = require('./signatureImage');
const providers = require('./providers');
const config = require('./signingConfig');

const DOC_TYPES = Object.freeze([
	'seminar_certificate',
	'practice_document',
	'registration_document',
	'topic_approval',
	'user_document',
	'sign_request',
	'test',
]);

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Gọi `fn(cred)` rồi ghi nhật ký. Lỗi VIN-HSM → httpError 502 (thông báo tiếng Việt).
 * @template T
 * @param {{ id: number, provider?: string, apiKey: string, secret: string, region: string, certSerial: string|null }} cred
 * @param {{ docType: string, docRef?: string|null, actorId?: string|null }} meta
 * @param {string} endpoint
 * @param {Buffer|null} input
 * @param {(cred: any) => Promise<T>} fn
 * @returns {Promise<T>}
 */
const callLogged = async (cred, meta, endpoint, input, fn) => {
	// Tắt ở Cấu hình ký số ⇒ dừng trước khi gọi nhà cung cấp (không ghi nhật ký: chưa ký gì)
	await config.assertCall(meta.docType, cred.provider);
	const started = Date.now();
	const base = {
		accountId: cred.id,
		actorId: meta.actorId ?? null,
		docType: meta.docType,
		docRef: meta.docRef ?? null,
		endpoint,
		inputSha256: input ? sha256(input) : null,
		certSerial: cred.certSerial ?? null,
	};
	const log = (entry) =>
		repo.insertLog({ ...base, durationMs: Date.now() - started, ...entry }).catch((err) =>
			// Không ghi được nhật ký thì không chặn kết quả ký — nhưng phải để lại dấu vết
			logger.error(`[signing] không ghi được signing_logs: ${err.message}`),
		);
	try {
		const out = await fn(cred);
		await log({
			status: 'ok',
			outputSha256: Buffer.isBuffer(out) ? sha256(out) : null,
			errorCode: null,
			errorMessage: null,
		});
		return out;
	} catch (err) {
		const isHsm = err instanceof client.VinHsmError;
		await log({
			status: 'error',
			outputSha256: null,
			errorCode: isHsm && Number.isFinite(Number(err.code)) ? Number(err.code) : null,
			errorMessage: isHsm ? `${err.message}${err.detail ? ` (${err.detail})` : ''}` : err.message,
		});
		if (isHsm) {
			logger.warn(
				`[signing] ${endpoint} lỗi: ${err.message} [${err.code ?? '-'}] ${err.detail ?? ''}`,
			);
			throw httpError(502, `Ký số không thành công: ${err.message}`);
		}
		throw err;
	}
};

// ─── Chọn tài khoản ──────────────────────────────────────────────────────

const certificateCredential = async () => {
	const acc = await repo.findCertificateDefault();
	if (!acc) {
		throw httpError(
			409,
			'Chưa cấu hình chứng thư bệnh viện để ký giấy chứng nhận (Quản trị → Ký số → đánh dấu "Dùng ký giấy chứng nhận").',
		);
	}
	if (!acc.is_active) throw httpError(409, 'Tài khoản ký giấy chứng nhận đang tạm ngưng.');
	return accounts.credentialOf(acc.id);
};

/** @param {string} userId */
const personalCredential = async (userId) => {
	const acc = await repo.findPersonalByUser(userId);
	if (!acc) {
		throw httpError(409, 'Bạn chưa khai báo tài khoản ký số cá nhân (Hồ sơ của tôi → Chữ ký số).');
	}
	if (!acc.is_active) throw httpError(409, 'Tài khoản ký số cá nhân của bạn đang tạm ngưng.');
	return accounts.credentialOf(acc.id);
};

/**
 * Ký song song có giới hạn, giữ thứ tự kết quả.
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, i: number) => Promise<R>} fn
 * @returns {Promise<R[]>}
 */
const mapLimit = async (items, limit, fn) => {
	const out = new Array(items.length);
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const i = next++;
			out[i] = await fn(items[i], i);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return out;
};

// Chữ "Ký bởi / Ký ngày" VIN-HSM in khi không có ảnh: màu chữ tối của hệ thống (mặc định xanh lá)
const SIGN_TEXT_COLOR = '1A2A35';

/**
 * Cách hiện khung chữ ký:
 *  - có ảnh chữ ký tay ⇒ VIN-HSM kiểu "chỉ ảnh"; ảnh do hệ thống dựng: chữ ký đúng tỉ lệ khung,
 *    kèm chức vụ bên dưới nếu chủ tài khoản bật (VIN-HSM chỉ in chữ ở mép trên khung, kèm
 *    "Ký bởi:" — không đặt được xuống dưới);
 *  - không có ảnh ⇒ chữ của VIN-HSM: "Ký bởi: <text>" + "Ký ngày: ...", `text` là tên người ký.
 * @param {{ signatureImage?: string|null, signatureShowText?: boolean, signatureCaption?: string|null }} cred
 * @param {{ width?: number, height?: number }} box  khung chữ ký (pt)
 */
const displayOf = async (cred, box) => {
	if (!cred.signatureImage) {
		return { type: client.PDF_SIGNATURE_TYPE.TEXT, fontColor: SIGN_TEXT_COLOR };
	}
	return {
		type: client.PDF_SIGNATURE_TYPE.IMAGE,
		imageBase64: await signatureImage.fitSignatureImage(cred.signatureImage, {
			width: box.width ?? 180,
			height: box.height ?? 60,
			caption: cred.signatureShowText ? cred.signatureCaption : null,
		}),
	};
};

// ─── Ký cho các luồng nghiệp vụ ─────────────────────────────────────────

/**
 * Bộ ký giấy chứng nhận bằng chứng thư bệnh viện. Lấy tài khoản 1 lần (lỗi cấu hình báo
 * ngay, trước khi xuất file nào), trả hàm ký từng file. Chữ ký ẩn: mẫu giấy đã có con dấu
 * / chữ ký in sẵn, chữ ký số chỉ cần nằm trong file (xem ở bảng chữ ký của trình đọc PDF).
 * Hàm ký nhận thêm `ref` (vd số giấy) ghi vào nhật ký thay cho meta.docRef.
 * @param {{ docType: string, docRef?: string|null, actorId: string }} meta
 * @returns {Promise<(pdf: Buffer, ref?: string) => Promise<Buffer>>}
 */
const certificateSigner = async (meta) => {
	const cred = await certificateCredential();
	return (pdf, ref) =>
		callLogged(cred, { ...meta, docRef: ref ?? meta.docRef }, 'pdf/sign/originaldata', pdf, (c) =>
			providers
				.driverOf(c.provider)
				.signPdf(c, pdf, { type: client.PDF_SIGNATURE_TYPE.HIDDEN, page: 1 }),
		);
};

/**
 * Ký PDF bằng chứng thư cá nhân của `userId`, khung chữ ký đặt theo tọa độ (pt, gốc dưới-trái).
 * @param {string} userId
 * @param {Buffer} pdf
 * @param {{ docType: string, docRef?: string|null, page?: number, x?: number, y?: number,
 *   width?: number, height?: number, text?: string }} opt
 */
const signPdfAsUser = async (userId, pdf, opt) => {
	const cred = await personalCredential(userId);
	return callLogged(
		cred,
		{ docType: opt.docType, docRef: opt.docRef, actorId: userId },
		'pdf/sign/originaldata',
		pdf,
		async (c) =>
			providers.driverOf(c.provider).signPdf(c, pdf, {
				...(await displayOf(c, opt)),
				page: opt.page ?? 1,
				x: opt.x,
				y: opt.y,
				width: opt.width,
				height: opt.height,
				text: opt.text,
			}),
	);
};

/**
 * Ký file Word/Excel (OpenXML) bằng chứng thư cá nhân của `userId`.
 * @param {string} userId
 * @param {Buffer} file
 * @param {{ docType: string, docRef?: string|null, role?: string, comment?: string }} opt
 */
const signOfficeAsUser = async (userId, file, opt) => {
	const cred = await personalCredential(userId);
	return callLogged(
		cred,
		{ docType: opt.docType, docRef: opt.docRef, actorId: userId },
		'office/sign/originaldata',
		file,
		(c) =>
			providers.driverOf(c.provider).signOffice(c, file, {
				role: opt.role,
				comment: opt.comment,
				imageBase64: c.signatureImage ?? undefined,
			}),
	);
};

/** Cờ "ký số" từ client: true (JSON) / "true" / "1" (query, form). @param {unknown} v */
const wantsSign = (v) => v === true || v === 'true' || v === '1';

// "Don dang ky.docx" → "Don dang ky (ky so).docx"
const signedName = (name) => {
	const s = String(name || 'tai-lieu.docx');
	const dot = s.lastIndexOf('.');
	return dot > 0 ? `${s.slice(0, dot)} (ky so)${s.slice(dot)}` : `${s} (ky so)`;
};

/**
 * File Word vừa dựng để tải về → bản đã ký bằng chứng thư cá nhân của người tải.
 * Giữ nguyên các trường khác của `out` (mime...), đổi buffer và tên file (fileName / filename).
 * @template {{ buffer: Buffer|Uint8Array|ArrayBuffer, fileName?: string, filename?: string }} T
 * @param {{ id: string }} user
 * @param {T} out
 * @param {{ docType: string, docRef?: string|null }} meta
 * @returns {Promise<T>}
 */
const signDocxDownload = async (user, out, meta) => {
	const src = Buffer.isBuffer(out.buffer)
		? out.buffer
		: Buffer.from(/** @type {any} */ (out.buffer));
	const buffer = await signOfficeAsUser(user.id, src, meta);
	const named = {};
	if (out.fileName !== undefined) named.fileName = signedName(out.fileName);
	if (out.filename !== undefined) named.filename = signedName(out.filename);
	return { ...out, buffer, ...named };
};

/**
 * Ký thử 1 phiếu mẫu bằng tài khoản `accountId` — kiểm tra cấu hình trước khi dùng thật.
 * Trả PDF đã ký để mở bằng trình đọc PDF xem chữ ký.
 * @param {number} accountId
 * @param {{ id: string, full_name?: string }} actor
 */
const testSign = async (accountId, actor) => {
	const cred = await accounts.credentialOf(accountId, { allowInactive: true });
	const now = new Date();
	const { pdf, box } = await signingPdf.renderSheet({
		title: 'Phiếu ký thử chữ ký số',
		subtitle: 'Tài liệu kiểm tra cấu hình VIN-HSM — không có giá trị sử dụng',
		fields: [
			['Người thực hiện', actor.full_name || actor.id],
			['Thời điểm', signingPdf.stampVN(now)],
			['Tài khoản ký', `#${accountId} — vùng ${cred.region}`],
		],
		signRole: 'Người ký',
		signName: cred.signatureDisplayName || actor.full_name || actor.id,
		placeDate: signingPdf.placeDateVN(now),
	});
	return callLogged(
		cred,
		{ docType: 'test', docRef: String(accountId), actorId: actor.id },
		'pdf/sign/originaldata',
		pdf,
		async (c) =>
			providers.driverOf(c.provider).signPdf(c, pdf, {
				...(await displayOf(c, box)),
				...box,
				text: cred.signatureDisplayName || actor.full_name || actor.id,
			}),
	);
};

// PDF người dùng tự tải lên để ký: gửi VIN-HSM dạng base64 trong JSON — giới hạn vừa phải
const USER_PDF_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Ký 1 file PDF người dùng tải lên, khung chữ ký đặt đúng chỗ họ chọn (pt, gốc dưới-trái của
 * trang, đã quy đổi ở giao diện). Ký bằng chứng thư CÁ NHÂN của chính người đó, hiện chữ ký tay
 * + chức vụ nếu đã khai báo.
 * @param {{ id: string, full_name?: string }} user
 * @param {Buffer} pdf
 * @param {{ fileName: string, page: number, x: number, y: number, width: number, height: number }} opt
 */
const signUserPdf = async (user, pdf, opt) => {
	if (!pdf?.length || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
		throw httpError(400, 'File không phải PDF hợp lệ.');
	}
	if (pdf.length > USER_PDF_MAX_BYTES) {
		throw httpError(400, 'File PDF quá lớn để ký số (tối đa 20 MB).');
	}
	const name = await signerNameOf(user.id, user.full_name || user.id);
	return signPdfAsUser(user.id, pdf, {
		docType: 'user_document',
		docRef: String(opt.fileName || 'tai-lieu.pdf').slice(0, 60),
		page: opt.page,
		x: opt.x,
		y: opt.y,
		width: opt.width,
		height: opt.height,
		text: name,
	});
};

/**
 * Họ tên in dưới khung chữ ký của `userId`: họ tên hiển thị khai ở Chữ ký số, không có thì `fallback`.
 * @param {string} userId
 * @param {string} fallback
 */
const signerNameOf = async (userId, fallback) => {
	const acc = await repo.findPersonalByUser(userId);
	return acc?.signature_display_name?.trim() || fallback;
};

/**
 * Trạng thái ký số của người đang đăng nhập — giao diện dùng để bật/tắt nút "ký số".
 * @param {string} userId
 */
const myStatus = async (userId) => {
	const [mine, org] = await Promise.all([
		repo.findPersonalByUser(userId),
		repo.findCertificateDefault(),
	]);
	const brief = (a) =>
		a
			? {
					label: a.label,
					active: !!a.is_active,
					cert_subject: a.cert_subject,
					cert_valid_to: a.cert_valid_to,
					last_error: a.last_error,
				}
			: null;
	return { personal: brief(mine), certificate: brief(org), config: await config.publicConfig() };
};

/**
 * @param {{ page?: any, limit?: any, status?: string, doc_type?: string, account_id?: any }} q
 * @param {{ offset: number, limit: number, page: number, fetchClause: string }} pg
 */
const listLogs = async (q, pg) => {
	const { rows, total } = await repo.listLogs({
		...pg,
		status: q.status === 'ok' || q.status === 'error' ? q.status : undefined,
		docType: DOC_TYPES.includes(String(q.doc_type)) ? String(q.doc_type) : undefined,
		accountId: Number(q.account_id) || undefined,
	});
	return { items: rows, total, page: pg.page, limit: pg.limit };
};

module.exports = {
	DOC_TYPES,
	mapLimit,
	certificateSigner,
	signPdfAsUser,
	signOfficeAsUser,
	wantsSign,
	signDocxDownload,
	testSign,
	signerNameOf,
	signUserPdf,
	myStatus,
	listLogs,
	// cho test
	callLogged,
	displayOf,
};
