// Người đăng ký tự sửa bản khai khóa đào tạo liên tục sau khi đã gửi (trang Tra cứu: mã đăng ký
// + CCCD / download_token). Chỉ khi lượt ghi danh còn chờ duyệt (AMEND_STATUSES), tối đa
// MAX_AMENDMENTS lần, mỗi lần phải ghi lý do + tích 2 cam kết + gõ lại họ tên để ký (và OTP email
// nếu đang bật).
//
//   - course_registrations.snapshot / hóa đơn / trường tùy chỉnh ⇒ bản MỚI NHẤT (đơn in theo bản này)
//   - bản gốc lúc gửi vẫn nằm nguyên trong consent_record; mỗi lần sửa ghi 1 dòng
//     course_registration_amendments (trước → sau, lý do, bản ghi ký + mã băm nối chuỗi)
//   - hồ sơ học viên KHÔNG tự đổi: màn duyệt đã so bản khai ↔ hồ sơ (computeDiffs), sửa trường
//     định danh (họ tên, ngày sinh, giới tính, CCCD) thì màn duyệt tô cảnh báo
//   - nội viện: họ tên / mã NV / khoa / trình độ lấy từ hồ sơ nhân sự ⇒ không sửa ở đây
const { getPool, sql, nowSql, withTransaction } = require('../../config/db');
const courseRegistrationService = require('../training/registration/courseRegistrationService');
const emailOtp = require('../training/registration/registrationEmailOtpService');
const formCustomValueService = require('../forms/formCustomValueService');
const amendments = require('../training/registration/registrationAmendments');
const formConfigService = require('../forms/formConfigService');
const { COURSE_REGISTRATION_FORM } = require('../forms/formRegistry.courseRegistration');
const mailService = require('../notifications/mailService');
const mailQueue = require('../notifications/mailQueue');
const {
	buildAmendmentRecord,
	signatureMatches,
} = require('../training/registration/registrationConsent');
const {
	AMEND_STATUSES,
	MAX_AMENDMENTS,
	IDENTITY_FIELDS,
	SNAPSHOT_FIELDS,
	INVOICE_FIELDS,
} = require('../training/registration/registrationConstants');
const { maskEmail } = require('../../utils/maskEmail');
const { httpError, badRequest } = require('../../utils/httpError');
const { clean, buildSnapshot } = require('./publicRegistrationSnapshot');

const FORM_KEY = 'course_registration';
// Nội viện: lấy từ hồ sơ nhân sự lúc đăng ký — giữ nguyên khi sửa
const LOCKED_INTERNAL = ['full_name', 'staff_number', 'department_id', 'qualification'];
const IDENTITY = new Set(IDENTITY_FIELDS);

const CLOSED =
	'Đăng ký đã được Phòng Đào tạo xử lý nên không tự sửa được nữa. Vui lòng liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến để điều chỉnh.';
const LIMIT = `Bản đăng ký đã được sửa ${MAX_AMENDMENTS} lần — lần sửa tiếp theo vui lòng liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến.`;
const NO_CHANGE = 'Bạn chưa thay đổi thông tin nào so với bản đã gửi.';
const EMAIL_NOT_VERIFIED =
	'Email chưa được xác minh hoặc mã xác minh đã hết hạn. Vui lòng xác minh lại email trước khi gửi bản sửa.';
const CONFLICT = 'Bản đăng ký vừa được sửa ở nơi khác. Vui lòng tra cứu lại rồi sửa.';

const realEmail = (e) => (e && !/@member\.local$/i.test(e) ? e : null);
const canEdit = (reg) =>
	AMEND_STATUSES.includes(reg.enrollment_status) && (reg.amendment_count ?? 0) < MAX_AMENDMENTS;

// So giá trị: '' ≡ null, số ≡ chuỗi số, đối tượng (trường tùy chỉnh nhiều lựa chọn) so JSON
const asText = (v) => {
	if (v === undefined || v === null || v === '') return null;
	if (typeof v === 'object') return JSON.stringify(v);
	return String(v).trim() || null;
};
const diff = (keys, before, after, prefix = '') =>
	keys
		.filter((k) => asText(before[k]) !== asText(after[k]))
		.map((k) => ({ key: prefix + k, before: before[k] ?? null, after: after[k] ?? null }));

