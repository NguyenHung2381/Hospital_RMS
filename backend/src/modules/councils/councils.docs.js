// Tài liệu OpenAPI cho councils.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Councils
 *   description: Quản lý hội đồng chấm đề cương
 */

/**
 * @swagger
 * /councils:
 *   get:
 *     summary: Lấy danh sách hội đồng
 *     tags: [Councils]
 *     parameters:
 *       - in: query
 *         name: round_id
 *         schema: { type: string, example: "DOT20261" }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, finalized] }
 *     responses:
 *       200:
 *         description: Danh sách hội đồng
 */

/**
 * @swagger
 * /councils/export-excel:
 *   post:
 *     summary: Xuất Excel lịch bảo vệ đề cương của một đợt (theo mẫu chuẩn bệnh viện)
 *     tags: [Councils]
 *     description: >
 *       Mỗi dòng một đề tài kèm nhóm nghiên cứu, 5 ghế hội đồng (đã áp ghế thay
 *       thế theo đề tài), phiên bảo vệ và địa điểm.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [round_id]
 *             properties:
 *               round_id: { type: string, example: "DOT20261" }
 *               fileName: { type: string, example: "lich-bao-ve-2026" }
 *               title: { type: string }
 *               subtitle: { type: string, example: "(Kèm theo Thông báo số 38/TB-BV ngày 16/01/2026)" }
 *     responses:
 *       200:
 *         description: File .xlsx
 *       404:
 *         description: Đợt không tồn tại hoặc chưa có đề tài gán hội đồng
 */

/**
 * @swagger
 * /councils/import-excel:
 *   post:
 *     summary: Nhập hội đồng từ file Excel lịch bảo vệ (mỗi dòng 1 đề tài, 3 cột hội đồng multi-line)
 *     tags: [Councils]
 *     description: >
 *       Gom các dòng cùng bộ 5 ghế thành hội đồng, match người với nhân viên /
 *       danh bạ ngoài viện theo tên+khoa, match đề tài có sẵn trong đợt theo tên
 *       rồi gán kèm phiên sáng/chiều. Gửi dry_run=1 để xem trước không ghi dữ liệu.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [round_id, file]
 *             properties:
 *               round_id: { type: string, example: "DOT20261" }
 *               dry_run: { type: string, enum: ["0", "1"] }
 *               file: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: "dry_run: preview councils[]; commit: { councils_created, topics_assigned, warnings[] }"
 *       400:
 *         description: File không hợp lệ hoặc thiếu cột bắt buộc
 */

/**
 * @swagger
 * /councils/my-progress:
 *   get:
 *     summary: Đề tài tôi cần đánh giá tiến độ (mọi hội đồng tôi có ghế, kèm đánh giá cả hội đồng và file đánh giá)
 *     tags: [Councils]
 *     responses:
 *       200:
 *         description: Danh sách đề tài kèm my_role, reviews[], evaluation_files[]
 */

/**
 * @swagger
 * /councils/my-progress/count:
 *   get:
 *     summary: Số đề tài tôi có ghế hội đồng (0 = không phải thành viên hội đồng nào)
 *     tags: [Councils]
 *     responses:
 *       200:
 *         description: "{ count: number }"
 */

/**
 * @swagger
 * /councils/progress/{topic_id}/review:
 *   put:
 *     summary: Lưu đánh giá tiến độ của tôi cho một đề tài (upsert)
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               progress_percent: { type: integer, minimum: 0, maximum: 100, nullable: true }
 *               rating: { type: string, enum: [on_track, behind, at_risk], nullable: true }
 *               comment: { type: string, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Đã lưu
 *       403:
 *         description: Không có ghế trong hội đồng đánh giá đề tài này
 */

/**
 * @swagger
 * /councils/progress/{topic_id}/files:
 *   post:
 *     summary: Thư ký hội đồng upload file đánh giá tiến độ cho một đề tài
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201:
 *         description: Upload thành công
 *       403:
 *         description: Chỉ thư ký hội đồng được upload
 * /councils/progress/{topic_id}/files/{file_id}:
 *   delete:
 *     summary: Thư ký hội đồng xóa một file đánh giá tiến độ
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: file_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Đã xóa
 */

