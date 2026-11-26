// Tài liệu OpenAPI cho trainees.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Trainees
 *   description: Quản lý học viên (module Đào tạo)
 */

/**
 * @swagger
 * /trainees:
 *   get:
 *     summary: Danh sách học viên
 *     description: |
 *       Mỗi dòng 1 học viên. Các bộ lọc theo khóa (training_type_id, course_id, year,
 *       training_form_id, enrollment_status, progress_status) cùng khớp trên 1 lượt ghi danh
 *       (bỏ lượt bị từ chối); khi có ít nhất 1 bộ lọc này, mỗi dòng kèm lượt ghi danh gần nhất
 *       khớp bộ lọc (course_name, enrollment_status, enrollment_progress_status,
 *       matched_enrollment_count...).
 *     tags: [Trainees]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string } }
 *       - { in: query, name: trainee_type_id, schema: { type: string }, description: Đối tượng học viên }
 *       - { in: query, name: department_id, schema: { type: string } }
 *       - { in: query, name: doc_state, schema: { type: string, enum: [done, pending, missing] } }
 *       - { in: query, name: training_type_id, schema: { type: string }, description: Loại hình đào tạo }
 *       - { in: query, name: course_id, schema: { type: string }, description: Khóa / đợt }
 *       - { in: query, name: year, schema: { type: integer }, description: "Năm của lượt ghi danh (ngày bắt đầu thực hành → khai giảng → đăng ký)" }
 *       - { in: query, name: training_form_id, schema: { type: string }, description: Hình thức học }
 *       - { in: query, name: enrollment_status, schema: { type: string, enum: [pending, approved, waitlisted] } }
 *       - { in: query, name: progress_status, schema: { type: string, enum: [in_progress, completed, dropped] } }
 *     responses:
 *       200:
 *         description: "{ data[], pagination, type_counts } — CCCD bị che nếu không có quyền trainees:read_sensitive; type_counts đếm theo loại hình với mọi bộ lọc trừ loại hình"
 */

/**
 * @swagger
 * /trainees/filter-options:
 *   get:
 *     summary: Lựa chọn cho thanh lọc danh sách học viên
 *     tags: [Trainees]
 *     parameters:
 *       - { in: query, name: training_type_id, schema: { type: string }, description: Chỉ khóa / năm của loại hình này }
 *     responses:
 *       200:
 *         description: "{ courses[] (khóa có học viên, kèm trainee_count), years[], training_forms[] }"
 */

/**
 * @swagger
 * /trainees/import-excel:
 *   post:
 *     summary: Nhập danh sách học viên hàng loạt từ file Excel (tự dò tiêu đề cột)
 *     tags: [Trainees]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               dry_run: { type: string, example: "1" }
 *     responses:
 *       200:
 *         description: "dry_run: { rows[], summary, warnings[] }; commit: { inserted, warnings[] }"
 */

/**
 * @swagger
 * /trainees/grant-accounts:
 *   post:
 *     summary: Cấp tài khoản đăng nhập cho học viên (tên đăng nhập NVA_0001, mật khẩu tạm ngẫu nhiên, bắt đổi ở lần đăng nhập đầu)
 *     tags: [Trainees]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [trainee_ids]
 *             properties:
 *               trainee_ids:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 500
 *                 items: { type: string }
 *                 description: Học viên cần cấp (bắt buộc). Hồ sơ đã xóa / ngừng hoạt động / đã có tài khoản bị bỏ qua.
 *     responses:
 *       200:
 *         description: Cấp tài khoản thành công (kèm danh sách bị bỏ qua và lý do)
 */

/**
 * @swagger
 * /trainees/{id}:
 *   get:
 *     summary: Chi tiết học viên
 *     tags: [Trainees]
 */

/**
 * @swagger
 * /trainees:
 *   post:
 *     summary: Tạo học viên mới
 *     tags: [Trainees]
 */

/**
 * @swagger
 * /trainees/{id}:
 *   put:
 *     summary: Cập nhật học viên
 *     tags: [Trainees]
 */

/**
 * @swagger
 * /trainees/{id}:
 *   delete:
 *     summary: Xóa học viên
 *     tags: [Trainees]
 */

/**
 * @swagger
 * /trainees/{id}/enrollments:
 *   get:
 *     summary: Danh sách khóa học / chương trình đào tạo học viên đã đăng ký
 *     tags: [Trainees]
 */

/**
 * @swagger
 * /trainees/{id}/progress:
 *   get:
 *     summary: Tiến độ thực tế của học viên so với chương trình hiện tại (bài lý thuyết, vòng thực hành, nhịp học)
 *     tags: [Trainees]
 */

/**
 * @swagger
 * /trainees/{id}/documents:
 *   get:
 *     summary: Hồ sơ đính kèm của học viên (CCCD, bằng cấp...) — dữ liệu nhạy cảm
 *     tags: [Trainees]
 *   post:
 *     summary: Tải lên hồ sơ học viên
 *     tags: [Trainees]
 */
