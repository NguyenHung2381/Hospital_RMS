// Tài liệu OpenAPI cho externalReviewers.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * /external-reviewers:
 *   get:
 *     summary: Lấy danh sách người ngoài viện tham gia hội đồng
 *     tags: [Councils]
 *     responses:
 *       200:
 *         description: Danh sách người ngoài viện
 *   post:
 *     summary: Thêm người ngoài viện mới
 *     tags: [Councils]
 *     description: Chỉ admin mới có quyền
 *     responses:
 *       201:
 *         description: Tạo thành công
 */
