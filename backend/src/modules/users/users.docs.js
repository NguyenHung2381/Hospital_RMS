// Tài liệu OpenAPI cho users.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Quản lý người dùng
 */

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Lấy thông tin người dùng hiện tại
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Thông tin tài khoản đang đăng nhập
 *       401:
 *         description: Chưa xác thực
 */

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Tự cập nhật thông tin tài khoản (hiện chỉ họ tên)
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 */

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Lấy danh sách người dùng
 *     tags: [Users]
 *     description: Chỉ admin và manager mới có quyền truy cập
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *     responses:
 *       200:
 *         description: Danh sách người dùng
 *       403:
 *         description: Không có quyền truy cập
 */

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Lấy thông tin một người dùng theo ID
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "USR001"
 *     responses:
 *       200:
 *         description: Thông tin người dùng
 *       404:
 *         description: Không tìm thấy người dùng
 */

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Tạo người dùng mới
 *     tags: [Users]
 *     description: Chỉ admin mới có quyền
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, full_name]
 *             properties:
 *               username:
 *                 type: string
 *                 example: "nguyen.van.a"
 *               password:
 *                 type: string
 *                 minLength: 10
 *                 example: "Tamthoi2026x"
 *               full_name:
 *                 type: string
 *                 example: "Nguyễn Văn A"
 *     responses:
 *       201:
 *         description: Tạo người dùng thành công
 *       403:
 *         description: Không có quyền
 */

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Cập nhật thông tin người dùng
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *                 example: "Nguyễn Văn B"
 *     responses:
 *       200:
 *         description: Cập nhật thành công
 *       404:
 *         description: Không tìm thấy người dùng
 */

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Xoá người dùng
 *     tags: [Users]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Xoá thành công
 *       403:
 *         description: Không có quyền
 *       404:
 *         description: Không tìm thấy người dùng
 */

/**
 * @swagger
 * /users/{id}/reset-password:
 *   post:
 *     summary: Đặt lại mật khẩu người dùng
 *     tags: [Users]
 *     description: Chỉ admin mới có quyền
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Bỏ trống new_password để server tự sinh mật khẩu tạm (trả về trong data.temporary_password)
 *             properties:
 *               new_password:
 *                 type: string
 *                 minLength: 10
 *                 example: "Newpass2026x"
 *     responses:
 *       200:
 *         description: Đặt lại mật khẩu thành công
 *       403:
 *         description: Không có quyền
 */
