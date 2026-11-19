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
 * /me/course-registrations:
 *   get:
 *     summary: Đơn đăng ký khóa đào tạo liên tục của tôi (nội viện / ngoại viện, mới nhất trước)
 *     tags: [Me]
 *     description: >
 *       Chỉ liệt kê bản khai có staff_user_id là tài khoản đang đăng nhập. Mỗi mục kèm việc còn phải
 *       làm (todo) và việc đang chờ Trung tâm Đào tạo (waiting); đơn đã bị từ chối thì cả hai rỗng.
 *       Nội viện chưa nộp hồ sơ bổ sung thì needs_dossier = true.
 *     responses:
 *       200:
 *         description: "Mảng { enrollment_id, registration_code, source, channel, course_id, course_name, program_id, program_name, department_id, enrollment_status, created_at, needs_dossier, dossier_uploaded_at, dossier: { file_name, file_url } | null, checks: { id_checked, degree_checked, proposal_checked }, todo[], waiting[] }"
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
 * /me/course-registrations/{enrollmentId}/dossier:
 *   post:
 *     summary: Nộp (thay) hồ sơ PDF bổ sung — đơn và tờ trình đã duyệt gộp một file
 *     tags: [Me]
 *     description: >
 *       Chỉ bản khai nội viện của chính mình mới nộp được. Quyền kiểm tra trước khi nhận file;
 *       file phải là PDF và được ghi vào thư mục của lượt ghi danh.
 *     parameters:
 *       - { in: path, name: enrollmentId, required: true, schema: { type: string }, description: Mã ghi danh (DK…) }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: Đúng một file PDF }
 *     responses:
 *       200:
 *         description: "Đã nộp hồ sơ, chờ Trung tâm Đào tạo đối chiếu — { uploaded: true, dossier_uploaded_at }"
 *       400:
 *         description: Chưa chọn file, file không phải PDF, hoặc bản khai không phải nội viện
 *       403:
 *         description: Module Đào tạo đang tắt (MODULE_DISABLED)
 *       404:
 *         description: Không tìm thấy đơn đăng ký (không tồn tại hoặc không phải của tôi)
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
 *         description: "Mảng { course_id, course_name, program_id, program_name, department_id, department_name, start_date, end_date, can_manage, people: [{ enrollment_id, staff_number, full_name, qualification, enrollment_status, has_dossier, proposal_checked, is_me }] }"
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
