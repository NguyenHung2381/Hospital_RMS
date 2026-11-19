// course_registrations — bản khai của 1 lượt ghi danh tạo từ form đăng ký khóa đào tạo
// liên tục (mã đăng ký, snapshot, cam kết, hóa đơn, mốc đối chiếu, hồ sơ nộp bổ sung).
//
// KHUNG: chữ ký hàm là hợp đồng giữa các luồng (xem DANG-KY-DTLT-CONTRACT.md mục 5).
// Luồng L2 viết phần thân; luồng khác chỉ gọi, không sửa file này.

const notImplemented = (name) => {
	throw new Error(`courseRegistrationService.${name} chưa được cài đặt`);
};

/**
 * Mã đăng ký in trên đơn: 'DK' + 10 ký tự [A-HJ-NP-Z2-9] (không có 0/O/1/I), duy nhất.
 * @returns {Promise<string>}
 */
const genCode = async () => notImplemented('genCode');

/**
 * Tạo bản khai cho 1 lượt ghi danh vừa tạo.
 * @param {string} enrollmentId
 * @param {{
 *   source: 'internal' | 'external',
 *   channel?: 'public' | 'portal',
 *   staffUserId?: string | null,
 *   staffNumber?: number | null,
 *   departmentId?: string | null,
 *   snapshot: Record<string, unknown>,
 *   rulesVersion: string,
 *   verifiedEmail?: string | null,
 *   invoice?: Record<string, string | null>,
 * }} data
 * @param {string | null} actorId
 * @returns {Promise<{ enrollment_id: string, registration_code: string }>}
 */
const create = async (enrollmentId, data, actorId) => notImplemented('create');

/**
 * @param {string} enrollmentId
 * @returns {Promise<Record<string, any> | null>} dòng course_registrations, snapshot đã parse thành object
 */
const getByEnrollment = async (enrollmentId) => notImplemented('getByEnrollment');

/**
 * @param {string} code mã đăng ký (không phân biệt hoa/thường, bỏ khoảng trắng và dấu '-')
 * @returns {Promise<Record<string, any> | null>}
 */
const getByCode = async (code) => notImplemented('getByCode');

/**
 * Các bản khai của 1 nhân viên (staff_user_id), mới nhất trước, kèm tên khóa / chương trình
 * và trạng thái ghi danh (enrollment_status).
 * @param {string} userId
 * @returns {Promise<Array<Record<string, any>>>}
 */
const listByStaff = async (userId) => notImplemented('listByStaff');

/**
 * Ghi / bỏ mốc đối chiếu. Khóa vắng mặt thì giữ nguyên; true ⇒ ghi thời điểm + người
 * đối chiếu, false ⇒ xóa mốc.
 * @param {string} enrollmentId
 * @param {{ id_checked?: boolean, degree_checked?: boolean, proposal_checked?: boolean }} checks
 * @param {string} actorId
 * @returns {Promise<Record<string, any>>} dòng sau khi cập nhật
 */
const setChecks = async (enrollmentId, checks, actorId) => notImplemented('setChecks');

/**
 * Lưu file PDF hồ sơ nộp bổ sung (nội viện: đơn + tờ trình đã duyệt). File cũ bị thay.
 * @param {string} enrollmentId
 * @param {Express.Multer.File} file
 * @param {string | null} actorId
 * @returns {Promise<{ file_id: string }>}
 */
const attachDossier = async (enrollmentId, file, actorId) => notImplemented('attachDossier');

/**
 * Bản khai nội viện gom theo khóa + chương trình + khoa — dữ liệu cho Tờ trình.
 * @param {{ courseId?: string, departmentId?: string, programId?: string }} filter
 * @returns {Promise<Array<{
 *   course_id: string, course_name: string, start_date: Date | null, end_date: Date | null,
 *   program_id: string | null, program_name: string | null, tuition_fee: number | null,
 *   department_id: string, department_name: string,
 *   people: Array<{ enrollment_id: string, staff_user_id: string, staff_number: number | null,
 *     full_name: string, birth_year: number | null, qualification: string | null,
 *     enrollment_status: string, dossier_uploaded_at: Date | null, proposal_checked_at: Date | null }>,
 * }>>}
 */
const listInternalGroups = async (filter) => notImplemented('listInternalGroups');

module.exports = {
	genCode,
	create,
	getByEnrollment,
	getByCode,
	listByStaff,
	setChecks,
	attachDossier,
	listInternalGroups,
};