/**
 * @swagger
 * /councils/progress/{topic_id}/result:
 *   put:
 *     summary: Chủ tịch hội đồng chốt kết luận cuối cùng + nhận xét chung cho một đề tài
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               conclusion: { type: string, enum: [pass, fail, revise], nullable: true }
 *               general_comment: { type: string, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: Đã lưu
 *       403:
 *         description: Chỉ chủ tịch hội đồng được chốt kết luận
 */

/**
 * @swagger
 * /councils/progress/{topic_id}/minutes:
 *   post:
 *     summary: Thư ký hội đồng upload biên bản họp cho một đề tài
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files: { type: array, items: { type: string, format: binary } }
 *     responses:
 *       201:
 *         description: Upload thành công
 *       403:
 *         description: Chỉ thư ký hội đồng được upload
 * /councils/progress/{topic_id}/minutes/{file_id}:
 *   delete:
 *     summary: Thư ký hội đồng xóa một biên bản
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: file_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Đã xóa
 */

/**
 * @swagger
 * /councils/progress/{topic_id}/comment-image:
 *   post:
 *     summary: Chèn ảnh vào nhận xét tiến độ/kết luận (ai có ghế trong hội đồng đề tài đều dùng được)
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201:
 *         description: Đã tải ảnh lên, trả về URL để chèn vào nhận xét
 */

/**
 * @swagger
 * /councils/unassigned-topics:
 *   get:
 *     summary: Lấy đề tài chưa gán hội đồng trong một đợt (dùng để gán tay)
 *     tags: [Councils]
 *     parameters:
 *       - in: query
 *         name: round_id
 *         required: true
 *         schema: { type: string, example: "DOT20261" }
 *     responses:
 *       200:
 *         description: Danh sách đề tài chưa gán
 */

/**
 * @swagger
 * /councils/auto-assign:
 *   post:
 *     summary: Tự động phân công hội đồng cho một hệ chuyên môn của một đợt
 *     tags: [Councils]
 *     description: >
 *       Gom các đề tài đã duyệt, chưa gán hội đồng, thuộc một hệ chuyên môn
 *       thành các cụm ~target_size đề tài, tạo hội đồng ở trạng thái draft cho
 *       mỗi cụm kèm 5 ghế (ưu tiên người đủ điều kiện, đúng hệ, không trùng
 *       khoa với đề tài, cân tải), gán đề tài và chia buổi sáng/chiều. Ghế
 *       thay thế theo từng đề tài vẫn cần gán tay sau đó. Gọi lại nhiều lần
 *       (mỗi lần 1 hệ) để phủ hết một đợt.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [round_id, specialty_group]
 *             properties:
 *               round_id: { type: string, example: "DOT20261" }
 *               specialty_group: { type: string, example: "Tim mạch" }
 *               target_size: { type: integer, minimum: 6, maximum: 10, default: 8 }
 *     responses:
 *       200:
 *         description: "Kết quả, vd: { councils_created, topics_assigned, warnings[] }"
 */

/**
 * @swagger
 * /councils/{id}:
 *   get:
 *     summary: Lấy chi tiết hội đồng (kèm 5 thành viên và đề tài đã gán)
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Chi tiết hội đồng
 *       404:
 *         description: Không tìm thấy
 */

/**
 * @swagger
 * /councils:
 *   post:
 *     summary: Tạo hội đồng mới
 *     tags: [Councils]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [round_id, name]
 *             properties:
 *               round_id: { type: string, example: "DOT20261" }
 *               name: { type: string, example: "Hội đồng 1 - Khoa Bỏng" }
 *               specialty_group: { type: string, example: "Ngoại CT-Bỏng-Cột sống" }
 *               location: { type: string, example: "Hội trường 3" }
 *               defense_date: { type: string, format: date }
 *     responses:
 *       201:
 *         description: Tạo thành công
 */

/**
 * @swagger
 * /councils/{id}:
 *   put:
 *     summary: Cập nhật hội đồng
 *     tags: [Councils]
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
 *               specialty_group: { type: string }
 *               location: { type: string }
 *               defense_date: { type: string, format: date }
 *               status: { type: string, enum: [draft, finalized] }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xoá hội đồng (tự động bỏ gán đề tài và xoá thành viên)
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xoá thành công
 */

