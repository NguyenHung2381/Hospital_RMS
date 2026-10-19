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

/**
 * @swagger
 * /staff-licenses/mentors:
 *   get:
 *     summary: Tìm người hướng dẫn thực hành (nhân sự có MNV, người có CCHN xếp trước)
 *     tags: [StaffLicenses]
 *     parameters:
 *       - { in: query, name: search, schema: { type: string }, description: "MNV (khớp đúng), tên hoặc số CCHN" }
 *       - { in: query, name: department_id, schema: { type: string } }
 *       - { in: query, name: licensed_only, schema: { type: string, example: "1" } }
 *       - { in: query, name: limit, schema: { type: integer, default: 20, maximum: 50 } }
 *     responses:
 *       200:
 *         description: "[{ user_id, staff_number, full_name, date_of_birth, gender, qualification, license_no, issued_date, issuing_authority, practice_scope, scope_code, phone, department_id, department_name }]"
 */
