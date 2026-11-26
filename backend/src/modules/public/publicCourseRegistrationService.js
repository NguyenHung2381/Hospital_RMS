// Đăng ký khóa đào tạo liên tục trên cổng công khai (nội viện / ngoại viện) — thay
// Google Form. Người gọi KHÔNG đăng nhập và form chứa dữ liệu cá nhân, nên:
//   - mọi nhánh đăng ký trả CÙNG hình dạng { submitted, registration_code, download_token }
//     (kể cả honeypot ở controller): không lộ CCCD có hồ sơ hay chưa, ngày sinh/họ tên
//     có khớp hồ sơ cũ hay không;
//   - chỉ gắn vào hồ sơ học viên đã có khi CCCD + ngày sinh + họ tên (chuẩn hóa) đều khớp
//     và hồ sơ đó có ngày sinh; KHÔNG cập nhật hồ sơ đã có bằng dữ liệu form;
//   - bản khai (snapshot) chỉ chứa đúng dữ liệu người đó vừa gửi — đơn in từ snapshot;
//   - tra cứu / tải đơn theo mã đăng ký luôn đòi yếu tố thứ hai trong body (CCCD, email
//     hoặc download_token của chính lượt đó); sai mã hay sai yếu tố thứ hai đều 404 như nhau;
//   - hồ sơ bắt buộc (registrationFileKinds.js) được kiểm TRƯỚC khi ghi CSDL và chỉ gắn vào
//     đơn sau cùng (sau bản khai) — nhánh queueUnverified gắn vào hồ sơ MỚI, không vào hồ sơ
//     của người khác.
const crypto = require('crypto');
const { publicConsent, consentInput } = require('../training/registration/registrationConsent');
const fsp = require('fs/promises');
const { getPool, sql } = require('../../config/db');
const traineeService = require('../training/trainees/traineeService');
const courseEnrollmentService = require('../training/courses/courseEnrollmentService');
const courseService = require('../training/courses/courseService');
const courseRegistrationService = require('../training/registration/courseRegistrationService');
const registrationDocumentService = require('../training/registration/registrationDocumentService');
const registrationFileService = require('../training/registration/registrationFileService');
const {
	REGISTRATION_FILE_EXTENSIONS,
	publicKinds,
	kindDef,
} = require('../training/registration/registrationFileKinds');
const uploadPolicy = require('../../utils/uploadPolicy');
const emailOtp = require('../training/registration/registrationEmailOtpService');
const {
	RULES_VERSION,
	CLASS_RULES,
	ID_ISSUE_PLACES,
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
const { httpError, badRequest } = require('../../utils/httpError');
const {
	clean,
	toDateKey,
	buildSnapshot,
	pick,
	birthYearOf,
} = require('./publicRegistrationSnapshot');

const DOWNLOAD_PURPOSE = 'registration-download';
const DOWNLOAD_TTL = '30m';
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// ─── Nhân viên nội viện ─────────────────────────────────────────────────────
// Như seminarPublicService.findStaff (không export được mà không sửa file đó): tìm
// theo mã NV, họ tên phải khớp (bỏ dấu / hoa thường) — cần biết cả 2 mới ra hồ sơ.
// Loại tài khoản khoa dùng chung (vai trò dept_head).
const STAFF_NOT_FOUND = 'Không tìm thấy nhân viên khớp họ tên và mã nhân viên đã nhập.';

// Khóa bộ đếm lần thử theo mã NV: đúng giá trị findStaff dùng để tra ('0123', '00123'... cùng
// là nhân viên 123 ⇒ cùng 1 bộ đếm). Không phải số nguyên thì giữ chuỗi đã trim (validator
// đã chặn từ trước, findStaff cũng trả 404).
const staffAttemptKey = (staffNumber) => {
	const raw = String(staffNumber ?? '').trim();
	const sn = Number(raw);
	return raw && Number.isSafeInteger(sn) ? String(sn) : raw;
};

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
	consent: publicConsent(),
	id_issue_places: ID_ISSUE_PLACES,
	email_otp_required: await emailOtp.isRequired(),
	attachments: {
		extensions: REGISTRATION_FILE_EXTENSIONS,
		max_size_mb: (await uploadPolicy.getPolicy()).maxSizeMB,
		kinds: publicKinds(),
	},
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
/**
 * @param {string | null | undefined} to
 * @param {{ programId?: string | null, fullName: string, code: string, courseName: string,
 *   consentHash?: string | null, signedAt?: Date }} info consentHash = mã băm bản ghi xác nhận điện tử
 */
const notifyReceived = (to, { programId, ...info }) => {
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
			subject: `Đã nhận đăng ký khóa đào tạo — mã ${info.code}`,
			html: mailService.renderRegistrationReceivedEmail({ ...info, programName }),
			attachments: [mailService.LOGO_ATTACHMENT],
			event: 'COURSE_ENROLLMENT',
		});
	});
};

