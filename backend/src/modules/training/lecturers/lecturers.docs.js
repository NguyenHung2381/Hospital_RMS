// Tài liệu OpenAPI cho lecturers.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Lecturers
 *   description: Quản lý giảng viên (module Đào tạo)
 */

/**
 * @swagger
 * /lecturers/from-staff:
 *   post:
 *     summary: Thêm giảng viên từ nhân sự (lấy tên, liên hệ, ngày sinh từ users; chuyên môn từ CCHN)
 *     tags: [Lecturers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_ids: { type: array, items: { type: string }, maxItems: 200 }
 *     responses:
 *       201:
 *         description: "{ created: Lecturer[], skipped: [{ user_id, full_name, reason }] }"
 */
