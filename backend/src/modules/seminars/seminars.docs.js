// Tài liệu OpenAPI cho seminars.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   - name: Seminars
 *     description: Quản lý Hội thảo, Hội nghị & cấp CME (độc lập với NCKH)
 */

/**
 * @swagger
 * /seminars/stats:
 *   get:
 *     summary: Thống kê hội thảo/hội nghị do bệnh viện tổ chức (mẫu file 1.4)
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 */

/**
 * @swagger
 * /seminars/cme/stats:
 *   get:
 *     summary: Thống kê cấp CME theo năm
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 */

/**
 * @swagger
 * /seminars/cme/register:
 *   get:
 *     summary: Sổ cấp CME của một năm (mọi lượt cấp, sắp theo số quyết định)
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 */

/**
 * @swagger
 * /seminars/cme/register/{year}:
 *   put:
 *     summary: Chỉnh "số cuối đã cấp" của sổ CME năm đó
 *     tags: [Seminars]
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [last_seq]
 *             properties:
 *               last_seq: { type: integer, example: 330 }
 */

/**
 * @swagger
 * /seminars:
 *   get:
 *     summary: Danh sách hội thảo/hội nghị
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [external, hosted] }
 *       - in: query
 *         name: event_type
 *         schema: { type: string }
 *       - in: query
 *         name: year
 *         schema: { type: integer }
 *       - in: query
 *         name: grants_cme
 *         schema: { type: string, enum: ['1'] }
 *   post:
 *     summary: Tạo hội thảo/hội nghị mới
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title: { type: string }
 *               event_type: { type: string, enum: [conference, sci_seminar, intl_seminar, sci_conference, training, other] }
 *               scope: { type: string, enum: [external, hosted] }
 *               location: { type: string }
 *               start_date: { type: string, format: date }
 *               end_date: { type: string, format: date }
 *               date_text: { type: string }
 *               event_year: { type: integer }
 *               grants_cme: { type: boolean }
 *               cme_default_credits: { type: number }
 */

/**
 * @swagger
 * /seminars/export-excel:
 *   post:
 *     summary: Xuất Excel danh sách hội thảo/hội nghị theo bộ lọc của trang danh sách
 *     tags: [Seminars]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               search: { type: string }
 *               scope: { type: string, enum: [external, hosted] }
 *               event_type: { type: string }
 *               year: { type: integer }
 *               grants_cme: { type: string, enum: ["1"] }
 *     responses:
 *       200: { description: File .xlsx }
 * /seminars/import-template:
 *   post:
 *     summary: Tải file mẫu nhập danh sách hội thảo/hội nghị
 *     tags: [Seminars]
 *     responses:
 *       200: { description: File .xlsx }
 * /seminars/import-excel:
 *   post:
 *     summary: Nhập danh sách hội thảo/hội nghị từ Excel (dry_run=1 để xem trước)
 *     tags: [Seminars]
 *     description: >
 *       Tự dò dòng tiêu đề (bắt buộc cột "Tên hội thảo/hội nghị"). Bỏ qua dòng
 *       trùng tên + năm với dữ liệu đã có và dòng có lỗi dữ liệu.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               dry_run: { type: string, enum: ["0", "1"] }
 *               file: { type: string, format: binary }
 */

/**
 * @swagger
 * /seminars/cme-requirements:
 *   get:
 *     summary: Ngưỡng tín chỉ CME theo năm (toàn viện hoặc theo khoa/phòng)
 *     tags: [Seminars]
 *   post:
 *     summary: Thêm ngưỡng tín chỉ CME
 *     tags: [Seminars]
 */

/**
 * @swagger
 * /seminars/cme-compliance:
 *   get:
 *     summary: Danh sách nhân sự chưa đạt ngưỡng tín chỉ CME của năm
 *     tags: [Seminars]
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 */

/**
 * @swagger
 * /seminars/cme-personal/{userId}/export-excel:
 *   post:
 *     summary: Xuất phiếu theo dõi tín chỉ CME của 1 nhân sự (Excel, kèm tổng hợp 5 năm)
 *     tags: [Seminars]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               year: { type: integer }
 */

/**
 * @swagger
 * /seminars/{id}:
 *   get:
 *     summary: Chi tiết hội thảo + danh sách người tham dự
 *     tags: [Seminars]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *   put:
 *     summary: Cập nhật hội thảo/hội nghị
 *     tags: [Seminars]
 *   delete:
 *     summary: Xoá hội thảo/hội nghị (chặn nếu đã cấp số CME)
 *     tags: [Seminars]
 */

/**
 * @swagger
 * /seminars/{id}/export-excel:
 *   post:
 *     summary: Xuất Excel một hội nghị — thông tin, người tham dự, bài học (chương trình)
 *     tags: [Seminars]
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
 *               parts:
 *                 type: array
 *                 items: { type: string, enum: [participants, agenda] }
 *                 description: Để trống = xuất cả hai
 *     responses:
 *       200: { description: File .xlsx }
 */

/**
 * @swagger
 * /seminars/{id}/participants:
 *   get:
 *     summary: Danh sách người tham dự
 *     tags: [Seminars]
 *   post:
 *     summary: Thêm người tham dự
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [full_name]
 *             properties:
 *               full_name: { type: string }
 *               user_id: { type: string }
 *               source: { type: string, enum: [internal, external] }
 *               participation_type: { type: string, enum: [attendee, speaker, chair, organizer, trainee] }
 */

/**
 * @swagger
 * /seminars/{id}/participants/import-excel:
 *   post:
 *     summary: Nhập danh sách người tham dự từ file Excel (tự dò tiêu đề cột)
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file: { type: string, format: binary, description: File .xlsx }
 *               dry_run: { type: string, enum: ['0', '1'], description: '1 = chỉ xem trước' }
 *               issue_cme: { type: string, enum: ['0', '1'], description: '1 = cấp số CME ngay sau khi nhập' }
 *               credits_by_role: { type: string, description: 'JSON { attendee: 3, speaker: 6, ... } — số tín chỉ cho dòng để trống cột Số tín chỉ, theo vai trò' }
 *     responses:
 *       200:
 *         description: "dry_run: { rows[], summary, warnings[] }; commit: { inserted, cme_issued, cme_from, cme_to, cme_year, warnings[] }"
 *       400:
 *         description: File không hợp lệ hoặc thiếu cột bắt buộc
 */

/**
 * @swagger
 * /seminars/{id}/participants/issue-cme:
 *   post:
 *     summary: Cấp số quyết định CME cho một/nhiều người (tuần tự theo năm)
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               participant_ids: { type: array, items: { type: string } }
 *               year: { type: integer, description: "Mặc định = năm sự kiện" }
 */

/**
 * @swagger
 * /seminars/{id}/participants/bulk-cme:
 *   post:
 *     summary: Đổi trạng thái CME hàng loạt (issued ↔ signed)
 *     tags: [Seminars]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [participant_ids, status]
 *             properties:
 *               participant_ids: { type: array, items: { type: string } }
 *               status: { type: string, enum: [issued, signed] }
 */
