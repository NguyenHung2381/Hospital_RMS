// Sinh giấy tờ đăng ký khóa đào tạo liên tục (.docx) từ mẫu ở backend/templates/training/:
//   - Đơn đăng ký học khóa đào tạo y tế liên tục (mỗi người đăng ký 1 đơn)
//   - Tờ trình cử cán bộ tham dự lớp + Bảng phân tích nhu cầu đào tạo (mỗi khoa 1 tờ / lớp)
// Hàm thuần: nhận dữ liệu đã gom sẵn, KHÔNG đọc CSDL.
//
// KHUNG: chữ ký hàm là hợp đồng giữa các luồng (xem DANG-KY-DTLT-CONTRACT.md mục 5).
// Luồng L3 viết phần thân; luồng khác chỉ gọi, không sửa file này.

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const notImplemented = (name) => {
	throw new Error(`registrationDocumentService.${name} chưa được cài đặt`);
};

/**
 * Đơn đăng ký học khóa đào tạo y tế liên tục, điền sẵn từ bản khai.
 * @param {{
 *   source: 'internal' | 'external',
 *   registration_code: string,
 *   created_at: Date | string,
 *   snapshot: Record<string, any>,
 *   course_name: string,
 *   program_name?: string | null,
 *   department_name?: string | null,
 *   trainee_type_name?: string | null,
 * }} data
 * @returns {Promise<{ buffer: Buffer, filename: string, mime: string }>}
 */
const renderApplication = async (data) => notImplemented('renderApplication');

/**
 * Tờ trình cử cán bộ tham dự lớp đào tạo liên tục + Bảng phân tích nhu cầu đào tạo.
 * @param {{
 *   department_name: string,
 *   course_name: string,
 *   program_name?: string | null,
 *   start_date?: Date | string | null,
 *   end_date?: Date | string | null,
 *   tuition_fee?: number | null,
 *   year?: number,
 *   people: Array<{ staff_number: number | null, full_name: string, birth_year: number | null, qualification: string | null }>,
 *   analysis?: {
 *     technique?: string | null,
 *     certified_count?: number | null,
 *     proposed_count?: number | null,
 *     in_other_training_count?: number | null,
 *     reason?: string | null,
 *   },
 * }} data
 * @returns {Promise<{ buffer: Buffer, filename: string, mime: string }>}
 */
const renderProposal = async (data) => notImplemented('renderProposal');

module.exports = { DOCX_MIME, renderApplication, renderProposal };
