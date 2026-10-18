// Tài liệu OpenAPI cho securityEvents.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: SecurityEvents
 *   description: Nhật ký sự kiện bảo mật — khoá tài khoản, xoay phiên đăng nhập, truy cập dữ liệu nhạy cảm (admin only)
 */

/**
 * @swagger
 * /security-events:
 *   get:
 *     summary: Lấy danh sách sự kiện bảo mật (keyset pagination theo id)
 *     tags: [SecurityEvents]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 50 }
 *       - in: query
 *         name: cursor
 *         description: id của dòng cuối trang trước — để trống lấy trang đầu
 *         schema: { type: string }
 *       - in: query
 *         name: event_type
 *         schema: { type: string, example: login_locked }
 *       - in: query
 *         name: actor_id
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách sự kiện bảo mật
 */
