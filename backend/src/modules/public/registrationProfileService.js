/**
 * registrationProfileService.js — Hồ sơ điền sẵn cho form đăng ký khóa học (/dang-ky-khoa-hoc)
 * khi nhân viên nội viện ĐÃ ĐĂNG NHẬP (GET/PUT /me/training/registration-profile).
 *
 * Đọc: gộp từ CSDL theo thứ tự ưu tiên
 *   1. hồ sơ học viên gắn tài khoản (trainees.staff_user_id) — Trung tâm Đào tạo có thể đã sửa;
 *   2. bản khai đăng ký gần nhất của chính người đó (course_registrations.snapshot) — có thêm
 *      các trường hồ sơ học viên không lưu (dân tộc, quê quán, số hiệu văn bằng...);
 *   3. tài khoản nhân sự (users: ngày sinh, giới tính, SĐT, email thật).
 *
 * Ghi: người đăng ký sửa trên form rồi gửi ⇒ cập nhật lại hồ sơ học viên của CHÍNH tài khoản
 * đang đăng nhập. Không bao giờ ghi theo mã NV + họ tên của cổng công khai (ai biết 2 thứ đó
 * cũng gõ được), không đụng tới tài khoản nhân sự (users — do quản trị quản lý). Ô để trống
 * không xóa dữ liệu đã có.
 */
const { getPool, sql } = require('../../config/db');
const { httpError } = require('../../utils/httpError');
const { normalizeGender } = require('../../utils/gender');
const { maskEmail } = require('../../utils/maskEmail');
const { checkNationalId } = require('../../utils/nationalId');
const { ROLE, inputRoleId } = require('../access/roleCodes');
const courseRegistrationService = require('../training/registration/courseRegistrationService');
const traineeService = require('../training/trainees/traineeService');

const NOT_STAFF =
	'Tài khoản này không phải tài khoản nhân viên nội viện, không có hồ sơ để điền sẵn.';

// Email tài khoản tự sinh (`...@member.local`) không nhận được thư
const realEmail = (e) => (e && !/@member\.local$/i.test(e) ? e : null);

const clean = (v) => {
	if (v === undefined || v === null) return null;
	if (v instanceof Date) return v;
	const s = String(v).trim();
	return s || null;
};

