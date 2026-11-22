// Bản ghi xác nhận điện tử của form đăng ký khóa đào tạo liên tục: người đăng ký tích 3 cam kết
// (nội quy, thông tin đúng sự thật, đồng ý xử lý dữ liệu cá nhân) rồi gõ lại họ tên để ký.
//
// Lưu ở course_registrations.consent_record: NGUYÊN VĂN nội quy + các câu cam kết đúng lúc ký,
// họ tên đã gõ, thời điểm (giờ máy chủ), IP, thiết bị, email đã xác minh. consent_hash =
// SHA-256 của chính chuỗi JSON đó — mã này cũng in trong thư xác nhận gửi người đăng ký, nên bản
// trong hộp thư của họ là bản đối chiếu độc lập: sửa bản ghi trong CSDL thì mã sẽ không khớp.
// (Không dùng HMAC theo JWT_SECRET: xoay secret sẽ làm mọi bản ghi cũ "không hợp lệ".)
//
// File thuần (không CSDL) để test và dùng chung.
const crypto = require('crypto');
const {
	RULES_VERSION,
	CLASS_RULES,
	CONSENT_VERSION,
	COMMITMENTS,
	SIGNATURE_NOTE,
} = require('./registrationConstants');
const { normalizeIp } = require('../../../utils/activityDescribe');

const MAX_UA = 300;

/** So họ tên ký với họ tên khai: bỏ khoảng trắng thừa, không phân biệt hoa thường, cùng dạng Unicode */
const normName = (s) =>
	String(s ?? '')
		.normalize('NFC')
		.trim()
		.replace(/\s+/g, ' ')
		.toLocaleLowerCase('vi');

const signatureMatches = (signature, fullName) =>
	!!normName(signature) && normName(signature) === normName(fullName);

/** Phần gửi FE (GET /public/course-registration/rules) — FE hiển thị đúng câu chữ máy chủ sẽ lưu */
const publicConsent = () => ({
	version: CONSENT_VERSION,
	commitments: { ...COMMITMENTS },
	signature_note: SIGNATURE_NOTE,
});

/** IP / thiết bị của lượt gửi (controller gọi) */
const clientOf = (req) => ({
	ip: normalizeIp(req?.ip),
	userAgent: req?.get?.('user-agent') ? String(req.get('user-agent')).slice(0, MAX_UA) : null,
});

/** Dữ liệu ký của 1 lượt gửi form: họ tên gõ để ký, họ tên khai, IP / thiết bị */
const consentInput = (data, client = null) => ({
	signatureName: String(data?.signature_name ?? '').trim(),
	fullName: String(data?.full_name ?? '').trim(),
	client,
});

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * @param {{ registrationCode: string, enrollmentId: string, source: string, fullName: string,
 *   signatureName: string, verifiedEmail?: string | null, client?: { ip?: string | null, userAgent?: string | null },
 *   signedAt?: Date }} input
 * @returns {{ json: string, hash: string, record: Record<string, unknown> }}
 */
const buildRecord = (input) => {
	const record = {
		format: 'dtlt-consent',
		consent_version: CONSENT_VERSION,
		registration_code: input.registrationCode,
		enrollment_id: input.enrollmentId,
		source: input.source,
		full_name: String(input.fullName ?? '').trim(),
		signature_name: String(input.signatureName ?? '').trim(),
		signed_at: (input.signedAt ?? new Date()).toISOString(),
		ip: input.client?.ip ?? null,
		user_agent: input.client?.userAgent ?? null,
		verified_email: input.verifiedEmail ?? null,
		rules_version: RULES_VERSION,
		rules: CLASS_RULES,
		commitments: [COMMITMENTS.rules, COMMITMENTS.declared, COMMITMENTS.data],
		signature_note: SIGNATURE_NOTE,
	};
	const json = JSON.stringify(record);
	return { json, hash: sha256(json), record };
};

/**
 * Bản ghi 1 lần người đăng ký tự sửa bản khai: các trường đổi (trước → sau), lý do, 2 cam kết
 * (đúng sự thật, đồng ý xử lý dữ liệu), họ tên ký, IP, thiết bị. prev_hash = mã của bản trước
 * (bản gốc hoặc lần sửa trước) ⇒ các lần sửa nối thành chuỗi, không chèn / bỏ được lần nào.
 * @param {{ registrationCode: string, enrollmentId: string, seq: number, source: string,
 *   fullName: string, signatureName: string, reason: string,
 *   changes: Array<{ key: string, before: unknown, after: unknown }>,
 *   verifiedEmail?: string | null, prevHash?: string | null,
 *   client?: { ip?: string | null, userAgent?: string | null }, signedAt?: Date }} input
 * @returns {{ json: string, hash: string, record: Record<string, unknown> }}
 */
const buildAmendmentRecord = (input) => {
	const record = {
		format: 'dtlt-amendment',
		consent_version: CONSENT_VERSION,
		registration_code: input.registrationCode,
		enrollment_id: input.enrollmentId,
		seq: input.seq,
		source: input.source,
		full_name: String(input.fullName ?? '').trim(),
		signature_name: String(input.signatureName ?? '').trim(),
		signed_at: (input.signedAt ?? new Date()).toISOString(),
		ip: input.client?.ip ?? null,
		user_agent: input.client?.userAgent ?? null,
		verified_email: input.verifiedEmail ?? null,
		reason: String(input.reason ?? '').trim(),
		changes: input.changes,
		commitments: [COMMITMENTS.declared, COMMITMENTS.data],
		signature_note: SIGNATURE_NOTE,
		prev_hash: input.prevHash ?? null,
	};
	const json = JSON.stringify(record);
	return { json, hash: sha256(json), record };
};

/** Bản ghi còn nguyên vẹn so với mã băm đã lưu? */
const verifyRecord = (json, hash) => !!json && !!hash && sha256(json) === hash;

module.exports = {
	normName,
	signatureMatches,
	publicConsent,
	clientOf,
	consentInput,
	buildRecord,
	buildAmendmentRecord,
	verifyRecord,
};
