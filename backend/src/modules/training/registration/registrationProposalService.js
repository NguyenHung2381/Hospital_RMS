// Tờ trình cử cán bộ tham dự lớp đào tạo liên tục (mỗi khoa 1 tờ / lớp): gom nhóm nội viện
// (courseRegistrationService.listInternalGroups — luồng L2), tính các số của Bảng phân
// tích nhu cầu đào tạo có thể tính từ dữ liệu, rồi sinh .docx bằng registrationDocumentService
// (luồng L3). Ô không có dữ liệu (kỹ thuật, lý do) để trống cho khoa ghi tay.
const { getPool, sql, vnTodaySql } = require('../../../config/db');
const courseRegistrationService = require('./courseRegistrationService');
const registrationDocumentService = require('./registrationDocumentService');

// Người đã bị từ chối không còn trong danh sách cử đi học
const proposedPeople = (group) =>
	(group.people ?? []).filter((p) => p.enrollment_status !== 'rejected');

// Nhân viên đang làm việc ở khoa đã có giấy chứng nhận (còn hiệu lực) của chương trình này.
// Khóa không chia chương trình thì không xác định được "cùng nội dung" ⇒ để trống.
const certifiedCount = async (departmentId, programId) => {
	if (!programId) return null;
	const pool = await getPool();
	const r = await pool
		.request()
		.input('department_id', sql.VarChar(20), departmentId)
		.input('program_id', sql.VarChar(20), programId).query(`
      SELECT COUNT(DISTINCT u.id) AS n
      FROM users u
      JOIN trainees t ON t.staff_user_id = u.id
      JOIN course_enrollments e ON e.trainee_id = t.id AND e.program_id = @program_id
      JOIN certificates ce ON ce.enrollment_id = e.id AND ce.status = 'active'
      WHERE u.department_id = @department_id AND u.is_active = 'true'`);
	return Number(r.recordset[0]?.n ?? 0);
};

// Nhân viên của khoa đang theo một khóa khác chưa kết thúc (đã duyệt, đang học, lớp / khóa
// chưa qua ngày kết thúc) — khoa cân nhắc người vắng mặt cùng lúc.
const inOtherTrainingCount = async (departmentId, courseId) => {
	const pool = await getPool();
	const r = await pool
		.request()
		.input('department_id', sql.VarChar(20), departmentId)
		.input('course_id', sql.VarChar(20), courseId).query(`
      SELECT COUNT(DISTINCT u.id) AS n
      FROM users u
      JOIN trainees t ON t.staff_user_id = u.id
      JOIN course_enrollments e ON e.trainee_id = t.id AND e.status = 'approved'
        AND COALESCE(e.progress_status, 'in_progress') = 'in_progress'
      JOIN courses c ON c.id = e.course_id AND c.status NOT IN ('cancelled', 'completed')
      LEFT JOIN course_programs cp ON cp.course_id = e.course_id AND cp.program_id = e.program_id
      WHERE u.department_id = @department_id AND u.is_active = 'true' AND e.course_id <> @course_id
        AND (COALESCE(cp.end_date, c.end_date) IS NULL OR COALESCE(cp.end_date, c.end_date) >= ${vnTodaySql})`);
	return Number(r.recordset[0]?.n ?? 0);
};

/**
 * Dữ liệu cho registrationDocumentService.renderProposal từ 1 nhóm của listInternalGroups.
 * @param {Record<string, any>} group
 */
const buildProposalData = async (group) => {
	const people = proposedPeople(group);
	const [certified, inOther] = await Promise.all([
		certifiedCount(group.department_id, group.program_id),
		inOtherTrainingCount(group.department_id, group.course_id),
	]);
	return {
		department_name: group.department_name,
		course_name: group.course_name,
		program_name: group.program_name ?? null,
		start_date: group.start_date ?? null,
		end_date: group.end_date ?? null,
		tuition_fee: group.tuition_fee ?? null,
		year: new Date().getFullYear(),
		people: people.map((p) => ({
			staff_number: p.staff_number ?? null,
			full_name: p.full_name,
			birth_year: p.birth_year ?? null,
			qualification: p.qualification ?? null,
		})),
		analysis: {
			technique: null,
			certified_count: certified,
			proposed_count: people.length,
			in_other_training_count: inOther,
			reason: null,
		},
	};
};

const renderGroup = async (group) =>
	registrationDocumentService.renderProposal(await buildProposalData(group));

const sameProgram = (a, b) => (a || null) === (b || null);

/**
 * Đúng 1 nhóm (khóa + chương trình + khoa); không có ⇒ null.
 * @param {{ courseId: string, departmentId: string, programId?: string | null }} key
 */
const findGroup = async ({ courseId, departmentId, programId = null }) => {
	const groups = await courseRegistrationService.listInternalGroups({
		courseId,
		departmentId,
		...(programId ? { programId } : {}),
	});
	return (
		groups.find(
			(g) =>
				g.course_id === courseId &&
				g.department_id === departmentId &&
				sameProgram(g.program_id, programId),
		) ?? null
	);
};

// Danh sách nhóm của 1 khóa cho màn quản trị (kèm số người còn được cử đi)
const listForCourse = async (courseId) =>
	(await courseRegistrationService.listInternalGroups({ courseId })).map((g) => ({
		...g,
		proposed_count: proposedPeople(g).length,
	}));

module.exports = {
	proposedPeople,
	buildProposalData,
	renderGroup,
	findGroup,
	sameProgram,
	listForCourse,
};
