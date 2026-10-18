// Tài liệu OpenAPI cho departments.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * /departments:
 *   get:
 *     summary: Lấy danh sách khoa
 *     tags: [Departments]
 *     responses:
 *       200:
 *         description: Danh sách khoa
 *   post:
 *     summary: Tạo khoa mới
 *     tags: [Departments]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code, abbreviation]
 *             properties:
 *               name: { type: string, example: "Khoa Nội tổng hợp" }
 *               code: { type: string, example: "NTTQ" }
 *               abbreviation: { type: string, example: "NTH" }
 *     responses:
 *       201:
 *         description: Tạo thành công
 *       403:
 *         description: Không có quyền
 */

/**
 * @swagger
 * /departments/{id}:
 *   get:
 *     summary: Lấy chi tiết khoa
 *     tags: [Departments]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: "DVNTTQ"
 *     responses:
 *       200:
 *         description: Chi tiết khoa
 *       404:
 *         description: Không tìm thấy
 *   put:
 *     summary: Cập nhật khoa
 *     tags: [Departments]
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
 *               code: { type: string }
 *               abbreviation: { type: string }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xoá khoa
 *     tags: [Departments]
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
