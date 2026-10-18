// Tài liệu OpenAPI cho activityLogs.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: ActivityLogs
 *   description: Nhật ký tác động của người dùng lên hệ thống (admin only)
 */

/**
 * @swagger
 * /activity-logs:
 *   get:
 *     summary: Lấy danh sách log tác động (keyset pagination, không dùng OFFSET)
 *     tags: [ActivityLogs]
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer, example: 50 } }
 *       - in: query
 *         name: cursor
 *         description: trường ts của dòng cuối trang trước — để trống lấy trang đầu
 *         schema: { type: string }
 *       - { in: query, name: from, description: 'ISO date-time hoặc epoch ms', schema: { type: string } }
 *       - { in: query, name: to, description: 'ISO date-time hoặc epoch ms', schema: { type: string } }
 *       - { in: query, name: actor, description: 'Tìm theo mã / username / họ tên', schema: { type: string } }
 *       - { in: query, name: actor_id, schema: { type: string } }
 *       - { in: query, name: method, description: 'Nhiều giá trị phân cách dấu phẩy', schema: { type: string, example: POST } }
 *       - { in: query, name: action, description: 'view,create,update,delete,execute,login,login_failed,logout,auth', schema: { type: string } }
 *       - { in: query, name: module, description: 'vd topics,users', schema: { type: string } }
 *       - { in: query, name: status, schema: { type: string, enum: [2xx, 3xx, 4xx, 5xx, error] } }
 *       - { in: query, name: ip, schema: { type: string } }
 *       - { in: query, name: search, description: 'Tìm trong đường dẫn, mô tả, nội dung gửi lên, lỗi', schema: { type: string } }
 *       - { in: query, name: min_duration, description: 'Chỉ lấy request xử lý >= N ms', schema: { type: number } }
 *       - { in: query, name: exclude_views, description: '1 = ẩn thao tác xem (GET)', schema: { type: string } }
 *     responses:
 *       200:
 *         description: Danh sách log
 */

/**
 * @swagger
 * /activity-logs/stats:
 *   get:
 *     summary: Thống kê + phiên truy cập theo cùng bộ lọc như danh sách (mặc định 7 ngày gần nhất)
 *     tags: [ActivityLogs]
 *     responses:
 *       200:
 *         description: Tổng hợp, top người dùng / module / endpoint chậm, danh sách phiên
 */
