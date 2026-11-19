// Đăng ký khóa đào tạo liên tục trên cổng công khai (nội viện / ngoại viện) — thay
// Google Form. Người gọi KHÔNG đăng nhập và form chứa dữ liệu cá nhân, nên:
//   - mọi nhánh đăng ký trả CÙNG hình dạng { submitted, registration_code, download_token }
//     (kể cả honeypot ở controller): không lộ CCCD có hồ sơ hay chưa, ngày sinh/họ tên
//     có khớp hồ sơ cũ hay không;
//   - chỉ gắn vào hồ sơ học viên đã có khi CCCD + ngày sinh + họ tên (chuẩn hóa) đều khớp
//     và hồ sơ đó có ngày sinh; KHÔNG cập nhật hồ sơ đã có bằng dữ liệu form;
//   - bản khai (snapshot) chỉ chứa đúng dữ liệu người đó vừa gửi — đơn in từ snapshot;
//   - tra cứu / tải đơn theo mã đăng ký luôn đòi yếu tố thứ hai trong body (CCCD, email
//     hoặc download_token của chính lượt đó); sai mã hay sai yếu tố thứ hai đều 404 như nhau.
const crypto = require('crypto');
const path = require('path');
const { getPool, sql } = require('../../config/db');
const traineeService = require('../training/trainees/traineeService');
const courseEnrollmentService = require('../training/courses/courseEnrollmentService');
const courseService = require('../training/courses/courseService');
const courseRegistrationService = require('../training/registration/courseRegistrationService');
const registrationDocumentService = require('../training/registration/registrationDocumentService');
const emailOtp = require('../training/registration/registrationEmailOtpService');
const {
	RULES_VERSION,
	CLASS_RULES,
	ID_ISSUE_PLACES,
	SNAPSHOT_FIELDS,
	TRAINEE_FIELDS,
	INVOICE_FIELDS,
} = require('../training/registration/registrationConstants');
const formCustomValueService = require('../forms/formCustomValueService');
const mailService = require('../notifications/mailService');
const mailQueue = require('../notifications/mailQueue');
const { ROLE, inputRoleId } = require('../access/roleCodes');
const { norm } = require('../../utils/vietnameseText');
const { maskEmail } = require('../../utils/maskEmail');
const { signToken, verifyToken } = require('../../utils/keys');
const { moveUploadedFiles, UPLOADS_ROOT } = require('../../utils/uploadPaths');
const { httpError, badRequest } = require('../../utils/httpError');
const { isPdf } = require('../training/trainees/traineeProfilePdf');

const DOWNLOAD_PURPOSE = 'registration-download';
const DOWNLOAD_TTL = '30m';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const hasFiles = (files) => Array.isArray(files) && files.length > 0;

const clean = (v) => {
	if (v === undefined || v === null) return null;
	if (typeof v === 'string') return v.trim() || null;
	return v;
};

