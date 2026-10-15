// Các route KHÔNG gắn authorizePermission — mỗi route phải có lý do. Được
// scripts/check-route-permissions.js đối chiếu: route mới thiếu guard mà không
// có mặt ở đây sẽ làm script fail. Khoá = "METHOD /đường/dẫn/đầy/đủ".
// "TODO:" = đã biết còn thiếu kiểm tra, cần xử lý ở giai đoạn sau.
const API = '/api/v1';

const catalogLookups = [
	'categories', 'levels', 'round-types', 'trainee-types', 'training-forms',
	'training-types', 'cme-credit-groups', 'subjects', 'cme-credit-categories',
	'venues',
];

module.exports = {
	// ─── Không cần đăng nhập ─────────────────────────────────────────────────
	public: {
		'GET /health/': 'Health check cho Docker / reverse proxy',
		'GET /health/db': 'Health check kết nối DB (TODO: không trả chi tiết lỗi kết nối ra ngoài)',
		[`POST ${API}/auth/login`]: 'Đăng nhập',
		[`POST ${API}/auth/refresh`]: 'Làm mới phiên bằng refresh token',
		[`POST ${API}/auth/logout`]: 'Đăng xuất bằng refresh token',
		[`POST ${API}/auth/2fa/verify`]: 'Bước 2 đăng nhập — xác thực bằng pre-auth token',
		[`POST ${API}/auth/forgot-password`]: 'Quên mật khẩu — gửi OTP qua email, luôn trả thành công (có rate-limit)',
		[`POST ${API}/auth/reset-password`]: 'Đặt mật khẩu mới bằng OTP 6 số (có rate-limit)',
		[`GET ${API}/events/`]: 'SSE — tự xác thực bằng vé dùng 1 lần ?ticket= (EventSource không gửi header)',
		[`POST ${API}/csp-report/`]: 'Trình duyệt gửi báo cáo vi phạm CSP (không kèm token) — chỉ ghi log, có rate-limit',
		[`GET ${API}/public/captcha`]: 'Cổng công khai',
		[`GET ${API}/public/courses`]: 'Cổng công khai — khoá học mở đăng ký',
		[`GET ${API}/public/trainee-types`]: 'Cổng công khai — danh mục cho form đăng ký',
		[`GET ${API}/public/upload-policy`]: 'Định dạng & dung lượng file được nhận (không nhạy cảm)',
		[`GET ${API}/public/lookup`]: 'Cổng công khai — tra cứu trạng thái đăng ký',
		[`POST ${API}/public/course-registration`]: 'Cổng công khai — đăng ký khoá học (có captcha)',
		[`GET ${API}/public/topic-rounds`]: 'Cổng công khai — đợt đang mở',
		[`GET ${API}/public/topic-rounds/by-token/:token`]: 'Cổng công khai — đợt theo link đăng ký (có rate-limit)',
		[`GET ${API}/public/categories`]: 'Cổng công khai — danh mục cho form đăng ký',
		[`GET ${API}/public/departments`]: 'Cổng công khai — danh mục cho form đăng ký',
		[`GET ${API}/public/levels`]: 'Cổng công khai — danh mục cho form đăng ký',
		[`POST ${API}/public/topic-registration`]: 'Cổng công khai — đăng ký đề tài (có captcha)',
		[`GET ${API}/public/topics/:id/status`]: 'Cổng công khai — tra cứu trạng thái đề tài',
		[`GET ${API}/public/featured-topics`]: 'Cổng công khai — đề tài tiêu biểu',
		[`GET ${API}/public/seminars/:token`]: 'Cổng công khai — hội nghị theo link QR (token 128-bit, có rate-limit)',
		[`POST ${API}/public/seminars/:token/register`]: 'Cổng công khai — đăng ký hội nghị qua QR (có captcha, rate-limit)',
		[`GET ${API}/public/seminar-tickets/:code`]: 'Cổng công khai — xem vé QR (mã vé 128-bit, có rate-limit)',
		[`POST ${API}/public/seminar-tickets/:code/test`]: 'Cổng công khai — nộp bài test cuối buổi bằng mã vé (có rate-limit)',
	},

	// ─── Chỉ cần đăng nhập ───────────────────────────────────────────────────
	// Quyền (nếu có) kiểm tra theo bản ghi trong controller/service.
	authOnly: {
		// Tài khoản của chính mình
		[`POST ${API}/auth/logout-all`]: 'Tự đăng xuất mọi thiết bị',
		[`GET ${API}/auth/sessions`]: 'Phiên đăng nhập của chính mình',
		[`POST ${API}/events/ticket`]: 'Vé mở kết nối SSE cho chính mình',
		[`POST ${API}/auth/change-password`]: 'Tự đổi mật khẩu',
		[`POST ${API}/auth/2fa/setup`]: '2FA của chính mình',
		[`POST ${API}/auth/2fa/verify-setup`]: '2FA của chính mình',
		[`POST ${API}/auth/2fa/disable`]: '2FA của chính mình',
		[`POST ${API}/auth/2fa/backup-codes`]: '2FA của chính mình — tạo lại mã khôi phục (cần mật khẩu)',
		[`GET ${API}/auth/2fa/status`]: '2FA của chính mình',
		[`GET ${API}/users/me`]: 'Hồ sơ + quyền của chính mình',
		[`PATCH ${API}/users/me`]: 'Tự sửa họ tên (controller chỉ nhận full_name)',
		[`GET ${API}/users/:id`]: 'Controller: chính mình, hoặc cần users:read + cùng khoa (userController.getById)',
		[`GET ${API}/users/search`]: 'Tìm người để thêm làm thành viên đề tài — bắt buộc từ khoá, tối đa 20 kết quả (có email để điền sẵn)',
		[`GET ${API}/notifications/`]: 'Thông báo của chính mình',
		[`GET ${API}/notifications/unread-count`]: 'Thông báo của chính mình',
		[`PUT ${API}/notifications/read-all`]: 'Thông báo của chính mình',
		[`PUT ${API}/notifications/:id/read`]: 'Thông báo của chính mình',
		[`GET ${API}/my-tasks/`]: 'Việc cần làm của chính mình',
		[`GET ${API}/me/training`]: 'Khóa học mình học/dạy + lịch học của chính mình (lọc theo user_id)',
		[`GET ${API}/me/courses/:id`]: 'Chi tiết khóa mình đang học — service chỉ trả khi có ghi danh; tài liệu/đề thi chỉ khi đã duyệt',
		[`PATCH ${API}/me/documents/:docId/download`]: 'Tăng lượt tải tài liệu — service kiểm tra tài liệu công khai + ghi danh đã duyệt',
		[`PATCH ${API}/me/lesson-documents/:docId/download`]: 'Tăng lượt tải tài liệu bài học — service kiểm tra tài liệu công khai + bài học thuộc khóa đã được duyệt',
		[`POST ${API}/me/courses/:id/register`]: 'Tự đăng ký khóa học — service chỉ nhận khóa bật đăng ký công khai, trong cửa sổ đăng ký, trạng thái chờ duyệt',
		[`GET ${API}/me/attendance`]: 'Chấm công của chính mình (lọc theo user_id)',
		[`POST ${API}/me/attendance/check`]: 'Tự chấm công — service gán user_id = req.user.id, kiểm tra IP bệnh viện + GPS trong bán kính + ca đang trong giờ được chấm',
		[`GET ${API}/me/cme`]: 'Tín chỉ CME của chính mình (lọc theo user_id)',
		[`POST ${API}/me/cme/export-excel`]: 'Xuất Excel phiếu CME của chính mình (dùng req.user.id, không nhận user_id từ client)',
		[`GET ${API}/me/cme-categories`]: 'Danh mục loại CME cho form tự khai',
		[`POST ${API}/me/cme-records`]: 'Tự khai CME — service gán user_id = req.user.id, trạng thái chờ duyệt',
		[`PUT ${API}/me/cme-records/:id`]: 'Service: chỉ bản ghi của chính mình, chưa duyệt (assertEditableMine)',
		[`DELETE ${API}/me/cme-records/:id`]: 'Service: chỉ bản ghi của chính mình, chưa duyệt (assertEditableMine)',
		[`POST ${API}/me/cme-records/:id/evidence`]: 'Chỉ bản ghi của chính mình, chưa duyệt — kiểm tra trước khi multer ghi file',
		[`GET ${API}/modules/`]: 'Module nào đang bật — để ẩn/hiện menu',

		// Thành viên hội đồng — service kiểm tra ghế trong council_members
		// (assertSecretary / assertChairman, councilProgressService.js)
		[`GET ${API}/councils/my-progress`]: 'Đề tài mình ngồi hội đồng',
		[`GET ${API}/councils/my-progress/count`]: 'Đề tài mình ngồi hội đồng',
		[`PUT ${API}/councils/progress/:topic_id/review`]: 'Service: phải là thành viên hội đồng của đề tài',
		[`POST ${API}/councils/progress/:topic_id/files`]: 'Service: phải là thành viên hội đồng của đề tài',
		[`DELETE ${API}/councils/progress/:topic_id/files/:file_id`]: 'Service: phải là thành viên hội đồng của đề tài',
		[`PUT ${API}/councils/progress/:topic_id/result`]: 'Service: chỉ chủ tịch hội đồng',
		[`POST ${API}/councils/progress/:topic_id/minutes`]: 'Service: chỉ thư ký hội đồng',
		[`DELETE ${API}/councils/progress/:topic_id/minutes/:file_id`]: 'Service: chỉ thư ký hội đồng',
		[`POST ${API}/councils/progress/:topic_id/comment-image`]: 'Service: phải là thành viên hội đồng của đề tài',

		// Người học / người tham dự — ràng buộc theo đăng ký hoặc token QR
		[`POST ${API}/seminars/checkin`]: 'Điểm danh hội thảo bằng token QR (có purpose + hạn dùng)',
		[`POST ${API}/courses/attendance/check-in`]: 'Điểm danh buổi học bằng token QR (có purpose + hạn dùng)',
		[`GET ${API}/exams/available`]: 'Service: đề thi của khoá học mình đã được duyệt đăng ký',
		[`POST ${API}/exams/papers/:id/start`]: 'Service: phải có đăng ký khoá học được duyệt',
		[`POST ${API}/exams/papers/:id/submit`]: 'Service: chỉ nộp bài làm của chính mình',
		[`GET ${API}/surveys/active`]: 'Khảo sát đang mở cho người dùng',
		[`GET ${API}/surveys/:id/respond`]: 'Trả lời khảo sát',
		[`POST ${API}/surveys/:id/respond`]: 'Trả lời khảo sát',

		[`GET ${API}/workflows/status/:entityId`]:
			'Controller: đề tài phải trong phạm vi người gọi (topicService.assertTopicInScope)',

		// Danh mục dùng cho dropdown ở mọi màn hình (không chứa dữ liệu nhạy cảm)
		[`GET ${API}/departments/:id`]: 'Danh mục dropdown',
		[`GET ${API}/round-types/:id/levels`]: 'Danh mục dropdown',
		[`GET ${API}/job-titles`]: 'Danh mục dropdown',
		...Object.fromEntries(
			catalogLookups.flatMap((name) => [
				[`GET ${API}/${name}`, 'Danh mục dropdown'],
				[`GET ${API}/${name}/:id`, 'Danh mục dropdown'],
			]),
		),
	},
};