// 'YYYY-MM-DD' của cột DATE (driver trả Date lúc 00:00 UTC) hoặc chuỗi ISO
const dateKey = (v) => {
	if (!v) return null;
	const d = v instanceof Date ? v : new Date(String(v).slice(0, 10));
	return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// Trường điền sẵn → nơi lấy, theo thứ tự ưu tiên: t = hồ sơ học viên, s = bản khai gần nhất,
// u = tài khoản nhân sự. Họ tên / khoa / trình độ / đơn vị công tác của nội viện luôn theo hồ sơ
// nhân sự nên không nằm ở đây (trả riêng trong `staff`).
const PROFILE_SOURCES = {
	dob: { t: 'dob', s: 'dob', u: 'date_of_birth', date: true },
	gender: { t: 'gender', s: 'gender', u: 'gender', gender: true },
	ethnicity: { s: 'ethnicity' },
	hometown: { s: 'hometown' },
	national_id: { t: 'national_id', s: 'national_id' },
	national_id_issued_date: {
		t: 'national_id_issued_date',
		s: 'national_id_issued_date',
		date: true,
	},
	national_id_issued_place: { t: 'national_id_issued_place', s: 'national_id_issued_place' },
	permanent_address: { t: 'permanent_address', s: 'permanent_address' },
	address: { t: 'address', s: 'address' },
	phone: { t: 'phone', s: 'phone', u: 'phone_number' },
	email: { t: 'email', s: 'email', u: 'real_email' },
	graduated_school: { t: 'graduated_school', s: 'graduated_school' },
	graduated_year: { t: 'graduated_year', s: 'graduated_year' },
	graduated_major: { s: 'graduated_major' },
	degree_number: { s: 'degree_number' },
	degree_registry_number: { s: 'degree_registry_number' },
	work_specialty: { s: 'work_specialty' },
	work_seniority: { s: 'work_seniority' },
	trainee_type_id: { t: 'trainee_type_id', s: 'trainee_type_id' },
};
const PROFILE_KEYS = Object.keys(PROFILE_SOURCES);

/**
 * Gộp 3 nguồn thành giá trị điền sẵn (chuỗi; bỏ khóa không có dữ liệu). Hàm thuần — có test.
 * @param {Record<string, any> | null} account users (+ real_email)
 * @param {Record<string, any> | null} trainee trainees
 * @param {Record<string, any> | null} snapshot bản khai gần nhất
 * @returns {Record<string, string>}
 */
const mergeProfile = (account, trainee, snapshot) => {
	const out = {};
	for (const key of PROFILE_KEYS) {
		const src = PROFILE_SOURCES[key];
		const candidates = [
			src.t && trainee?.[src.t],
			src.s && snapshot?.[src.s],
			src.u && account?.[src.u],
		];
		for (const raw of candidates) {
			let v = clean(raw);
			if (v === null) continue;
			if (src.date) v = dateKey(v);
			else if (src.gender) v = normalizeGender(v);
			else v = String(v);
			if (v) {
				out[key] = v;
				break;
			}
		}
	}
	return out;
};

// Tài khoản nhân viên đang đăng nhập (đang hoạt động, có mã NV, không phải tài khoản khoa dùng chung)
const loadStaffAccount = async (userId) => {
	const pool = await getPool();
	const r = await (
		await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD)
	).input('uid', sql.VarChar(20), userId).query(`
      SELECT u.id, u.full_name, u.staff_number, u.email, u.phone_number, u.date_of_birth, u.gender,
             u.department_id, q.name AS qualification, d.name AS department_name
      FROM users u
      LEFT JOIN qualifications q ON q.id = u.qualification_id
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.id = @uid AND u.is_active = 'true' AND u.role_id <> @dept_head_role
        AND u.staff_number IS NOT NULL`);
	const u = r.recordset[0];
	if (!u) throw httpError(404, NOT_STAFF);
	return { ...u, real_email: realEmail(u.email) };
};

// Cùng hồ sơ học viên mà courseEnrollmentService.registerStaff dùng khi ghi danh
const loadLinkedTrainee = async (userId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('uid', sql.VarChar(20), userId)
		.query(
			'SELECT * FROM trainees WHERE staff_user_id = @uid ORDER BY created_at DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
		);
	return r.recordset[0] || null;
};

const PHONE_RE = /^(\+?84|0)\d{8,10}$/;
const todayKey = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Bỏ giá trị cũ không còn qua được kiểm tra của form (dữ liệu nhập tay từ trước, CCCD lệch giới
 * tính / năm sinh...) — trường đó coi như còn thiếu để người đăng ký nhập lại, thay vì máy chủ
 * báo lỗi ở một ô người đăng ký không nhìn thấy. Hàm thuần — có test.
 * @param {Record<string, string>} profile
 */
const usableProfile = (profile) => {
	const out = { ...profile };
	const today = todayKey();
	if (out.dob && (out.dob > today || out.dob < '1900-01-01')) delete out.dob;
	if (out.phone && !PHONE_RE.test(out.phone.replace(/[\s.-]/g, ''))) delete out.phone;
	if (out.graduated_year && !/^\d{4}$/.test(out.graduated_year)) delete out.graduated_year;
	if (
		out.national_id_issued_date &&
		(out.national_id_issued_date > today || (out.dob && out.national_id_issued_date < out.dob))
	)
		delete out.national_id_issued_date;
	if (out.national_id) {
		const r = checkNationalId(out.national_id, { dob: out.dob, gender: out.gender });
		if (!r.valid) delete out.national_id;
	}
	return out;
};