const loadStaffEmail = async (userId) => {
	if (!userId) return null;
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), userId)
		.query('SELECT email FROM users WHERE id = @id');
	return realEmail(r.recordset[0]?.email);
};

const invoiceOf = (reg) => Object.fromEntries(INVOICE_FIELDS.map((k) => [k, reg[k] ?? null]));

/** Nhãn trường theo Cấu hình form (admin có thể đổi nhãn / thêm trường tùy chỉnh) */
const fieldLabels = async () => {
	const base = Object.fromEntries(COURSE_REGISTRATION_FORM.fields.map((f) => [f.key, f.label]));
	try {
		const resolved = await formConfigService.getResolved(FORM_KEY, 'public');
		for (const f of /** @type {Array<{ key: string, label?: string }>} */ (resolved.fields ?? []))
			if (f.label) base[f.key] = f.label;
		for (const f of /** @type {Array<{ key: string, label: string }>} */ (resolved.custom ?? []))
			base[`custom.${f.key}`] = f.label;
	} catch {
		// Lỗi đọc cấu hình không được chặn việc gửi thư — dùng nhãn mặc định
	}
	return base;
};

/**
 * Dữ liệu điền sẵn form sửa (đã qua mã đăng ký + CCCD / download_token).
 * @param {Record<string, any>} reg dòng courseRegistrationService.getByCode
 */
const getEditable = async (reg) => {
	const internal = reg.source === 'internal';
	const [custom, history, staffEmail] = await Promise.all([
		formCustomValueService.get(FORM_KEY, reg.enrollment_id),
		amendments.list(reg.enrollment_id),
		internal ? loadStaffEmail(reg.staff_user_id) : null,
	]);
	return {
		registration_code: reg.registration_code,
		source: reg.source,
		enrollment_status: reg.enrollment_status ?? null,
		can_edit: canEdit(reg),
		closed_reason: !AMEND_STATUSES.includes(reg.enrollment_status)
			? CLOSED
			: (reg.amendment_count ?? 0) >= MAX_AMENDMENTS
				? LIMIT
				: null,
		amendments_left: Math.max(0, MAX_AMENDMENTS - (reg.amendment_count ?? 0)),
		snapshot: reg.snapshot ?? {},
		invoice: internal ? null : invoiceOf(reg),
		custom,
		// Nội viện: phần lấy từ hồ sơ nhân sự (không sửa) + email nhận OTP (đã che)
		staff: internal
			? {
					staff_number: reg.staff_number ?? reg.snapshot?.staff_number ?? null,
					full_name: reg.snapshot?.full_name ?? null,
					department_id: reg.department_id ?? null,
					department_name: reg.department_name ?? null,
					qualification: reg.snapshot?.qualification ?? null,
					email_masked: maskEmail(staffEmail),
				}
			: null,
		amendments: history.map((a) => ({
			seq: a.seq,
			created_at: a.created_at,
			reason: a.reason,
			fields: amendments.parseChanges(a.changes).map((c) => c.key),
		})),
	};
};

// OTP email đang bật: email của bản sửa phải khớp token (nội viện có email hồ sơ nhân sự: token
// phải của đúng nhân viên đó, gửi tới email hồ sơ — như lúc đăng ký)
/**
 * @param {Record<string, any>} reg
 * @param {Record<string, any>} data
 * @param {{ otpRequired?: boolean, emailProof?: { eh: string, sid: string | null } | null }} opts
 */
const verifiedEmailFor = async (reg, data, { otpRequired, emailProof }) => {
	if (!otpRequired) return reg.verified_email ?? null;
	if (reg.source === 'internal') {
		const staffEmail = await loadStaffEmail(reg.staff_user_id);
		const ok = staffEmail
			? emailProof?.sid === reg.staff_user_id && emailOtp.tokenMatchesEmail(emailProof, staffEmail)
			: emailOtp.tokenMatchesEmail(emailProof, data.email);
		if (!ok) throw httpError(400, EMAIL_NOT_VERIFIED);
		return staffEmail || clean(data.email);
	}
	if (!emailOtp.tokenMatchesEmail(emailProof, data.email)) throw httpError(400, EMAIL_NOT_VERIFIED);
	return clean(data.email);
};

