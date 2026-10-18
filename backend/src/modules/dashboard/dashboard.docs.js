// Tài liệu OpenAPI cho dashboard.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: Thống kê tổng quan dashboard
 */

/**
 * @swagger
 * /dashboard/stats:
 *   get:
 *     summary: Lấy thống kê tổng quan cho dashboard
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Thành công
 */

/**
 * @swagger
 * /dashboard/overview:
 *   get:
 *     summary: Thống kê chung toàn hệ thống (tài khoản, NCKH, Đào tạo, Hội thảo-CME)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /dashboard/export-stats:
 *   post:
 *     summary: Xuất Excel thống kê tổng quan (tổng quan, theo hệ, theo khoa, 1 sheet/khoa)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               year: { type: string, example: "2026" }
 *               sections:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [overview, by_specialty_group, by_department_table, by_department_detail]
 *     responses:
 *       200:
 *         description: File Excel .xlsx nhiều sheet
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 */

/**
 * @swagger
 * /dashboard/training-stats:
 *   get:
 *     summary: Thống kê tổng quan cho Dashboard Đào tạo (KPI, lịch sắp tới, xu hướng đăng ký...)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /dashboard/seminar-stats:
 *   get:
 *     summary: Thống kê Hội thảo - Hội nghị & CME trong năm hiện tại
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */

/**
 * @swagger
 * /dashboard/training-report:
 *   get:
 *     summary: 3 báo cáo Đào tạo (theo khóa+chương trình, DS học viên+kết quả, thống kê tổng)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 */
