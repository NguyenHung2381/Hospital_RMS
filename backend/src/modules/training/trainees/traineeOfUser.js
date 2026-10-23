/**
 * Hồ sơ học viên "của tôi" theo tài khoản đang đăng nhập — 2 đường gắn:
 *   - trainees.user_id: tài khoản học viên cấp riêng (mục Học viên → Cấp tài khoản);
 *   - trainees.staff_user_id: nhân viên nội viện tự đăng ký / được ghi danh bằng tài
 *     khoản nhân viên (courseEnrollmentService.registerStaff).
 * Dùng cho cổng cá nhân: khóa học của tôi, lịch học, điểm danh (xem + quét QR), thi online.
 */
const TRAINEE_OF_USER_SQL = (t, param = '@uid') =>
	`(${t}.user_id = ${param} OR ${t}.staff_user_id = ${param})`;

module.exports = { TRAINEE_OF_USER_SQL };