// ─── Ngoại viện ─────────────────────────────────────────────────────────────

// Ghi danh + bản khai + trường tùy chỉnh + giấy tờ (vào hồ sơ học viên của chính lượt ghi danh,
// trạng thái 'pending') cho 1 hồ sơ học viên.
const enrollTrainee = async (ctx, traineeId) => {
	const { data, byKind, custom } = ctx;
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
			consent: ctx.consent,
		},
		null,
	);
	await formCustomValueService.save('course_registration', enrollment.id, custom);
	// Bước CUỐI: lỗi 409 ở các bước trên vẫn chuyển sang queueUnverified với file chưa bị chuyển đi
	await registrationFileService.attachAll(
		{ enrollment_id: enrollment.id, source: 'external', trainee_id: traineeId },
		byKind,
		null,
	);
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

const registerExternal = async (data, byKind, custom, { otpRequired, emailProof, consent }) => {
	if (otpRequired && !emailOtp.tokenMatchesEmail(emailProof, data.email))
		throw httpError(400, EMAIL_NOT_VERIFIED);
	const snapshot = buildSnapshot(data, { internal: false });
	const invoice = {};
	for (const k of INVOICE_FIELDS) invoice[k] = clean(data[k]);
	const ctx = {
		consent,
		data,
		byKind,
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
const registerInternal = async (data, byKind, custom, { otpRequired, emailProof, consent }) => {
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
			consent: consent && { ...consent, fullName: u.full_name },
		},
		null,
	);
	await formCustomValueService.save('course_registration', enrollment.id, custom);
	// Đơn đã ký + tờ trình đã duyệt — gắn sau cùng, vào đúng lượt ghi danh này
	await registrationFileService.attachAll(
		{ enrollment_id: enrollment.id, source: 'internal', trainee_id: enrollment.trainee_id ?? null },
		byKind,
		null,
	);
	return { ...reg, verified_email: verifiedEmail };
};

// Khóa học phải tồn tại, mở đăng ký công khai và đang trong thời gian đăng ký
const getOpenCourse = async (courseId) => {
	const course = await courseService.getById(courseId);
	// courses.status chỉ còn cờ 'cancelled' (trạng thái hiển thị tự suy từ ngày tháng)
	if (!course || course.status === 'cancelled' || !course.is_public_registration) {
		throw httpError(404, 'Khóa học không tồn tại hoặc đã đóng đăng ký.');
	}
	if (!course.enrollment_open) {
		throw httpError(403, 'Khóa học hiện không trong thời gian đăng ký.');
	}
	return course;
};

/**
 * Khóa đang mở đăng ký + chương trình đã chọn (tên, học phí). Khóa có chương trình thì phải
 * chọn đúng 1 chương trình thuộc khóa; khóa không có chương trình ⇒ program_name / tuition_fee null.
 * @param {string} courseId
 * @param {string | null | undefined} programId
 * @returns {Promise<{ course: Record<string, any>, program_name: string | null, tuition_fee: number | null }>}
 */
const loadOpenCourse = async (courseId, programId) => {
	const course = await getOpenCourse(courseId);
	const pool = await getPool();
	const r = await pool.request().input('c', sql.VarChar(20), course.id ?? courseId).query(`
		SELECT cp.program_id, tp.name, tp.tuition_fee
		FROM course_programs cp
		JOIN training_programs tp ON tp.id = cp.program_id
		WHERE cp.course_id = @c`);
	const programs = r.recordset;
	if (!programs.length) return { course, program_name: null, tuition_fee: null };
	if (!programId) throw badRequest('Vui lòng chọn chương trình của khóa học.');
	const p = programs.find((x) => x.program_id === programId);
	if (!p) throw badRequest('Chương trình không thuộc khóa học đã chọn.');
	return {
		course,
		program_name: p.name ?? null,
		tuition_fee:
			p.tuition_fee === null || p.tuition_fee === undefined ? null : Number(p.tuition_fee),
	};
};

