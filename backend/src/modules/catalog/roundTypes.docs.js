// Tài liệu OpenAPI cho roundTypes.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * /round-types:
 *   get:
 *     summary: Lấy danh sách loại đợt nghiên cứu
 *     tags: [ResearchRounds]
 *     responses:
 *       200:
 *         description: Danh sách loại đợt
 *   post:
 *     summary: Tạo loại đợt mới
 *     tags: [ResearchRounds]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Nghiên cứu khoa học" }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: Tạo thành công
 */

/**
 * @swagger
 * /round-types/{id}:
 *   get:
 *     summary: Lấy chi tiết loại đợt
 *     tags: [ResearchRounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   put:
 *     summary: Cập nhật loại đợt
 *     tags: [ResearchRounds]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   delete:
 *     summary: Xoá loại đợt
 *     tags: [ResearchRounds]
 *     description: Chỉ admin mới có quyền. Không xoá được khi còn đợt đang dùng.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 */
