/**
 * registrationPortalService.js — Đơn đăng ký khóa đào tạo liên tục "của tôi" ở cổng nhân
 * viên (/me/course-registrations, /me/department-proposals).
 *
 * Quyền theo bản ghi (không dùng quyền courses:*):
 *   - Bản khai: chỉ người có staff_user_id = tài khoản đang đăng nhập. Bản khai của người
 *     khác trả 404 như không tồn tại (không lộ mã ghi danh nào có thật).
 *   - Nhóm / Tờ trình của 1 khoa (khóa + chương trình + khoa): tài khoản dùng chung của khoa
 *     (utils/deptAccount.js), trưởng khoa của chính khoa đó, hoặc người có bản khai trong
 *     đúng nhóm đó. Người khác: 404.
 */
const fs = require('fs');
const { getPool, sql } = require('../../config/db');
const { httpError, badRequest } = require('../../utils/httpError');
const { ROLE, inputRoleId } = require('../access/roleCodes');
const courseRegistrationService = require('../training/registration/courseRegistrationService');
const registrationReviewService = require('../training/registration/registrationReviewService');
const registrationProposalService = require('../training/registration/registrationProposalService');
const registrationFileService = require('../training/registration/registrationFileService');
const {
	UPLOADABLE_KINDS,
	kindDef,
	labelOf,
} = require('../training/registration/registrationFileKinds');

const NOT_FOUND = 'Không tìm thấy đơn đăng ký.';
// Chỉ đơn còn chờ duyệt / trong danh sách chờ mới nộp hoặc thay hồ sơ được
const FILE_OPEN_STATUSES = ['pending', 'waitlisted'];
const DOSSIER_LOCKED =
	'Đơn đăng ký đã được xử lý. Muốn thay hồ sơ, vui lòng liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến.';

// Việc người đăng ký còn phải làm (todo) và việc đang chờ Trung tâm Đào tạo (waiting)
const nextSteps = (reg, filesMissing = []) => {
	const todo = filesMissing.map((k) => `Chưa nộp ${labelOf(k)}`);
	const waiting = [];
	return { todo, waiting };
};

/** Bản khai của chính mình, mới nhất trước. */
const listMine = async (user) => {
	const rows = await courseRegistrationService.listByStaff(user.id);
	return Promise.all(
		rows.map(async (r) => {
			const { files, files_missing } = await registrationFileService.describe(r, { withUrl: true });
			// Đơn đã bị từ chối thì không còn việc gì phải làm
			const steps =
				r.enrollment_status === 'rejected'
					? { todo: [], waiting: [] }
					: nextSteps(r, files_missing);
			return {
				enrollment_id: r.enrollment_id,
				registration_code: r.registration_code,
				source: r.source,
				channel: r.channel ?? null,
				course_id: r.course_id ?? null,
				course_name: r.course_name ?? null,
				program_id: r.program_id ?? null,
				program_name: r.program_name ?? null,
				department_id: r.department_id ?? null,
				enrollment_status: r.enrollment_status ?? null,
				created_at: r.created_at ?? null,
				can_upload: FILE_OPEN_STATUSES.includes(r.enrollment_status),
				files,
				files_missing,
				todo: steps.todo,
				waiting: steps.waiting,
			};
		}),
	);
};

/**
 * Bản khai của chính mình theo mã ghi danh; của người khác / không có ⇒ 404.
 * Gọi TRƯỚC khi multer ghi file (route nộp hồ sơ).
 * @returns {Promise<Record<string, any>>}
 */
const getOwn = async (enrollmentId, user) => {
	const reg = await courseRegistrationService.getByEnrollment(enrollmentId);
	if (!reg || !reg.staff_user_id || reg.staff_user_id !== user.id) throw httpError(404, NOT_FOUND);
	return { ...reg, enrollment_id: enrollmentId };
};

/**
 * Kiểm tra TRƯỚC multer (không file nào xuống đĩa nếu không đạt): bản khai của chính mình
 * (không thì 404), loại hồ sơ thuộc đối tượng của đơn (400), đơn chưa xử lý (409).
 * @returns {Promise<Record<string, any>>} bản khai
 */
const assertCanUploadFile = async (enrollmentId, kind, user) => {
	const reg = await getOwn(enrollmentId, user);
	if (!UPLOADABLE_KINDS.includes(kind) || !kindDef(reg.source, kind))
		throw badRequest('Loại hồ sơ không hợp lệ cho đơn này.');
	if (!FILE_OPEN_STATUSES.includes(reg.enrollment_status)) throw httpError(409, DOSSIER_LOCKED);
	return reg;
};

const myApplication = async (enrollmentId, user) =>
	registrationReviewService.renderApplicationFor(await getOwn(enrollmentId, user));

