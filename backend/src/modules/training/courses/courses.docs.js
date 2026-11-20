// Tài liệu OpenAPI cho courses.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Courses
 *   description: Quản lý khóa học, đăng ký, phân công giảng viên, lịch học, điểm danh (module Đào tạo)
 */

/**
 * @swagger
 * /courses/enrollments/{enrollmentId}/registration:
 *   get:
 *     summary: Bản khai đăng ký của một lượt ghi danh — để phòng Đào tạo xem trước khi duyệt
 *     tags: [Courses]
 *     description: >
 *       Trả data = null nếu lượt ghi danh chưa có bản khai đăng ký. Số CCCD bị che và
 *       files[].file_url chỉ có khi có quyền trainees:read_sensitive (files = đủ các loại hồ sơ bắt buộc của đối tượng + file gộp cũ nếu có; files_missing = khóa loại còn thiếu). diffs liệt kê các trường người đăng ký
 *       khai khác với hồ sơ học viên. Không có mốc điều kiện nào chặn việc duyệt.
 *     parameters:
 *       - { in: path, name: enrollmentId, required: true, schema: { type: string }, description: Mã ghi danh (DK…) }
 *     responses:
 *       200:
 *         description: "{ enrollment_id, registration_code, source, channel, staff_number, department_id, department_name, trainee_type_name, course_id, course_name, program_name, enrollment_status, snapshot, diffs[], rules_version, rules_accepted_at, declared_true_at, verified_email, email_verified_at, invoice, files[], files_missing[], created_at } hoặc null"
 *       403:
 *         description: Lecturer phạm vi assigned nhưng khóa không được phân công cho mình
 *       404:
 *         description: Không tìm thấy lượt ghi danh
 */

/**
 * @swagger
 * /courses/enrollments/{enrollmentId}/registration/application:
 *   get:
 *     summary: Tải Đơn đăng ký (.docx) của một lượt ghi danh
 *     tags: [Courses]
 *     description: >
 *       Trả file Word thay vì JSON (Content-Disposition attachment). Đơn có số CCCD nên cần thêm quyền
 *       trainees:read_sensitive, nếu không sẽ bị 403.
 *     parameters:
 *       - { in: path, name: enrollmentId, required: true, schema: { type: string }, description: Mã ghi danh (DK…) }
 *     responses:
 *       200:
 *         description: File Đơn đăng ký (.docx)
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 *       403:
 *         description: Thiếu quyền trainees:read_sensitive (dữ liệu có CCCD)
 *       404:
 *         description: Lượt ghi danh không có bản khai đăng ký
 */

/**
 * @swagger
 * /courses/enrollments/{enrollmentId}/registration/dossier:
 *   get:
 *     summary: Thông tin file PDF hồ sơ nộp bổ sung theo cách cũ (kind = dossier, đơn + tờ trình gộp 1 file) của một lượt ghi danh
 *     tags: [Courses]
 *     description: Chỉ trả thông tin file (JSON), không trả nội dung file. Cần quyền trainees:read_sensitive vì hồ sơ có CCCD.
 *     parameters:
 *       - { in: path, name: enrollmentId, required: true, schema: { type: string }, description: Mã ghi danh (DK…) }
 *     responses:
 *       200:
 *         description: "{ file_id, file_name, file_url, mime_type, file_size, uploaded_at }"
 *       403:
 *         description: Thiếu quyền trainees:read_sensitive
 *       404:
 *         description: Chưa có hồ sơ nộp bổ sung
 */

/**
 * @swagger
 * /courses/{id}/proposals:
 *   get:
 *     summary: Nhóm đăng ký nội viện của khóa, gom theo khoa + chương trình (để lập Tờ trình cử cán bộ)
 *     tags: [Courses]
 *     description: >
 *       Mỗi nhóm là một khoa trong một chương trình của khóa. people gồm cả người đã bị từ chối (enrollment_status);
 *       proposed_count chỉ đếm người chưa bị từ chối. Không có CCCD trong dữ liệu.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string }, description: Mã khóa học }
 *     responses:
 *       200:
 *         description: "Mảng { course_id, course_name, start_date, end_date, program_id, program_name, tuition_fee, department_id, department_name, people: [{ enrollment_id, staff_user_id, staff_number, full_name, birth_year, qualification, enrollment_status, proposal_uploaded_at (nộp Tờ trình đã duyệt hoặc file gộp cũ) }], proposed_count }"
 *       403:
 *         description: Phạm vi assigned nhưng khóa không được phân công cho mình
 */

/**
 * @swagger
 * /courses/{id}/proposals/document:
 *   get:
 *     summary: Tờ trình (.docx) cử cán bộ của một khoa trong khóa (và chương trình, nếu có)
 *     tags: [Courses]
 *     description: >
 *       Trả file Word thay vì JSON (Content-Disposition attachment). program_id bỏ trống thì chỉ khớp nhóm
 *       không thuộc chương trình nào. Không cần quyền trainees:read_sensitive vì tờ trình không có CCCD.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string }, description: Mã khóa học }
 *       - { in: query, name: department_id, required: true, schema: { type: string, maxLength: 20 }, description: Mã khoa }
 *       - { in: query, name: program_id, required: false, schema: { type: string, maxLength: 20 }, description: Mã chương trình }
 *     responses:
 *       200:
 *         description: File Tờ trình (.docx)
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: Thiếu department_id
 *       403:
 *         description: Phạm vi assigned nhưng khóa không được phân công cho mình
 *       404:
 *         description: Không có nhân viên của khoa này đăng ký lớp đã chọn
 */

/**
 * @swagger
 * /courses/{id}/enrollments/export-excel:
 *   post:
 *     summary: Xuất danh sách học viên của khóa ra Excel (toàn khóa hoặc mỗi chương trình một sheet)
 *     tags: [Courses]
 *     description: >
 *       Trả file .xlsx thay vì JSON (Content-Disposition attachment). mode='course' cho một sheet kèm cột
 *       Chương trình; mode='program' cho mỗi chương trình một sheet (học viên chưa xếp chương trình vào sheet
 *       "Chưa xếp chương trình"). program_ids bỏ trống là tất cả. statuses mặc định ['approved']. Cột Số CCCD
 *       chỉ có khi người gọi có quyền trainees:read_sensitive. Phạm vi assigned (giảng viên) chỉ xuất được khóa
 *       mình được phân công.
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string }, description: Mã khóa học }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode: { type: string, enum: [course, program], default: course }
 *               program_ids: { type: array, items: { type: string } }
 *               statuses: { type: array, items: { type: string, enum: [pending, approved, rejected, waitlisted] }, default: [approved] }
 *     responses:
 *       200:
 *         description: File .xlsx
 *       403:
 *         description: Phạm vi assigned nhưng khóa không được phân công cho mình
 *       404:
 *         description: Không tìm thấy khóa học
 */
