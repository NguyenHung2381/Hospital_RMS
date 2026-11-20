// Tài liệu OpenAPI cho me.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Me
 *   description: Cổng người dùng — khóa học, lịch học, CME của chính mình
 */

/**
 * @swagger
 * /me/cme:
 *   get:
 *     summary: CME của tôi trong 1 năm (hoặc year=all) + tiến độ 120 giờ / 05 năm liên tục
 *     tags: [Me]
 *     parameters:
 *       - { in: query, name: year, schema: { type: string }, description: "Năm (mặc định năm nay) hoặc all" }
 *     responses:
 *       200:
 *         description: "{ year, required_credits, earned_credits, seminars[], records[], cycle: { cycle_start, cycle_end, basis, cycle_years, license_no, required, earned, earned_undated, missing, days_left, status } | null }. cycle không phụ thuộc year: chu kỳ hiện tại tính từ ngày cấp giấy phép hành nghề (basis = license) hoặc N năm lịch gần nhất (basis = calendar); null nếu không tính được."
 */

/**
 * @swagger
 * /me/course-registrations:
 *   get:
 *     summary: Đơn đăng ký khóa đào tạo liên tục của tôi (nội viện / ngoại viện, mới nhất trước)
 *     tags: [Me]
 *     description: >
 *       Chỉ liệt kê bản khai có staff_user_id là tài khoản đang đăng nhập. Mỗi mục kèm việc còn phải
 *       làm (todo, dạng "Chưa nộp <tên hồ sơ>" cho từng loại còn thiếu) và việc đang chờ Trung tâm
 *       Đào tạo (waiting); đơn đã bị từ chối thì cả hai rỗng. files[] luôn đủ các loại hồ sơ của đối
 *       tượng (kèm file_url có chữ ký của chính file mình đã nộp); can_upload = đơn còn pending / waitlisted.
 *     responses:
 *       200:
 *         description: "Mảng { enrollment_id, registration_code, source, channel, course_id, course_name, program_id, program_name, department_id, enrollment_status, created_at, can_upload, files: [{ kind, label, required, legacy, uploaded_at, file_name, file_url, mime_type, review_status }], files_missing[], todo[], waiting[] }"
 *       403:
 *         description: Module Đào tạo đang tắt (MODULE_DISABLED)
 */

/**
 * @swagger
 * /me/course-registrations/{enrollmentId}/application:
 *   get:
 *     summary: Tải Đơn đăng ký (.docx) của chính mình
 *     tags: [Me]
 *     description: >
 *       Trả file Word thay vì JSON (Content-Disposition attachment). Chỉ chủ bản khai được tải —
 *       bản khai của người khác hoặc mã ghi danh không có đều trả 404 như nhau. Không cần quyền
 *       trainees:read_sensitive vì đây là đơn của chính người tải.
 *     parameters:
 *       - { in: path, name: enrollmentId, required: true, schema: { type: string }, description: Mã ghi danh (DK…) }
 *     responses:
 *       200:
 *         description: File Đơn đăng ký (.docx)
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 *       403:
 *         description: Module Đào tạo đang tắt (MODULE_DISABLED)
 *       404:
 *         description: Không tìm thấy đơn đăng ký (không tồn tại hoặc không phải của tôi)
 */

/**
 * @swagger
 * /me/course-registrations/{enrollmentId}/files/{kind}:
 *   post:
 *     summary: Nộp (thay) 1 file hồ sơ của đơn đăng ký của chính mình
 *     tags: [Me]
 *     description: >
 *       Chỉ chủ bản khai nộp được. Server kiểm tra TRƯỚC khi nhận file (không file nào xuống đĩa nếu
 *       không đạt): không phải bản khai của mình ⇒ 404; loại hồ sơ không thuộc đối tượng của đơn ⇒ 400;
 *       đơn đã xử lý (không còn pending / waitlisted) ⇒ 409. File PDF, JPG hoặc PNG; nội viện lưu theo lượt
 *       ghi danh (file cũ cùng loại bị xóa), ngoại viện vào hồ sơ học viên (chờ duyệt).
 *     parameters:
 *       - { in: path, name: enrollmentId, required: true, schema: { type: string }, description: Mã ghi danh (DK…) }
 *       - in: path
 *         name: kind
 *         required: true
 *         schema: { type: string, enum: [application_signed, proposal_approved, national_id, degree, license, decision] }
 *         description: Loại hồ sơ
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: Đúng một file PDF / JPG / PNG }
 *     responses:
 *       200:
 *         description: "Đã nộp hồ sơ, chờ Trung tâm Đào tạo xét duyệt — { kind, uploaded_at, files_missing[] }"
 *       400:
 *         description: Loại hồ sơ không hợp lệ (cho đơn này), chưa chọn file, file không phải PDF / JPG / PNG, hoặc mỗi loại quá 1 file
 *       403:
 *         description: Module Đào tạo đang tắt (MODULE_DISABLED)
 *       404:
 *         description: Không tìm thấy đơn đăng ký (không tồn tại hoặc không phải của tôi)
 *       409:
 *         description: Đơn đăng ký đã được xử lý — muốn thay hồ sơ phải liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến
 *       429:
 *         description: Vượt hạn mức dung lượng tải lên trong ngày của tài khoản
 */

/**
 * @swagger
 * /me/department-proposals:
 *   get:
 *     summary: Nhóm đăng ký nội viện theo khoa và lớp mà tôi được xem (để lập Tờ trình cử cán bộ)
 *     tags: [Me]
 *     description: >
 *       Thấy nhóm khi tài khoản là tài khoản dùng chung của khoa, là trưởng khoa của khoa đó, hoặc
 *       có bản khai nằm trong đúng nhóm đó. can_manage = true khi thuộc khoa mình quản lý.
 *       is_me đánh dấu người là chính tôi.
 *     responses:
 *       200:
 *         description: "Mảng { course_id, course_name, program_id, program_name, department_id, department_name, start_date, end_date, can_manage, people: [{ enrollment_id, staff_number, full_name, qualification, enrollment_status, has_proposal (đã nộp Tờ trình đã duyệt hoặc file gộp cũ), is_me }] }"
 *       403:
 *         description: Module Đào tạo đang tắt (MODULE_DISABLED)
 */

/**
 * @swagger
 * /me/department-proposals/document:
 *   get:
 *     summary: Tờ trình (.docx) cử cán bộ của một nhóm (khóa + chương trình + khoa) mà tôi được xem
 *     tags: [Me]
 *     description: >
 *       Trả file Word thay vì JSON (Content-Disposition attachment). Nếu lớp có nhân viên của nhiều khoa
 *       mà tôi được xem thì phải truyền department_id.
 *     parameters:
 *       - { in: query, name: course_id, required: true, schema: { type: string, maxLength: 20 }, description: Mã khóa học }
 *       - { in: query, name: program_id, required: false, schema: { type: string, maxLength: 20 }, description: Mã chương trình (bỏ trống = nhóm không chia chương trình) }
 *       - { in: query, name: department_id, required: false, schema: { type: string, maxLength: 20 }, description: Mã khoa (bắt buộc khi lớp có nhiều khoa) }
 *     responses:
 *       200:
 *         description: File Tờ trình (.docx)
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: Thiếu course_id, hoặc lớp có nhân viên của nhiều khoa nhưng chưa chọn department_id
 *       403:
 *         description: Module Đào tạo đang tắt (MODULE_DISABLED)
 *       404:
 *         description: Không tìm thấy nhóm đăng ký của khoa mà tôi được xem
 */