/**
 * Nộp (thay) 1 file hồ sơ của bản khai của chính mình. Kiểm lại như assertCanUploadFile (giữa 2
 * lần kiểm trạng thái đơn có thể đã đổi); không đạt thì xóa file tạm.
 */
const uploadMyFile = async (enrollmentId, kind, file, user) => {
	let reg;
	let uploaded;
	try {
		reg = await assertCanUploadFile(enrollmentId, kind, user);
		uploaded = await registrationFileService.attach(reg, kind, file, user.id);
	} catch (err) {
		if (file?.path) await fs.promises.unlink(file.path).catch(() => {});
		throw err;
	}
	const { files_missing } = await registrationFileService.describe(reg);
	return { kind, uploaded_at: uploaded.uploaded_at, files_missing };
};

// ─── Nhóm theo khoa / Tờ trình ──────────────────────────────────────────────
// Khoa mà tài khoản này quản lý: tài khoản dùng chung của khoa (dept_account_id trỏ tới,
// hoặc mã 'NV…0000' — khoa của chính tài khoản) và trưởng khoa (khoa của mình).
const managedDepartments = async (userId) => {
	const pool = await getPool();
	const req = await inputRoleId(pool.request(), 'dept_head_role', ROLE.DEPT_HEAD);
	const r = await req.input('uid', sql.VarChar(20), userId).query(`
      SELECT u.department_id,
             CASE WHEN u.id LIKE 'NV%0000' OR u.role_id = @dept_head_role THEN 1 ELSE 0 END AS own_dept,
             d.id AS account_department_id
      FROM users u
      LEFT JOIN departments d ON d.dept_account_id = u.id
      WHERE u.id = @uid AND u.is_active = 'true'`);
	const ids = new Set();
	for (const row of r.recordset) {
		if (row.account_department_id) ids.add(row.account_department_id);
		if (Number(row.own_dept) === 1 && row.department_id) ids.add(row.department_id);
	}
	return ids;
};

/** Nhóm (khóa + chương trình + khoa) tài khoản này được xem — kèm cờ can_manage. */
const visibleGroups = async (user) => {
	const [managed, mine] = await Promise.all([
		managedDepartments(user.id),
		courseRegistrationService.listByStaff(user.id),
	]);
	const deptIds = new Set(managed);
	for (const r of mine)
		if (r.source === 'internal' && r.department_id) deptIds.add(r.department_id);
	const lists = await Promise.all(
		[...deptIds].map((departmentId) =>
			courseRegistrationService.listInternalGroups({ departmentId }),
		),
	);
	return lists
		.flat()
		.filter(
			(g) =>
				managed.has(g.department_id) || (g.people ?? []).some((p) => p.staff_user_id === user.id),
		)
		.map((g) => ({ ...g, can_manage: managed.has(g.department_id) }));
};

const departmentProposals = async (user) =>
	(await visibleGroups(user)).map((g) => ({
		course_id: g.course_id,
		course_name: g.course_name,
		program_id: g.program_id ?? null,
		program_name: g.program_name ?? null,
		department_id: g.department_id,
		department_name: g.department_name,
		start_date: g.start_date ?? null,
		end_date: g.end_date ?? null,
		can_manage: g.can_manage,
		people: (g.people ?? []).map((p) => ({
			enrollment_id: p.enrollment_id,
			staff_number: p.staff_number ?? null,
			full_name: p.full_name,
			qualification: p.qualification ?? null,
			enrollment_status: p.enrollment_status,
			has_proposal: !!p.proposal_uploaded_at,
			is_me: p.staff_user_id === user.id,
		})),
	}));

/**
 * Tờ trình (.docx) của 1 nhóm mình được xem. Quản lý nhiều khoa có cùng lớp thì phải
 * chỉ rõ department_id.
 * @param {any} user
 * @param {{ course_id: string, program_id?: string | null, department_id?: string | null }} q
 */
const departmentProposalDocument = async (user, q) => {
	const matches = (await visibleGroups(user)).filter(
		(g) =>
			g.course_id === q.course_id &&
			registrationProposalService.sameProgram(g.program_id, q.program_id) &&
			(!q.department_id || g.department_id === q.department_id),
	);
	if (!matches.length) throw httpError(404, 'Không tìm thấy nhóm đăng ký của khoa.');
	if (matches.length > 1)
		throw badRequest('Lớp này có nhân viên của nhiều khoa — vui lòng chọn khoa.');
	return registrationProposalService.renderGroup(matches[0]);
};

module.exports = {
	listMine,
	getOwn,
	assertCanUploadFile,
	myApplication,
	uploadMyFile,
	managedDepartments,
	visibleGroups,
	departmentProposals,
	departmentProposalDocument,
};