// 'YYYY-MM-DD' của cột DATE (driver trả Date lúc 00:00 UTC) hoặc chuỗi ISO từ form
const toDateKey = (v) => {
	if (!v) return null;
	const d = v instanceof Date ? v : new Date(String(v).slice(0, 10));
	return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const DATE_FIELDS = new Set(['dob', 'national_id_issued_date']);
const STAFF_ONLY_FIELDS = new Set(['staff_number', 'department_id']);

// Bản khai = đúng các khóa SNAPSHOT_FIELDS người đăng ký vừa gửi (không lấy từ hồ sơ cũ).
// Ngoại viện không có mã NV / khoa; nội viện ghi đè các trường đó từ hồ sơ nhân sự.
const buildSnapshot = (data, { internal }) => {
	const out = {};
	for (const k of SNAPSHOT_FIELDS) {
		if (STAFF_ONLY_FIELDS.has(k)) continue;
		let v = clean(data[k]);
		if (v === null) continue;
		if (DATE_FIELDS.has(k)) v = toDateKey(v);
		if (k === 'graduated_year' && /^\d{4}$/.test(String(v))) v = Number(v);
		if (v !== null) out[k] = v;
	}
	if (internal) delete out.qualification;
	return out;
};

const pick = (obj, keys) => {
	const out = {};
	for (const k of keys) if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
	return out;
};

// ─── Nhân viên nội viện ─────────────────────────────────────────────────────
// Như seminarPublicService.findStaff (không export được mà không sửa file đó): tìm
// theo mã NV, họ tên phải khớp (bỏ dấu / hoa thường) — cần biết cả 2 mới ra hồ sơ.
// Loại tài khoản khoa dùng chung (vai trò dept_head).
const STAFF_NOT_FOUND = 'Không tìm thấy nhân viên khớp họ tên và mã nhân viên đã nhập.';
const findStaff = async (fullName, staffNumber) => {
	const sn = Number(String(staffNumber ?? '').trim());
	if (!Number.isInteger(sn) || sn < 1 || sn > 999999999) throw httpError(404, STAFF_NOT_FOUND);
	const pool = await getPool();
	const r = await (
		await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD)
	).input('sn', sql.Int, sn).query(`
      SELECT u.id, u.full_name, u.staff_number, u.email, u.department_id,
             q.name AS qualification, d.name AS department_name
      FROM users u
      LEFT JOIN qualifications q ON q.id = u.qualification_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.staff_number = @sn AND u.is_active = 'true' AND u.role_id <> @dept_head_role
      ORDER BY u.id OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`);
	const u = r.recordset[0];
	if (!u || !norm(fullName) || norm(u.full_name) !== norm(fullName))
		throw httpError(404, STAFF_NOT_FOUND);
	return u;
};

// Email tài khoản tự sinh (`...@member.local`) không nhận được thư
const realEmail = (e) => (e && !/@member\.local$/i.test(e) ? e : null);

// Hiện lên form để người đăng ký xác nhận — như tra nhân viên khi đăng ký hội nghị,
// không trả SĐT / ngày sinh / email đầy đủ.
const staffCheck = async (staffNumber, fullName) => {
	const u = await findStaff(fullName, staffNumber);
	return {
		full_name: u.full_name,
		department_id: u.department_id ?? null,
		department_name: u.department_name ?? null,
		qualification: u.qualification ?? null,
		email_masked: maskEmail(realEmail(u.email)),
	};
};

const getRules = async () => ({
	version: RULES_VERSION,
	rules: CLASS_RULES,
	id_issue_places: ID_ISSUE_PLACES,
	email_otp_required: await emailOtp.isRequired(),
});

// Nội viện: gửi mã tới email trong hồ sơ nhân sự nếu có email thật, không thì tới email
// người đăng ký nhập. Không khớp nhân viên ⇒ vẫn gửi tới email đã nhập, phản hồi y hệt
// (lúc gửi đăng ký server khớp lại nhân viên nên mã đó không dùng được cho nội viện).
const requestEmailOtp = async ({ source, email, staff_number, full_name }) => {
	let target = String(email).trim();
	let staffUserId = null;
	if (source === 'internal') {
		const u = await findStaff(full_name, staff_number).catch((err) => {
			if (err?.statusCode === 404) return null;
			throw err;
		});
		if (u) {
			staffUserId = u.id;
			target = realEmail(u.email) || target;
		}
	}
	return emailOtp.issue({ email: target, staffUserId });
};

const verifyEmailOtp = (challengeId, code) => emailOtp.verify(challengeId, code);

// ─── Phản hồi đăng ký ───────────────────────────────────────────────────────
// download_token gắn cả enrollment_id lẫn mã đăng ký: mã ghi danh (DK + ngày + 4 số)
// đoán được, mã đăng ký thì ngẫu nhiên — token giả của honeypot không bao giờ trỏ
// trúng bản khai thật.
const signDownloadToken = (enrollmentId, code) =>
	signToken(DOWNLOAD_PURPOSE, { eid: enrollmentId, rc: code }, DOWNLOAD_TTL);