/**
 * @swagger
 * /councils/{id}/members:
 *   get:
 *     summary: Lấy thành phần hội đồng
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách thành viên (chủ tịch/thư ký/phản biện 1/phản biện 2/thành viên)
 *   post:
 *     summary: Thêm người vào một ghế của hội đồng
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, role]
 *             properties:
 *               user_id: { type: string, example: "NV0123" }
 *               role:
 *                 type: string
 *                 enum: [chairman, secretary, reviewer1, reviewer2, member]
 *     responses:
 *       201:
 *         description: Thêm thành công
 *       409:
 *         description: Ghế đã có người hoặc người này đã có ghế khác trong hội đồng
 */

/**
 * @swagger
 * /councils/{id}/eligible-users:
 *   get:
 *     summary: Danh sách người có thể tham gia hội đồng (để chọn vào ghế)
 *     tags: [Councils]
 *     description: >
 *       Trả về tài khoản cá nhân đang hoạt động, chưa có ghế trong hội đồng này
 *       (loại tài khoản khoa dùng chung). Người là tác giả hoặc cùng khoa với đề tài
 *       đã gán cho hội đồng vẫn được trả về kèm cờ is_author_conflict/is_dept_conflict
 *       để cảnh báo.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: search
 *         schema: { type: string, description: "Tìm theo tên, tài khoản hoặc mã cán bộ" }
 *     responses:
 *       200:
 *         description: Tối đa 20 người phù hợp
 */

/**
 * @swagger
 * /councils/{id}/members/{member_id}:
 *   put:
 *     summary: Đổi người hoặc vai trò của một ghế
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: member_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id: { type: string }
 *               role:
 *                 type: string
 *                 enum: [chairman, secretary, reviewer1, reviewer2, member]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *   delete:
 *     summary: Xoá một ghế khỏi hội đồng
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: member_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Xoá thành công
 */

/**
 * @swagger
 * /councils/{id}/topics:
 *   get:
 *     summary: Lấy danh sách đề tài đã gán cho hội đồng
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Danh sách đề tài
 *   post:
 *     summary: Gán (hàng loạt) đề tài vào hội đồng
 *     tags: [Councils]
 *     description: Chỉ gán được đề tài cùng đợt nghiên cứu với hội đồng.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [topic_ids]
 *             properties:
 *               topic_ids:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["NCKH_2026_001", "NCKH_2026_002"]
 *     responses:
 *       200:
 *         description: "Số đề tài đã gán thành công, vd: { assigned: 2 }"
 */

/**
 * @swagger
 * /councils/{id}/topics/{topic_id}:
 *   delete:
 *     summary: Bỏ gán một đề tài khỏi hội đồng
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Bỏ gán thành công
 *   patch:
 *     summary: Đặt buổi bảo vệ (sáng/chiều) cho đề tài đã gán vào hội đồng
 *     tags: [Councils]
 *     description: Một hội đồng chấm cả hai buổi trong ngày; buổi gắn với từng đề tài.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               session: { type: string, enum: [morning, afternoon], nullable: true }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */

/**
 * @swagger
 * /councils/{id}/topics/{topic_id}/substitute:
 *   put:
 *     summary: Đặt ghế thay thế cho một đề tài (thay người ngồi một ghế khi chấm đề tài đó)
 *     tags: [Councils]
 *     description: >
 *       Hội đồng giữ 5 ghế gốc; với một đề tài cụ thể có thể thay người của một ghế
 *       (thành viên gốc là tác giả đề tài, hoặc cần chuyên gia đúng ngành phản biện).
 *       Gọi lại với cùng vai sẽ ghi đè người thay.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, user_id]
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [chairman, secretary, reviewer1, reviewer2, member]
 *               user_id: { type: string, example: "NV0123" }
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Đề tài không thuộc hội đồng
 * /councils/{id}/topics/{topic_id}/substitute/{role}:
 *   delete:
 *     summary: Xóa ghế thay thế của một đề tài (trở về người ngồi ghế gốc)
 *     tags: [Councils]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: topic_id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: role
 *         required: true
 *         schema: { type: string, enum: [chairman, secretary, reviewer1, reviewer2, member] }
 *     responses:
 *       200:
 *         description: Xóa thành công
 */
