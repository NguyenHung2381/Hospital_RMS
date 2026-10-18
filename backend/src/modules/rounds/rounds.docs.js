// Tài liệu OpenAPI cho rounds.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * /research-rounds:
 *   get:
 *     summary: Lấy danh sách đợt nghiên cứu
 *     tags: [ResearchRounds]
 *     responses:
 *       200:
 *         description: Danh sách đợt nghiên cứu
 *   post:
 *     summary: Tạo đợt nghiên cứu mới
 *     tags: [ResearchRounds]
 *     description: Chỉ admin và manager mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, year, round_number, round_type_id, start_date, end_date]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Đợt nghiên cứu Q1 2024"
 *               year:
 *                 type: integer
 *                 example: 2024
 *               round_number:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 9
 *                 example: 1
 *               round_type_id:
 *                 type: string
 *                 example: "RT01"
 *               start_date:
 *                 type: string
 *                 format: date
 *                 example: "2024-01-01"
 *               end_date:
 *                 type: string
 *                 format: date
 *                 example: "2024-03-31"
 *               status:
 *                 type: string
 *                 enum: [draft, open, closed]
 *                 example: "draft"
 *     responses:
 *       201:
 *         description: Tạo đợt nghiên cứu thành công
 *       403:
 *         description: Không có quyền
 */

/**
 * @swagger
 * /research-rounds/{id}:
 *   get:
 *     summary: Lấy chi tiết đợt nghiên cứu
 *     tags: [ResearchRounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         example: "DOT20241"
 *     responses:
 *       200:
 *         description: Chi tiết đợt nghiên cứu
 *       404:
 *         description: Không tìm thấy
 *   put:
 *     summary: Cập nhật đợt nghiên cứu
 *     tags: [ResearchRounds]
 *     description: Chỉ admin và manager mới có quyền
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
 *               status:
 *                 type: string
 *                 enum: [draft, open, closed]
 *               start_date:
 *                 type: string
 *                 format: date
 *               end_date:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xoá đợt nghiên cứu
 *     tags: [ResearchRounds]
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