/**
 * Đăng ký khóa học công khai. Mọi nhánh trả cùng hình dạng phản hồi.
 * @param {Record<string, any>} data body đã qua validator + formConfigGuard
 * @param {Record<string, { originalname: string, filename?: string, path?: string, size?: number, mimetype?: string }>} byKind
 *   file hồ sơ theo loại (registrationFileService.collectByKind)
 * @param {Record<string, any> | null} custom trường tùy chỉnh (Cấu hình form 'course_registration')
 * @param {{ otpRequired?: boolean, emailProof?: { eh: string, sid: string | null } | null,
 *   client?: { ip?: string | null, userAgent?: string | null } }} [opts]
 *   controller đọc email_token; otpRequired = bắt email của bản khai khớp token; client = IP / thiết bị lúc ký
 * @returns {Promise<{ submitted: boolean, registration_code: string, download_token: string }>}
 */
const register = async (data, byKind, custom = null, opts = {}) => {
	// consent: họ tên gõ để ký + IP / thiết bị (validator đã kiểm khớp họ tên khai; nội viện ký theo hồ sơ nhân sự)
	const otp = {
		otpRequired: !!opts.otpRequired,
		emailProof: opts.emailProof || null,
		consent: consentInput(data, opts.client),
	};
	const course = await getOpenCourse(data.course_id);
	// Kiểm lần 2 (controller đã kiểm) trước khi tạo hồ sơ / ghi danh — tránh ghi danh xong mới báo sai file
	registrationFileService.assertSubmission(data.source, byKind ?? {});

	const internal = data.source === 'internal';
	const reg = internal
		? await registerInternal(data, byKind ?? {}, custom, otp)
		: await registerExternal(data, byKind ?? {}, custom, otp);

	// Chỉ gửi tới email ĐÃ xác minh (tắt OTP thì không gửi — tránh dùng form gửi thư tới người khác)
	notifyReceived(reg.verified_email, {
		fullName: clean(data.full_name),
		code: reg.registration_code,
		courseName: course.name,
		programId: data.program_id || null,
		consentHash: reg.consent_hash ?? null,
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
 * allowEmail = false: không nhận email làm yếu tố thứ hai — cho tải đơn (có CCCD đầy đủ) và
 * nộp / thay hồ sơ. Mã đăng ký + email là thứ cán bộ chỉ có courses:read cũng xem được ở
 * danh sách ghi danh, nên chỉ đủ để xem trạng thái; tải đơn / nộp hồ sơ cần CCCD hoặc
 * download_token (chỉ người đăng ký có).
 * @param {string} code
 * @param {Record<string, any>} body
 * @param {{ allowEmail?: boolean }} [opts]
 */
const resolveAccess = async (code, body, { allowEmail = true } = {}) => {
	let factor = parseFactor(body);
	if (factor.kind === 'email' && !allowEmail) factor = { kind: 'none' };
	const reg = await courseRegistrationService.getByCode(code);
	if (!reg || !factorMatches(reg, factor)) throw httpError(404, NOT_FOUND);
	return reg;
};

// Chỉ đơn còn chờ duyệt / trong danh sách chờ mới nộp hoặc thay hồ sơ được
const UPLOAD_OPEN_STATUSES = ['pending', 'waitlisted'];

const getStatus = async (reg) => {
	const { files, files_missing } = await registrationFileService.describe(reg, { withUrl: false });
	return {
		registration_code: reg.registration_code,
		full_name: reg.snapshot?.full_name ?? null,
		source: reg.source,
		course_name: reg.course_name ?? null,
		program_name: reg.program_name ?? null,
		enrollment_status: reg.enrollment_status ?? null,
		registered_at: reg.registered_at ?? reg.created_at ?? null,
		can_upload: UPLOAD_OPEN_STATUSES.includes(reg.enrollment_status),
		files,
		files_missing,
	};
};

const traineeTypeNameOf = async (typeId) => {
	if (!typeId) return null;
	const pool = await getPool();
	const r = await pool
		.request()
		.input('id', sql.VarChar(20), String(typeId))
		.query('SELECT name FROM trainee_types WHERE id = @id');
	return r.recordset[0]?.name ?? null;
};

// Gom tên khóa / chương trình / khoa / đối tượng rồi giao cho mẫu Word (registrationDocumentService)
const renderApplication = async (reg) => {
	const traineeTypeName = await traineeTypeNameOf(reg.snapshot?.trainee_type_id);
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

// Đơn đăng ký nháp (nội viện, chưa có mã đăng ký): điền sẵn từ chính dữ liệu người đó vừa gõ
// + khoa / trình độ lấy từ hồ sơ nhân sự (khớp lại mã NV + họ tên, như lúc gửi đăng ký). Ngày
// lập đơn để trống cho người ký tự ghi.
const renderDraftApplication = async (data) => {
	const u = await findStaff(data.full_name, data.staff_number);
	const { course, program_name } = await loadOpenCourse(data.course_id, data.program_id);
	const snapshot = {
		...buildSnapshot(data, { internal: true }),
		staff_number: u.staff_number,
		department_id: u.department_id ?? undefined,
		qualification: u.qualification ?? undefined,
	};
	return registrationDocumentService.renderApplication({
		source: 'internal',
		registration_code: null,
		created_at: null,
		snapshot,
		course_name: course.name,
		program_name,
		department_name: u.department_name ?? null,
		trainee_type_name: await traineeTypeNameOf(clean(data.trainee_type_id)),
		draft: true,
	});
};

// Tờ trình nháp + Bảng phân tích nhu cầu (nội viện): đúng 1 người (người đăng ký), mọi ô của
// bảng phân tích để trống — không lộ số liệu nội bộ của khoa cho người chưa đăng nhập.
const renderDraftProposal = async (data) => {
	const u = await findStaff(data.full_name, data.staff_number);
	const { course, program_name, tuition_fee } = await loadOpenCourse(
		data.course_id,
		data.program_id,
	);
	const out = await registrationDocumentService.renderProposal({
		department_name: u.department_name ?? '',
		course_name: course.name,
		program_name,
		start_date: course.start_date,
		end_date: course.end_date,
		tuition_fee,
		year: new Date().getFullYear(),
		people: [
			{
				staff_number: u.staff_number,
				full_name: u.full_name,
				birth_year: birthYearOf(data.dob),
				qualification: u.qualification ?? null,
			},
		],
		blank_analysis: true,
	});
	return { ...out, filename: `${out.filename.slice(0, -'.docx'.length)}-ban-nhap.docx` };
};

// Nộp / thay 1 file hồ sơ. Đơn đã được xử lý (không còn chờ duyệt / danh sách chờ) thì không
// cho thay hồ sơ qua cổng công khai — phải qua phòng Đào tạo.
const uploadFile = async (reg, kind, file) => {
	if (!file) throw badRequest('Vui lòng chọn file cần nộp.');
	// multer đã ghi file tạm — kiểm không đạt thì xóa ngay (cleanupTmp cũng dọn khi trả response)
	const reject = async (err) => {
		if (file.path) await fsp.unlink(file.path).catch(() => {});
		throw err;
	};
	if (!kindDef(reg.source, kind)) await reject(badRequest('Loại hồ sơ không hợp lệ cho đơn này.'));
	if (!UPLOAD_OPEN_STATUSES.includes(reg.enrollment_status))
		await reject(
			httpError(
				409,
				'Đơn đăng ký đã được xử lý. Muốn thay hồ sơ, vui lòng liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến.',
			),
		);
	const { uploaded_at } = await registrationFileService.attach(reg, kind, file, null);
	const { files_missing } = await registrationFileService.describe(reg);
	return { kind, uploaded_at, files_missing };
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
	renderDraftApplication,
	renderDraftProposal,
	uploadFile,
	staffAttemptKey,
	EMAIL_NOT_VERIFIED,
	NOT_FOUND,
};
