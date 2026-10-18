// Tài liệu OpenAPI cho auth.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Xác thực người dùng
 */

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Đăng nhập
 *     tags: [Auth]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin
 *               password:
 *                 type: string
 *                 example: "admin"
 *               remember_me:
 *                 type: boolean
 *                 description: Ghi nhớ đăng nhập — cookie phiên 30 ngày thay vì cookie tạm
 *     responses:
 *       200:
 *         description: Đăng nhập thành công — access token trong body, refresh token trong cookie HttpOnly rms_rt
 *       401:
 *         description: Sai tài khoản hoặc mật khẩu
 */

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Làm mới access token
 *     tags: [Auth]
 *     security: []
 *     description: >
 *       Refresh token đọc từ cookie HttpOnly `rms_rt` (đặt lúc đăng nhập). Trường
 *       `refresh_token` trong body chỉ còn để tương thích bản frontend cũ. Trả
 *       `code: REFRESH_RACE` khi tab khác vừa làm mới — client thử lại sau giây lát.
 *     responses:
 *       200:
 *         description: Trả về access token mới
 *       401:
 *         description: Refresh token không hợp lệ hoặc đã hết hạn
 */

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Đăng xuất
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Đăng xuất thành công
 */

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     summary: Đăng xuất khỏi mọi thiết bị (thu hồi toàn bộ refresh token)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Đã đăng xuất khỏi mọi thiết bị
 */

/**
 * @swagger
 * /auth/sessions:
 *   get:
 *     summary: Liệt kê các phiên đăng nhập đang hoạt động của tôi
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Danh sách phiên (mỗi refresh token còn hạn là 1 phiên)
 */

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Đổi mật khẩu
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [old_password, new_password]
 *             properties:
 *               old_password:
 *                 type: string
 *                 example: "oldpass123"
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *                 example: "newpass456"
 *     responses:
 *       200:
 *         description: Đổi mật khẩu thành công
 *       400:
 *         description: Mật khẩu cũ không đúng hoặc dữ liệu không hợp lệ
 */

/**
 * @swagger
 * /auth/2fa/verify:
 *   post:
 *     summary: Xác minh mã OTP (bước 2 của đăng nhập cho tài khoản đã bật 2FA)
 *     tags: [Auth]
 *     security: []
 *     responses:
 *       200:
 *         description: Đăng nhập thành công, trả về access/refresh token
 *       401:
 *         description: Mã không đúng hoặc pre_auth_token hết hạn
 */

/**
 * @swagger
 * /auth/2fa/setup:
 *   post:
 *     summary: Khởi tạo thiết lập 2FA — sinh secret + otpauth URI để quét QR
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Trả về secret và otpauth_uri (chưa bật, chờ xác nhận mã đầu tiên)
 */

/**
 * @swagger
 * /auth/2fa/verify-setup:
 *   post:
 *     summary: Xác nhận mã đầu tiên sau khi quét QR — chính thức bật 2FA
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "Đã bật xác thực 2 lớp — trả { backup_codes: string[] } (chỉ hiển thị 1 lần)"
 */

/**
 * @swagger
 * /auth/2fa/backup-codes:
 *   post:
 *     summary: Tạo lại bộ mã khôi phục 2FA (bộ cũ mất hiệu lực) — yêu cầu nhập lại mật khẩu
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "{ backup_codes: string[] } — chỉ hiển thị 1 lần"
 */

/**
 * @swagger
 * /auth/2fa/disable:
 *   post:
 *     summary: Tắt xác thực 2 lớp (yêu cầu nhập lại mật khẩu)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Đã tắt xác thực 2 lớp
 */

/**
 * @swagger
 * /auth/2fa/status:
 *   get:
 *     summary: Trạng thái 2FA của tài khoản hiện tại
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: "{ enabled: boolean }"
 */

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Gửi OTP đặt lại mật khẩu tới email của tài khoản (luôn trả thành công)
 *     tags: [Auth]
 *     security: []
 */

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Đặt mật khẩu mới bằng OTP nhận qua email
 *     tags: [Auth]
 *     security: []
 */
