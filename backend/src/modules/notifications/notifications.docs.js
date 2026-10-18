// Tài liệu OpenAPI cho notifications.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: Thông báo người dùng
 */

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Lấy danh sách thông báo của người dùng hiện tại
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *       - in: query
 *         name: unread_only
 *         schema: { type: boolean, example: false }
 *     responses:
 *       200:
 *         description: Danh sách thông báo
 */

/**
 * @swagger
 * /notifications/unread-count:
 *   get:
 *     summary: Lấy số thông báo chưa đọc
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: '{ count: number }'
 */

/**
 * @swagger
 * /notifications/read-all:
 *   put:
 *     summary: Đánh dấu tất cả thông báo đã đọc
 *     tags: [Notifications]
 *     responses:
 *       200:
 *         description: Thành công
 */

/**
 * @swagger
 * /notifications/{id}/read:
 *   put:
 *     summary: Đánh dấu một thông báo đã đọc
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Thành công
 *       404:
 *         description: Không tìm thấy thông báo
 */

/**
 * @swagger
 * /notifications/send:
 *   post:
 *     summary: Gửi thông báo đến người dùng (admin only)
 *     tags: [Notifications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, title, target_type]
 *             properties:
 *               type: { type: string }
 *               title: { type: string }
 *               message: { type: string }
 *               ref_id: { type: string }
 *               ref_type: { type: string }
 *               target_type:
 *                 type: string
 *                 enum: [all, department, users]
 *               target_ids:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Đã gửi
 */

/**
 * @swagger
 * /notifications/admin:
 *   get:
 *     summary: Lấy toàn bộ thông báo trong hệ thống (admin only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách thông báo
 */

/**
 * @swagger
 * /notifications/admin/{batchKey}/recipients:
 *   get:
 *     summary: Lấy danh sách người nhận của 1 lượt gửi (admin only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: batchKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách người nhận
 */

/**
 * @swagger
 * /notifications/admin/batch/{batchKey}:
 *   delete:
 *     summary: Xoá cả 1 lượt gửi thông báo (admin only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: batchKey
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Đã xoá
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Xoá thông báo (admin only)
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Đã xoá
 *       404:
 *         description: Không tìm thấy
 */