const readDownloadToken = (token) => {
	if (typeof token !== 'string' || !token || token.length > 2000) return null;
	try {
		const p = verifyToken(DOWNLOAD_PURPOSE, token);
		return typeof p.eid === 'string' && typeof p.rc === 'string' ? p : null;
	} catch {
		return null;
	}
};

const ackFor = (reg) => ({
	submitted: true,
	registration_code: reg.registration_code,
	download_token: signDownloadToken(reg.enrollment_id, reg.registration_code),
});

// Honeypot: giá trị giả nhưng đúng định dạng thật; không ghi gì vào CSDL.
const fakeAck = () => {
	const day = new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '');
	const eid = `DK${day}${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;
	return ackFor({ enrollment_id: eid, registration_code: courseRegistrationService.randomCode() });
};

const EMAIL_NOT_VERIFIED =
	'Email chưa được xác minh hoặc mã xác minh đã hết hạn. Vui lòng xác minh lại email trước khi gửi đăng ký.';

// Email xác nhận kèm mã đăng ký — chạy nền (mailQueue), gửi lỗi không làm hỏng đăng ký.
const notifyReceived = (to, { fullName, code, courseName, programId }) => {
	if (!to) return;
	mailQueue.enqueue('xác nhận đăng ký khóa đào tạo', async () => {
		let programName = null;
		if (programId) {
			const pool = await getPool();
			const r = await pool
				.request()
				.input('id', sql.VarChar(20), programId)
				.query('SELECT name FROM training_programs WHERE id = @id');
			programName = r.recordset[0]?.name ?? null;
		}
		await mailService.send({
			to,
			subject: `Đã nhận đăng ký khóa đào tạo — mã ${code}`,
			html: mailService.renderRegistrationReceivedEmail({
				fullName,
				code,
				courseName,
				programName,
			}),
			attachments: [mailService.LOGO_ATTACHMENT],
			event: 'COURSE_ENROLLMENT',
		});
	});
};

// ─── Ngoại viện ─────────────────────────────────────────────────────────────

// Hồ sơ học viên (1 file PDF) đính kèm khi đăng ký — cùng chỗ lưu với tab "Hồ sơ" của học
// viên. Người gửi không đăng nhập ⇒ luôn 'pending' (chờ phòng Đào tạo duyệt).
const attachTraineeDocuments = async (traineeId, files) => {
	const dir = path.join(UPLOADS_ROOT, 'training', 'trainee_document', traineeId);
	const moved = await moveUploadedFiles(files, dir);
	for (const f of moved) {
		await traineeService.addDocument(traineeId, f, null, { status: 'pending' });
	}
};

// Ghi danh + bản khai + trường tùy chỉnh + giấy tờ cho 1 hồ sơ học viên.
const enrollTrainee = async (ctx, traineeId) => {
	const { data, files, custom } = ctx;
	const enrollment = await courseEnrollmentService.registerTrainee(
		data.course_id,
		traineeId,
		null,
		{
			programId: data.program_id || null,
		},
	);
	// Bản khai ghi ngay sau ghi danh — có ở MỌI nhánh (hồ sơ mới, chủ hồ sơ, chưa xác minh)
	const reg = await courseRegistrationService.create(
		enrollment.id,
		{
			source: 'external',
			channel: 'public',
			snapshot: ctx.snapshot,
			rulesVersion: RULES_VERSION,
			verifiedEmail: ctx.verifiedEmail,
			invoice: ctx.invoice,
		},
		null,
	);
	await formCustomValueService.save('course_registration', enrollment.id, custom);
	if (hasFiles(files)) await attachTraineeDocuments(traineeId, files);
	return { ...reg, verified_email: ctx.verifiedEmail };
};

// Không chứng minh được là chủ hồ sơ đã có (CCCD trùng nhưng sai ngày sinh / sai họ tên /
// hồ sơ cũ thiếu ngày sinh / ghi danh hồ sơ đó bị từ chối): KHÔNG đụng tới hồ sơ đã có
// và không đính giấy tờ vào đó. Lưu thành hồ sơ mới KHÔNG có CCCD (tránh chỉ mục duy nhất
// uq_trainees_national_id) kèm ghi chú để phòng Đào tạo đối chiếu thủ công.
const queueUnverified = async (ctx) => {
	const trainee = await traineeService.create(
		{
			...ctx.traineeData,
			national_id: null,
			notes: `Đăng ký công khai chưa xác minh: người đăng ký khai CCCD ${ctx.data.national_id} nhưng không khớp (ngày sinh + họ tên) với hồ sơ đã có. Phòng Đào tạo đối chiếu trước khi duyệt.`,
		},
		null,
	);
	return enrollTrainee(ctx, trainee.id);
};

const registerExternal = async (data, files, custom, { otpRequired, emailProof }) => {
	if (otpRequired && !emailOtp.tokenMatchesEmail(emailProof, data.email))
		throw httpError(400, EMAIL_NOT_VERIFIED);
	const snapshot = buildSnapshot(data, { internal: false });
	const invoice = {};
	for (const k of INVOICE_FIELDS) invoice[k] = clean(data[k]);
	const ctx = {
		data,
		files,
		custom,
		snapshot,
		invoice,
		verifiedEmail: otpRequired ? clean(data.email) : null,
		// Dữ liệu ghi vào hồ sơ học viên MỚI — chỉ TRAINEE_FIELDS
		traineeData: pick(snapshot, TRAINEE_FIELDS),
	};

	let existing = null;
	if (data.national_id) {
		const pool = await getPool();
		const found = await pool
			.request()
			.input('national_id', sql.VarChar(20), data.national_id)
			.query(
				'SELECT * FROM trainees WHERE national_id = @national_id ORDER BY created_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
			);
		existing = found.recordset[0] || null;
	}

	if (!existing) {
		const trainee = await traineeService.create(ctx.traineeData, null);
		return enrollTrainee(ctx, trainee.id);
	}

	const nameKey = norm(data.full_name);
	const owns =
		Boolean(existing.dob) &&
		toDateKey(existing.dob) === toDateKey(data.dob) &&
		Boolean(nameKey) &&
		norm(existing.full_name) === nameKey;
	if (!owns) return queueUnverified(ctx);

	try {
		// Chủ hồ sơ: ghi danh vào hồ sơ đã có, KHÔNG sửa hồ sơ đó bằng dữ liệu form
		return await enrollTrainee(ctx, existing.id);
	} catch (err) {
		// 409 phụ thuộc hồ sơ (đang học chương trình khác, lớp đầy, đã ghi danh...) không
		// được trả nguyên văn cho người ẩn danh — như nhánh không khớp.
		if (err?.statusCode !== 409) throw err;
		return queueUnverified(ctx);
	}
};

// ─── Nội viện ───────────────────────────────────────────────────────────────
// Không tin form cho khoa / trình độ: khớp lại mã NV + họ tên, lấy từ hồ sơ nhân sự.
// Ghi danh bằng registerStaff (dùng / tạo hồ sơ học viên gắn staff_user_id).
const registerInternal = async (data, files, custom, { otpRequired, emailProof }) => {
	const u = await findStaff(data.full_name, data.staff_number);
	const staffEmail = realEmail(u.email);
	if (otpRequired) {
		const ok = staffEmail
			? emailProof?.sid === u.id && emailOtp.tokenMatchesEmail(emailProof, staffEmail)
			: emailOtp.tokenMatchesEmail(emailProof, data.email);
		if (!ok) throw httpError(400, EMAIL_NOT_VERIFIED);
	}

	let enrollment;
	try {
		enrollment = await courseEnrollmentService.registerStaff(data.course_id, u.id, null, {
			programId: data.program_id || null,
		});
	} catch (err) {
		if (err?.statusCode !== 409) throw err;
		// Nhân viên đã được xác định bằng mã NV + họ tên (như đăng ký hội nghị) — báo chung,
		// không nhắc tên chương trình / khóa khác.
		throw httpError(
			409,
			'Nhân viên này đã có đăng ký ở khóa học này hoặc đang theo học chương trình khác. Vui lòng liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến.',
		);
	}

	const snapshot = {
		...buildSnapshot(data, { internal: true }),
		staff_number: u.staff_number,
		department_id: u.department_id ?? undefined,
		qualification: u.qualification ?? undefined,
	};
	const verifiedEmail = otpRequired ? staffEmail || clean(data.email) : null;
	const reg = await courseRegistrationService.create(
		enrollment.id,
		{
			source: 'internal',
			channel: 'public',
			staffUserId: u.id,
			staffNumber: u.staff_number,
			departmentId: u.department_id ?? null,
			snapshot,
			rulesVersion: RULES_VERSION,
			verifiedEmail,
		},
		null,
	);
	await formCustomValueService.save('course_registration', enrollment.id, custom);
	// Nội viện: file gửi kèm (nếu có) là hồ sơ nộp bổ sung của lượt này
	if (hasFiles(files)) await courseRegistrationService.attachDossier(enrollment.id, files[0], null);
	return { ...reg, verified_email: verifiedEmail };
};

/**
 * Đăng ký khóa học công khai. Mọi nhánh trả cùng hình dạng phản hồi.
 * @param {Record<string, any>} data body đã qua validator + formConfigGuard
 * @param {Array<{ originalname: string, filename?: string, path?: string, size?: number, mimetype?: string }> | undefined} files tối đa 1 PDF
 * @param {Record<string, any> | null} custom trường tùy chỉnh (Cấu hình form 'course_registration')
 * @param {{ otpRequired?: boolean, emailProof?: { eh: string, sid: string | null } | null }} [opts]
 *   controller đọc email_token; otpRequired = bắt email của bản khai khớp token
 * @returns {Promise<{ submitted: boolean, registration_code: string, download_token: string }>}
 */
const register = async (data, files, custom = null, opts = {}) => {
	const otp = { otpRequired: !!opts.otpRequired, emailProof: opts.emailProof || null };
	const course = await courseService.getById(data.course_id);
	// courses.status chỉ còn cờ 'cancelled' (trạng thái hiển thị tự suy từ ngày tháng)
	if (!course || course.status === 'cancelled' || !course.is_public_registration) {
		throw httpError(404, 'Khóa học không tồn tại hoặc đã đóng đăng ký.');
	}
	if (!course.enrollment_open) {
		throw httpError(403, 'Khóa học hiện không trong thời gian đăng ký.');
	}
	// Kiểm trước khi tạo hồ sơ / ghi danh — tránh ghi danh xong mới báo sai file
	if (hasFiles(files)) {
		if (files.length > 1) throw badRequest('Chỉ đính kèm 1 file PDF hồ sơ học viên.');
		if (!files.every(isPdf)) throw badRequest('Hồ sơ học viên chỉ nhận file PDF.');
	}

	const internal = data.source === 'internal';
	const reg = internal
		? await registerInternal(data, files, custom, otp)
		: await registerExternal(data, files, custom, otp);

	// Chỉ gửi tới email ĐÃ xác minh (tắt OTP thì không gửi — tránh dùng form gửi thư tới người khác)
	notifyReceived(reg.verified_email, {
		fullName: clean(data.full_name),
		code: reg.registration_code,
		courseName: course.name,
		programId: data.program_id || null,
	});
	return ackFor(reg);
};

// ─── Tra cứu / tải đơn / nộp hồ sơ theo mã đăng ký ───────────────────────────
const NOT_FOUND = 'Không tìm thấy đăng ký khớp với mã và thông tin đã nhập.';

const sameText = (a, b) => {
	const x = crypto.createHash('sha256').update(String(a)).digest();
	const y = crypto.createHash('sha256').update(String(b)).digest();
	return crypto.timingSafeEqual(x, y);
};

// Yếu tố thứ hai: download_token > national_id > email (chỉ xét 1 yếu tố mỗi lượt)
const parseFactor = (body = {}) => {
	if (body.download_token) return { kind: 'token', token: readDownloadToken(body.download_token) };
	if (body.national_id) return { kind: 'national_id', value: String(body.national_id).trim() };
	if (body.email) return { kind: 'email', value: emailOtp.normalizeEmail(body.email) };
	return { kind: 'none' };
};

const factorMatches = (reg, factor) => {
	const s = reg.snapshot || {};
	if (factor.kind === 'token')
		return (
			!!factor.token &&
			factor.token.eid === reg.enrollment_id &&
			factor.token.rc === reg.registration_code
		);
	if (factor.kind === 'national_id')
		return !!s.national_id && sameText(s.national_id, factor.value);
	if (factor.kind === 'email') {
		const emails = [s.email, reg.verified_email].filter(Boolean).map(emailOtp.normalizeEmail);
		return !!factor.value && emails.some((e) => sameText(e, factor.value));
	}
	return false;
};

/**
 * Bản khai theo mã + yếu tố thứ hai. Sai mã / sai yếu tố / thiếu yếu tố ⇒ cùng 1 lỗi 404,
 * cùng số truy vấn (yếu tố được đọc trước khi hỏi CSDL, so trong bộ nhớ).
 */
const resolveAccess = async (code, body) => {
	const factor = parseFactor(body);
	const reg = await courseRegistrationService.getByCode(code);
	if (!reg || !factorMatches(reg, factor)) throw httpError(404, NOT_FOUND);
	return reg;
};

const getStatus = (reg) => ({
	registration_code: reg.registration_code,
	full_name: reg.snapshot?.full_name ?? null,
	source: reg.source,
	course_name: reg.course_name ?? null,
	program_name: reg.program_name ?? null,
	enrollment_status: reg.enrollment_status ?? null,
	registered_at: reg.registered_at ?? reg.created_at ?? null,
	needs_dossier: reg.source === 'internal' && !reg.dossier_file_id,
	dossier_uploaded_at: reg.dossier_uploaded_at ?? null,
	checks: {
		id_checked: !!reg.id_checked_at,
		degree_checked: !!reg.degree_checked_at,
		proposal_checked: !!reg.proposal_checked_at,
	},
});

// Gom tên khóa / chương trình / khoa / đối tượng rồi giao cho mẫu Word (registrationDocumentService)
const renderApplication = async (reg) => {
	let traineeTypeName = null;
	const typeId = reg.snapshot?.trainee_type_id;
	if (typeId) {
		const pool = await getPool();
		const r = await pool
			.request()
			.input('id', sql.VarChar(20), String(typeId))
			.query('SELECT name FROM trainee_types WHERE id = @id');
		traineeTypeName = r.recordset[0]?.name ?? null;
	}
	return registrationDocumentService.renderApplication({
		source: reg.source,
		registration_code: reg.registration_code,
		created_at: reg.created_at,
		snapshot: reg.snapshot,
		course_name: reg.course_name,
		program_name: reg.program_name ?? null,
		department_name: reg.department_name ?? null,
		trainee_type_name: traineeTypeName,
	});
};

// Đúng 1 file PDF. Phòng Đào tạo đã đối chiếu tờ trình thì không cho thay qua cổng
// công khai (thay file đã đối chiếu phải qua phòng Đào tạo).
const uploadDossier = async (reg, files) => {
	if (!Array.isArray(files) || files.length !== 1)
		throw badRequest('Vui lòng đính kèm đúng 1 file PDF (gộp đơn và tờ trình vào một file).');
	if (!isPdf(files[0])) throw badRequest('Hồ sơ nộp bổ sung chỉ nhận file PDF.');
	if (reg.proposal_checked_at)
		throw httpError(
			409,
			'Hồ sơ đã được phòng Đào tạo đối chiếu. Muốn thay file, vui lòng liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến.',
		);
	const r = await courseRegistrationService.attachDossier(reg.enrollment_id, files[0], null);
	return { uploaded: true, dossier_uploaded_at: r.dossier_uploaded_at ?? null };
};

module.exports = {
	register,
	fakeAck,
	staffCheck,
	getRules,
	requestEmailOtp,
	verifyEmailOtp,
	resolveAccess,
	getStatus,
	renderApplication,
	uploadDossier,
	readDownloadToken,
	EMAIL_NOT_VERIFIED,
	NOT_FOUND,
};