/**
 * Hồ sơ đã lưu trong CSDL của 1 nhân viên (đã lọc giá trị hỏng).
 * @param {{ id: string, date_of_birth?: any, gender?: any, phone_number?: any, email?: any }} account
 */
const storedProfileOf = async (account) => {
	const [trainee, regs] = await Promise.all([
		loadLinkedTrainee(account.id),
		courseRegistrationService.listByStaff(account.id),
	]);
	const merged = mergeProfile(
		{ ...account, real_email: realEmail(account.email) },
		trainee,
		regs[0]?.snapshot ?? null,
	);
	return { profile: usableProfile(merged), trainee };
};

// ─── Cổng công khai (chưa đăng nhập, chỉ biết mã NV + họ tên) ──────────────
// Ai biết mã NV + họ tên của đồng nghiệp cũng tra được ⇒ KHÔNG trả giá trị về trình duyệt:
// staff-check chỉ báo trường nào đã có (form ẩn các ô đó), máy chủ tự điền giá trị lúc gửi.
// Email luôn để người đăng ký nhập (dùng cho xác minh email / thư xác nhận).
const PUBLIC_FILLABLE = PROFILE_KEYS.filter((k) => k !== 'email');
// Dữ liệu nhạy cảm chỉ tự điền khi người gửi đã chứng minh là chủ hồ sơ (xác minh mã gửi tới
// email trong hồ sơ nhân sự). Đơn nháp tải về ngay (chưa xác minh) không bao giờ in các trường này.
const SENSITIVE = new Set([
	'dob',
	'national_id',
	'national_id_issued_date',
	'national_id_issued_place',
	'permanent_address',
	'address',
	'phone',
]);

/**
 * Điền vào body những trường người đăng ký để trống mà hồ sơ đã có (không đè chữ đã nhập).
 * @param {Record<string, any>} body
 * @param {Record<string, string>} profile usableProfile
 * @param {{ sensitive?: boolean }} [opts] sensitive = false: bỏ trường nhạy cảm (SENSITIVE)
 * @returns {string[]} các khóa đã điền
 */
const fillMissing = (body, profile, { sensitive = false } = {}) => {
	const filled = [];
	for (const k of PUBLIC_FILLABLE) {
		if (!sensitive && SENSITIVE.has(k)) continue;
		const cur = body[k];
		const empty = cur === undefined || cur === null || String(cur).trim() === '';
		if (empty && profile[k]) {
			body[k] = profile[k];
			filled.push(k);
		}
	}
	return filled;
};

/**
 * Tên các trường hồ sơ đã có (KHÔNG kèm giá trị) cho staff-check của cổng công khai.
 * Trường nhạy cảm chỉ tính là "đã có" khi lúc gửi sẽ bắt xác minh mã gửi tới email thật trong hồ
 * sơ nhân sự (sensitiveOk) — người chỉ biết mã NV + họ tên không dùng được dữ liệu đó.
 * @param {{ id: string }} account
 * @param {boolean} sensitiveOk
 */
const knownFields = async (account, sensitiveOk) => {
	const { profile } = await storedProfileOf(account);
	return PUBLIC_FILLABLE.filter((k) => profile[k] && (sensitiveOk || !SENSITIVE.has(k)));
};

/**
 * Dữ liệu điền sẵn form đăng ký cho nhân viên đang đăng nhập.
 * @param {{ id: string }} user
 */
const getMine = async (user) => {
	const account = await loadStaffAccount(user.id);
	const { profile, trainee } = await storedProfileOf(account);
	return {
		staff_number: String(account.staff_number),
		// Cùng hình dạng với POST /public/course-registration/staff-check
		staff: {
			full_name: account.full_name,
			department_id: account.department_id ?? null,
			department_name: account.department_name ?? null,
			qualification: account.qualification ?? null,
			email_masked: maskEmail(account.real_email),
		},
		profile,
		has_trainee_profile: !!trainee,
	};
};