/**
 * Lưu 1 lần sửa bản khai.
 * @param {Record<string, any>} reg dòng courseRegistrationService.getByCode (đã qua yếu tố thứ hai)
 * @param {Record<string, any>} data body đã qua validators.amendment
 * @param {Record<string, unknown> | null} custom req.formCustom (formConfigGuard)
 * @param {{ otpRequired?: boolean, emailProof?: { eh: string, sid: string | null } | null,
 *   client?: { ip?: string | null, userAgent?: string | null } }} opts
 * @returns {Promise<{ seq: number, consent_hash: string, fields: string[], identity_changed: boolean }>}
 */
const amend = async (reg, data, custom, opts = {}) => {
	if (!AMEND_STATUSES.includes(reg.enrollment_status)) throw httpError(409, CLOSED);
	const count = reg.amendment_count ?? 0;
	if (count >= MAX_AMENDMENTS) throw httpError(409, LIMIT);
	if (data.source !== reg.source) throw badRequest('Không đổi được đối tượng đăng ký khi sửa.');
	const internal = reg.source === 'internal';

	const before = reg.snapshot ?? {};
	const after = buildSnapshot(data, { internal });
	if (internal)
		for (const k of LOCKED_INTERNAL) {
			if (before[k] === undefined) delete after[k];
			else after[k] = before[k];
		}
	const fullName = after.full_name ?? before.full_name ?? '';
	if (!signatureMatches(data.signature_name, fullName))
		throw badRequest('Họ tên ký xác nhận phải trùng với họ tên trên bản đăng ký');

	const invoiceBefore = invoiceOf(reg);
	const invoiceAfter = internal
		? invoiceBefore
		: Object.fromEntries(INVOICE_FIELDS.map((k) => [k, clean(data[k])]));
	const customBefore = await formCustomValueService.get(FORM_KEY, reg.enrollment_id);
	const customAfter = custom ?? customBefore;
	const changes = [
		...diff(SNAPSHOT_FIELDS, before, after),
		...diff(INVOICE_FIELDS, invoiceBefore, invoiceAfter),
		...diff(
			[...new Set([...Object.keys(customBefore), ...Object.keys(customAfter)])],
			customBefore,
			customAfter,
			'custom.',
		),
	];
	if (!changes.length) throw badRequest(NO_CHANGE);

	const verifiedEmail = await verifiedEmailFor(reg, data, opts);
	const prev = (await amendments.list(reg.enrollment_id)).at(-1);
	const seq = count + 1;
	const identityChanged = changes.some((c) => IDENTITY.has(c.key));
	const reason = String(data.reason ?? '').trim();
	const { json, hash, record } = buildAmendmentRecord({
		registrationCode: reg.registration_code,
		enrollmentId: reg.enrollment_id,
		seq,
		source: reg.source,
		fullName,
		signatureName: data.signature_name,
		reason,
		changes,
		verifiedEmail,
		prevHash: prev?.consent_hash ?? reg.consent_hash ?? null,
		client: opts.client,
	});

	await withTransaction(async (tx) => {
		// amendment_count = @count: 2 lượt sửa cùng lúc thì lượt sau không ghi đè lượt trước
		const up = await tx
			.request()
			.input('id', sql.VarChar(20), reg.enrollment_id)
			.input('count', sql.Int, count)
			.input('snapshot', sql.NVarChar(sql.MAX), JSON.stringify(after))
			.input('invoice_org_name', sql.NVarChar(255), invoiceAfter.invoice_org_name)
			.input('invoice_org_address', sql.NVarChar(255), invoiceAfter.invoice_org_address)
			.input('invoice_tax_code', sql.VarChar(20), invoiceAfter.invoice_tax_code)
			.input('invoice_budget_code', sql.VarChar(20), invoiceAfter.invoice_budget_code)
			.input('invoice_email', sql.VarChar(100), invoiceAfter.invoice_email)
			.input('verified_email', sql.VarChar(100), verifiedEmail)
			.input('email_changed', sql.Bit, verifiedEmail !== (reg.verified_email ?? null)).query(`
				UPDATE course_registrations SET
					snapshot = @snapshot,
					invoice_org_name = @invoice_org_name, invoice_org_address = @invoice_org_address,
					invoice_tax_code = @invoice_tax_code, invoice_budget_code = @invoice_budget_code,
					invoice_email = @invoice_email,
					verified_email = @verified_email,
					email_verified_at = CASE WHEN @email_changed THEN ${nowSql} ELSE email_verified_at END,
					amendment_count = amendment_count + 1,
					amended_at = ${nowSql},
					updated_at = ${nowSql}
				WHERE enrollment_id = @id AND amendment_count = @count`);
		if (!up.rowsAffected?.[0]) throw httpError(409, CONFLICT);
		await tx
			.request()
			.input('id', sql.VarChar(20), reg.enrollment_id)
			.input('seq', sql.SmallInt, seq)
			.input('changes', sql.NVarChar(sql.MAX), JSON.stringify(changes))
			.input('identity_changed', sql.Bit, identityChanged)
			.input('reason', sql.NVarChar(500), reason)
			.input('signature_name', sql.NVarChar(150), record.signature_name)
			.input('consent_ip', sql.VarChar(45), record.ip)
			.input('consent_user_agent', sql.NVarChar(300), record.user_agent)
			.input('consent_record', sql.NVarChar(sql.MAX), json)
			.input('consent_hash', sql.Char(64), hash)
			.input('prev_hash', sql.Char(64), record.prev_hash).query(`
				INSERT INTO course_registration_amendments (
					enrollment_id, seq, changes, identity_changed, reason, signature_name,
					consent_ip, consent_user_agent, consent_record, consent_hash, prev_hash, created_at
				) VALUES (
					@id, @seq, @changes, @identity_changed, @reason, @signature_name,
					@consent_ip, @consent_user_agent, @consent_record, @consent_hash, @prev_hash, ${nowSql}
				)`);
		if (custom) await formCustomValueService.save(FORM_KEY, reg.enrollment_id, custom, null, tx);
	});

	notifyAmended(verifiedEmail, {
		fullName,
		code: reg.registration_code,
		courseName: reg.course_name,
		seq,
		keys: changes.map((c) => c.key),
		consentHash: hash,
		signedAt: new Date(String(record.signed_at)),
	});
	return {
		seq,
		consent_hash: hash,
		fields: changes.map((c) => c.key),
		identity_changed: identityChanged,
	};
};

// Thư báo đã sửa — chạy nền, chỉ tới email ĐÃ xác minh (tắt OTP ⇒ chỉ khi lúc đăng ký đã xác minh)
/**
 * @param {string | null | undefined} to
 * @param {{ keys: string[], fullName: string, code: string, courseName: string, seq: number,
 *   consentHash: string, signedAt?: Date }} info keys = mã các trường đã sửa (thư chỉ in nhãn)
 */
const notifyAmended = (to, { keys, ...info }) => {
	if (!to) return;
	mailQueue.enqueue('báo sửa bản đăng ký khóa đào tạo', async () => {
		const labels = await fieldLabels();
		await mailService.send({
			to,
			subject: `Đã sửa bản đăng ký khóa đào tạo — mã ${info.code}`,
			html: mailService.renderRegistrationAmendedEmail({
				...info,
				fieldLabels: [...new Set(keys.map((k) => labels[k] ?? k))],
			}),
			attachments: [mailService.LOGO_ATTACHMENT],
			event: 'COURSE_ENROLLMENT',
		});
	});
};

/** Đọc lại bản khai sau khi sửa (cho tra cứu) */
const reload = (code) => courseRegistrationService.getByCode(code);

module.exports = { getEditable, amend, reload, LIMIT };
