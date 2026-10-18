// Tài liệu OpenAPI cho files.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Files
 *   description: Quản lý file đính kèm
 */

/**
 * @swagger
 * /files/{file_id}:
 *   delete:
 *     summary: Xoá file theo ID
 *     tags: [Files]
 *     parameters:
 *       - in: path
 *         name: file_id
 *         required: true
 *         schema:
 *           type: string
 *         example: "FILE001"
 *     responses:
 *       200:
 *         description: Xoá file thành công
 *       404:
 *         description: Không tìm thấy file
 *       401:
 *         description: Chưa xác thực
 */