// Trường của form ghi được vào hồ sơ học viên (cột có trong bảng trainees)
const TRAINEE_WRITABLE = [
	'dob',
	'gender',
	'national_id',
	'national_id_issued_date',
	'national_id_issued_place',
	'permanent_address',
	'address',
	'phone',
	'email',
	'graduated_school',
	'graduated_year',
	'trainee_type_id',
];

/**
 * Cập nhật hồ sơ học viên của nhân viên đang đăng nhập bằng thông tin vừa khai ở form đăng ký.
 * Ô trống thì giữ dữ liệu cũ. Họ tên / khoa / trình độ đồng bộ theo hồ sơ nhân sự.
 * CCCD đang thuộc hồ sơ học viên khác ⇒ bỏ qua trường đó (báo trong `skipped`), phòng Đào tạo
 * đối chiếu — không gộp / không ghi đè hồ sơ của người khác.
 * @param {{ id: string }} user
 * @param {Record<string, any>} data body đã qua validator
 * @returns {Promise<{ updated: string[], skipped: Array<{ key: string, reason: string }> }>}
 */
const updateMine = async (user, data) => {
	const account = await loadStaffAccount(user.id);
	const pool = await getPool();
	let trainee = await loadLinkedTrainee(user.id);
	if (!trainee) {
		const created = await traineeService.create(
			{
				full_name: account.full_name,
				email: account.real_email,
				department_id: account.department_id,
				is_employee: true,
			},
			user.id,
		);
		await pool
			.request()
			.input('tid', sql.VarChar(20), created.id)
			.input('uid', sql.VarChar(20), user.id)
			.query('UPDATE trainees SET staff_user_id = @uid WHERE id = @tid');
		trainee = { id: created.id };
	}

	const fields = {};
	const skipped = [];
	for (const key of TRAINEE_WRITABLE) {
		// Năm tốt nghiệp ghi dạng số; ngày ghi 'YYYY-MM-DD'; còn lại là chuỗi
		/** @type {string | number | Date | null | undefined} */
		let v = clean(data[key]);
		if (v === null) continue;
		if (key === 'dob' || key === 'national_id_issued_date') v = dateKey(v);
		else if (key === 'gender') v = normalizeGender(v);
		else if (key === 'graduated_year') v = /^\d{4}$/.test(String(v)) ? Number(v) : null;
		if (v === null || v === undefined) continue;
		fields[key] = v;
	}

	if (fields.national_id) {
		const dup = await pool
			.request()
			.input('nid', sql.VarChar(20), fields.national_id)
			.input('tid', sql.VarChar(20), trainee.id)
			.query(
				'SELECT 1 AS x FROM trainees WHERE national_id = @nid AND id <> @tid OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY',
			);
		if (dup.recordset.length) {
			delete fields.national_id;
			skipped.push({
				key: 'national_id',
				reason:
					'Số CCCD này đang gắn với một hồ sơ học viên khác — Trung tâm Đào tạo sẽ đối chiếu.',
			});
		}
	}
	if (fields.trainee_type_id) {
		const t = await pool
			.request()
			.input('id', sql.VarChar(20), fields.trainee_type_id)
			.query('SELECT 1 AS x FROM trainee_types WHERE id = @id');
		if (!t.recordset.length) delete fields.trainee_type_id;
	}

	const updated = Object.keys(fields);
	await traineeService.update(
		trainee.id,
		{
			...fields,
			full_name: account.full_name,
			department_id: account.department_id ?? undefined,
			...(account.qualification ? { qualification: account.qualification } : {}),
			is_employee: true,
		},
		user.id,
	);
	return { updated, skipped };
};

module.exports = {
	getMine,
	updateMine,
	mergeProfile,
	usableProfile,
	storedProfileOf,
	fillMissing,
	knownFields,
	PROFILE_KEYS,
	PUBLIC_FILLABLE,
	SENSITIVE,
	NOT_STAFF,
};
