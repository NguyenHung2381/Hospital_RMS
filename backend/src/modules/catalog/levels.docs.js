// Tài liệu OpenAPI cho levels.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * /levels:
 *   get:
 *     summary: Lấy danh sách cấp độ
 *     tags: [Levels]
 *     responses:
 *       200:
 *         description: Danh sách cấp độ
 *   post:
 *     summary: Tạo cấp độ mới
 *     tags: [Levels]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "Cấp cơ sở" }
 *     responses:
 *       201:
 *         description: Tạo thành công
 */

/**
 * @swagger
 * /levels/{id}:
 *   get:
 *     summary: Lấy chi tiết cấp độ
 *     tags: [Levels]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết cấp độ
 *   put:
 *     summary: Cập nhật cấp độ
 *     tags: [Levels]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xoá cấp độ
 *     tags: [Levels]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xoá thành công
 */
