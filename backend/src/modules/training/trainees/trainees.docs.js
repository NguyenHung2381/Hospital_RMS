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
 *     tags: [Trainees]
 *     responses:
 *       200:
 *         description: Danh sách học viên (CCCD bị che nếu không có quyền trainees:read_sensitive)
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
 *     summary: Cấp tài khoản đăng nhập cho học viên (mật khẩu tạm ngẫu nhiên, bắt đổi ở lần đăng nhập đầu)
 *     tags: [Trainees]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trainee_ids:
 *                 type: array
 *                 items: { type: string }
 *                 description: Bỏ trống = cấp cho mọi học viên chưa có tài khoản
 *     responses:
 *       200:
 *         description: Cấp tài khoản thành công (kèm danh sách bị bỏ qua nếu có lỗi)
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
 *     summary: Xoá học viên
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
