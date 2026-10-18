// Tài liệu OpenAPI cho staffLicenses.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: StaffLicenses
 *   description: Chứng chỉ hành nghề (CCHN) & hồ sơ chuyên môn nhân sự
 */

/**
 * @swagger
 * /staff-licenses/import-excel:
 *   post:
 *     summary: Cập nhật CCHN hàng loạt từ file "Danh sách người hành nghề" (khớp MNV)
 *     tags: [StaffLicenses]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file: { type: string, format: binary }
 *               dry_run: { type: string, example: "1" }
 *     responses:
 *       200:
 *         description: "dry_run: { summary, rows[], skipped[], warnings[] }; commit: { summary, written, skipped[], warnings[] }"
 */
