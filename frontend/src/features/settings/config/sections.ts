// Khai báo toàn bộ ô trên trang Cấu hình hệ thống — trang chỉ đọc mảng này để vẽ, tìm kiếm,
// đếm thay đổi và lưu. Thêm một cấu hình mới:
//   1. backend: thêm khóa vào KEYS ở modules/settings/systemSettingService.js (công tắc thì thêm cả
//      BOOLEAN_KEYS; ràng buộc riêng viết validateSetting ở module đọc khóa — settingRules.js);
//   2. ở đây: thêm một Field vào nhóm phù hợp (key trùng tên khóa backend). Kiểu 'bool' nhớ đặt
//      defaultOn khớp mặc định của backend; 'number' đặt placeholder = mặc định, min/max khớp backend.
// Không cần sửa SystemSettings.tsx — trừ khi cần công cụ mới (Group.tool → components/SettingTools.tsx)
// hoặc kiểu ô mới (Field.type).
import {
	BadgeSvg,
	BookOpenSvg,
	ClockSvg,
	LayersSvg,
	MailSvg,
	MenuSvg,
	ShieldSvg,
	UploadSvg,
} from '../../../assets/icons';
import { ADMIN_MENU } from '../../../layouts/AdminLayout/nav';
import { TRAINEE_MENU } from '../../../layouts/TraineeLayout/nav';
import { USER_MENU } from '../../../layouts/UserLayout/nav';
import type { MenuCatalog } from '../../../shared/hooks/useMenuConfig';
import { TUITION_BANKS } from '../../tuition/utils/banks';
import { EVENT_TYPE_LABELS } from '../../seminar/types/seminar.type';
import {
	SEMINAR_METHOD,
	SEMINAR_METHOD_KEY,
	SEMINAR_METHOD_ORDER,
	TRAINING_METHOD,
	TRAINING_METHOD_KEY,
	TRAINING_METHOD_ORDER,
} from '../../../shared/utils/attendanceMethods';

export type Field = {
	key: string;
	label: string;
	hint?: string;
	/** Giải thích dài — ẩn sau "Xem thêm" để trang gọn. */
	more?: string;
	type?: 'bool' | 'text' | 'number' | 'password' | 'select' | 'textarea' | 'multi' | 'menu' | 'matrix';
	/**
	 * Cho type 'matrix': bảng tick hàng × cột, lưu JSON { hàng: [cột…] }; hàng không có trong JSON =
	 * tick đủ (rỗng = tất cả). Cột [giá trị, nhãn, khóa công tắc] — công tắc 'false' ⇒ cột bị khóa.
	 */
	matrix?: { rows: [string, string][]; cols: [string, string, string?][]; rowHead?: string };
	/** Cho type 'menu': danh sách mục của cổng — giá trị lưu là key các mục bị TẮT. */
	menu?: MenuCatalog;
	/** [giá trị, nhãn, nhóm] — nhóm chỉ dùng cho type 'multi'. */
	options?: [string, string, string?][];
	placeholder?: string;
	/** Mặc định của backend khi chưa cấu hình gì (chỉ cho bool). */
	defaultOn?: boolean;
	/** Mặc định của backend khi chưa cấu hình (cho multi — danh sách phân cách dấu phẩy). */
	defaultValue?: string;
	/** Nhãn bên cạnh công tắc, tùy trạng thái. */
	onText?: string;
	offText?: string;
	/** Đơn vị hiện sau ô số. */
	unit?: string;
	min?: number;
	max?: number;
};

export type Group = {
	title?: string;
	desc?: string;
	/** Giải thích dài của nhóm — ẩn sau "Xem thêm". */
	more?: string;
	/** 'tiles' = lưới thẻ công tắc; 'grid' = lưới ô số gọn. Mặc định: mỗi cấu hình một dòng. */
	layout?: 'tiles' | 'grid';
	/** Công tắc tổng — khi tắt thì cảnh báo nhóm này chưa có tác dụng. */
	dependsOn?: { key: string; text: string };
	/** Công tắc tổng — khi tắt ('false') thì ẩn hẳn nhóm này (chức năng tắt thì khỏi cấu hình). */
	hiddenBy?: string;
	/** Công cụ hỗ trợ hiện cuối nhóm. */
	tool?: 'mail-test' | 'attendance-helper' | 'clamav-test' | 'doc-check' | 'recaptcha-test' | 'holiday-preview' | 'bank-connect';
	fields: Field[];
};

export type Section = {
	id: string;
	/** Nhóm trên menu trái. */
	cat: string;
	title: string;
	sub: string;
	icon: typeof ShieldSvg;
	/** Ghi chú chung đầu tab. */
	note?: string;
	/** Hiện từng nhóm một qua thanh chọn (thay vì xếp chồng cả trang). */
	subtabs?: boolean;
	groups: Group[];
};

// Hiện ở cả tab "Phân hệ chức năng" lẫn tab "Điểm danh" (cùng 1 key)
export const ATTENDANCE_TOGGLE: Field = {
	key: 'MODULE_ATTENDANCE',
	label: 'Điểm danh học viên',
	hint: 'Hiện mục Điểm danh ở cổng học viên (điểm danh vào/ra theo ca trong thời gian khóa học) và mục Ca & điểm danh cho quản trị.',
	more: 'Cấu hình IP và vị trí ở tab "Điểm danh" trước khi bật.',
	type: 'bool',
	defaultOn: false,
	onText: 'Đang bật',
	offText: 'Đã tắt',
};

// Hiện ở cả tab "Phân hệ chức năng" lẫn nhóm Học phí của tab Đào tạo (cùng 1 key)
export const TUITION_TOGGLE: Field = {
	key: 'MODULE_TUITION',
	label: 'Thu học phí',
	hint: 'Tab Học phí ở chi tiết khóa học, mục Học phí ở cổng học viên (mã QR chuyển khoản, báo đã nộp, phiếu thu).',
	more: 'Tắt khi bệnh viện không thu học phí qua hệ thống: ẩn giao diện và chặn API học phí. Khoản đã ghi và phiếu thu vẫn giữ nguyên, bật lại là dùng tiếp. Mức học phí khai ở chương trình đào tạo vẫn hiện như thông tin tham khảo.',
	type: 'bool',
	defaultOn: true,
	onText: 'Đang bật',
	offText: 'Đã tắt',
};

export const SECTIONS: Section[] = [
	{
		id: 'security',
		cat: 'Hệ thống',
		title: 'Bảo mật & tài khoản',
		sub: '2FA, quên mật khẩu, chống bot',
		icon: ShieldSvg,
		groups: [
			{
				title: 'Xác thực 2 lớp (TOTP)',
				fields: [
					{
						key: 'REQUIRE_2FA_FOR_ADMINS',
						label: 'Bắt buộc 2FA cho quản trị',
						hint: 'Áp dụng cho superuser và vai trò có quyền nhạy cảm (tạo/sửa người dùng, phân quyền, cấu hình).',
						type: 'bool',
						defaultOn: true,
						onText: 'Đang bắt buộc',
						offText: 'Không bắt buộc',
					},
					{
						key: 'TWOFA_GRACE_DAYS',
						label: 'Thời gian chuyển tiếp',
						hint: 'Quá hạn mà chưa bật 2FA thì bị chặn mọi chức năng.',
						type: 'number',
						placeholder: '14',
						unit: 'ngày',
						min: 0,
					},
				],
			},
			{
				title: 'Mật khẩu & cảnh báo',
				fields: [
					{
						key: 'PASSWORD_RESET_ENABLED',
						label: 'Cho phép quên mật khẩu (OTP)',
						hint: 'Tắt thì nút "Quên mật khẩu" không dùng được. OTP gửi qua email nên cần bật Email.',
						type: 'bool',
						defaultOn: true,
						onText: 'Đang cho phép',
						offText: 'Đã tắt',
					},
					{
						key: 'TEMP_PASSWORD_TTL_DAYS',
						label: 'Hạn dùng mật khẩu tạm',
						hint: 'Quá hạn chưa đổi thì không đăng nhập được nữa. 0 = không giới hạn.',
						more: 'Áp dụng cho mật khẩu tạm do quản trị cấp. Hết hạn thì người dùng phải bấm "Quên mật khẩu" hoặc nhờ quản trị đặt lại.',
						type: 'number',
						placeholder: '7',
						unit: 'ngày',
						min: 0,
					},
					{
						key: 'ALERT_EMAILS',
						label: 'Email nhận cảnh báo bảo mật',
						hint: 'Phân cách bằng dấu phẩy. Để trống = gửi cho mọi superuser có email.',
						type: 'textarea',
						placeholder: 'it@benhvien.vn, antoan@benhvien.vn',
					},
				],
			},
			{
				title: 'Chống bot form đăng ký công khai',
				desc: 'Google reCAPTCHA cho form đăng ký khóa học / đề tài. Để trống các khóa = dùng kiểm tra chạy ngầm.',
				more: 'Khóa Google Cloud (khuyến nghị): Site key + Project ID + API key, máy chủ xác minh qua reCAPTCHA Enterprise API. Khóa cũ: Site key + Secret key. Đã đặt Project ID thì Secret key bị bỏ qua. Để trống tất cả thì dùng kiểm tra chạy ngầm (proof-of-work), chạy được cả trong mạng nội bộ không ra Internet.',
				tool: 'recaptcha-test',
				fields: [
					{
						key: 'RECAPTCHA_SITE_KEY',
						label: 'Site key',
						hint: 'Máy chủ phải gọi ra được www.google.com, không thì mọi lượt đăng ký bị từ chối.',
						more: 'Google Cloud → Security → reCAPTCHA → tạo khóa loại Website, kiểu thử thách ô tích "Tôi không phải người máy", thêm tên miền hệ thống. Chép ID khóa vào đây.',
						placeholder: '6Lc…',
					},
					{
						key: 'RECAPTCHA_PROJECT_ID',
						label: 'Project ID (Google Cloud)',
						hint: 'ID của dự án chứa khóa, không phải tên dự án. Đặt là dùng khóa Google Cloud.',
						more: 'Xem ở Google Cloud Console → chọn dự án → Project ID. Dự án phải bật "reCAPTCHA Enterprise API".',
						placeholder: 'rms-benhvien',
					},
					{
						key: 'RECAPTCHA_API_KEY',
						label: 'API key (Google Cloud)',
						hint: 'Được che sau khi lưu. Để nguyên nếu không đổi.',
						more: 'Google Cloud → APIs & Services → Credentials → Create credentials → API key. Nên giới hạn khóa chỉ dùng "reCAPTCHA Enterprise API".',
						type: 'password',
					},
					{
						key: 'RECAPTCHA_SECRET_KEY',
						label: 'Secret key (khóa cũ)',
						hint: 'Chỉ dùng khi chưa đặt Project ID. Được che sau khi lưu.',
						type: 'password',
					},
					{
						key: 'RECAPTCHA_HOSTNAMES',
						label: 'Chỉ nhận từ tên miền',
						hint: 'Tùy chọn, phân cách bằng dấu phẩy. Để trống = không kiểm tra tên miền.',
						more: 'Không đặt khi dùng khóa TEST của Google.',
						placeholder: 'rms.benhvien.vn',
					},
				],
			},
		],
	},
	{
		id: 'mail',
		cat: 'Hệ thống',
		title: 'Email (SMTP)',
		sub: 'Máy chủ gửi thư, gửi thử',
		icon: MailSvg,
		groups: [
			{
				fields: [
					{
						key: 'MAIL_ENABLED',
						label: 'Bật gửi email',
						hint: 'Công tắc tổng. Tắt = chỉ ghi log máy chủ, không gửi thật cho mọi chức năng (kể cả OTP).',
						type: 'bool',
						onText: 'Đang bật',
						offText: 'Đang tắt',
					},
				],
			},
			{
				title: 'Máy chủ & tài khoản gửi',
				fields: [
					{ key: 'SMTP_HOST', label: 'SMTP host', placeholder: 'smtp.gmail.com' },
					{ key: 'SMTP_PORT', label: 'SMTP port', type: 'number', placeholder: '587', min: 1, max: 65535 },
					{
						key: 'SMTP_SECURE',
						label: 'Kiểu kết nối',
						type: 'select',
						options: [
							['', 'STARTTLS (thường port 587)'],
							['ssl', 'SSL/TLS (thường port 465)'],
						],
					},
					{ key: 'SMTP_USER', label: 'Tài khoản', placeholder: 'no-reply@benhvien.vn' },
					{ key: 'SMTP_PASS', label: 'Mật khẩu / App password', hint: 'Được che sau khi lưu. Để nguyên nếu không đổi. Đổi SMTP host thì mật khẩu bị xóa — nhập lại.', type: 'password' },
					{ key: 'SMTP_FROM_NAME', label: 'Tên người gửi', placeholder: 'Hệ thống Quản lý NCKH – Đào tạo – CME' },
					{
						key: 'PUBLIC_BASE_URL',
						label: 'URL gốc hệ thống',
						hint: 'Dùng tạo link tra cứu trong email.',
						placeholder: 'https://rms.benhvien.vn',
					},
				],
			},
			{
				title: 'Gửi email thử',
				desc: 'Dùng cấu hình đã lưu, bỏ qua công tắc "Bật gửi email". Lưu thay đổi trước khi thử.',
				tool: 'mail-test',
				fields: [],
			},
			{
				title: 'Gửi email cho chức năng',
				desc: 'Chọn chức năng nào được gửi email. Thông báo trong hệ thống vẫn hiện bình thường.',
				layout: 'tiles',
				dependsOn: { key: 'MAIL_ENABLED', text: 'Công tắc tổng "Bật gửi email" đang tắt — các lựa chọn dưới đây chưa có tác dụng.' },
				// Mặc định khớp backend mailService.EVENT_DEFAULTS
				fields: (
					[
						['TOPIC_RESULT', 'Kết quả duyệt đề tài', 'Phê duyệt / từ chối / yêu cầu bổ sung — gửi chủ nhiệm và thành viên.', true],
						['TOPIC_SUBMITTED', 'Có đề tài mới cần duyệt', 'Gửi người có quyền duyệt khi đề tài được nộp.', false],
						['SIGN_REQUEST', 'Trình ký văn bản', 'Báo người ký khi tới lượt; báo người gửi khi bị từ chối hoặc đã ký xong.', true],
						['ACCOUNT_GRANTED', 'Cấp tài khoản thành viên đề tài', 'Báo thành viên mới, khoa và chủ nhiệm (không kèm mật khẩu).', false],
						['DEADLINE_REMINDER', 'Nhắc hạn nộp đợt NCKH', 'Trước hạn và khi quá hạn các mốc của đợt.', true],
						['COURSE_ENROLLMENT', 'Đăng ký khóa học', 'Gửi học viên: xác nhận nhận đơn, báo sửa bản khai, kết quả duyệt. Mã OTP xác minh email luôn gửi.', true],
						['SEMINAR_BADGE', 'Thẻ đại biểu hội nghị', 'Gửi kèm QR điểm danh sau khi đăng ký hội nghị công khai.', true],
						['PASSWORD_EXPIRY', 'Nhắc đổi mật khẩu', 'Khi mật khẩu lâu chưa đổi.', true],
						['SECURITY_ALERT', 'Cảnh báo bảo mật', 'Gửi tới "Email nhận cảnh báo bảo mật" (tab Bảo mật).', true],
						['BROADCAST', 'Thông báo chung', 'Thông báo quản trị gửi tới toàn viện / khoa / cá nhân.', false],
					] as const
				).map(([k, label, hint, defaultOn]) => ({
					key: `MAIL_EVENT_${k}`,
					label,
					hint,
					type: 'bool' as const,
					defaultOn,
					onText: 'Gửi email',
					offText: 'Không gửi',
				})),
			},
		],
	},
	{
		id: 'modules',
		cat: 'Phân hệ & giao diện',
		title: 'Phân hệ chức năng',
		sub: 'Bật/tắt từng phân hệ',
		icon: LayersSvg,
		note: 'Tắt phân hệ sẽ ẩn toàn bộ menu và chặn API của phân hệ đó. Dữ liệu vẫn giữ nguyên, bật lại là dùng tiếp.',
		groups: [
			{
				layout: 'tiles',
				fields: [
					{ key: 'MODULE_RESEARCH', label: 'Nghiên cứu khoa học', hint: 'Đề tài, đợt, hội đồng chấm, phê duyệt, danh mục phân loại.', type: 'bool', defaultOn: true, onText: 'Đang bật', offText: 'Đã tắt' },
					{ key: 'MODULE_TRAINING', label: 'Đào tạo', hint: 'Chương trình, khóa học, hồ sơ thực hành GPHN, học viên, giảng viên, ngân hàng câu hỏi.', type: 'bool', defaultOn: true, onText: 'Đang bật', offText: 'Đã tắt' },
					{ key: 'MODULE_SEMINAR', label: 'Hội nghị & tín chỉ CME', hint: 'Hội thảo, tập huấn bệnh viện, quét vé, sổ cấp chứng nhận, ghi nhận độc lập, theo dõi ngưỡng tín chỉ.', type: 'bool', defaultOn: true, onText: 'Đang bật', offText: 'Đã tắt' },
					{ key: 'MODULE_SURVEY', label: 'Khảo sát', hint: 'Tạo phiếu khảo sát, thu thập và thống kê câu trả lời.', type: 'bool', defaultOn: true, onText: 'Đang bật', offText: 'Đã tắt' },
					ATTENDANCE_TOGGLE,
					TUITION_TOGGLE,
				],
			},
		],
	},
	{
		id: 'menus',
		cat: 'Phân hệ & giao diện',
		title: 'Menu hiển thị',
		sub: 'Bật/tắt từng mục menu',
		icon: MenuSvg,
		subtabs: true,
		note: 'Mục tắt sẽ biến mất khỏi menu và vào thẳng URL thì báo "đã tắt". Đây chỉ là ẩn giao diện — quyền dữ liệu vẫn theo Vai trò & quyền.',
		groups: (
			[
				['MENU_HIDDEN_ADMIN', 'Trang quản trị', 'Sidebar /admin.', ADMIN_MENU],
				['MENU_HIDDEN_USER', 'Cổng nhân viên', 'Menu dọc của cổng nhân viên (/user). Menu tài khoản (hồ sơ, thông báo) luôn hiện.', USER_MENU],
				['MENU_HIDDEN_TRAINEE', 'Cổng học viên', 'Menu ngang + tab đáy điện thoại. Menu tài khoản luôn hiện.', TRAINEE_MENU],
			] as const
		).map(([key, label, hint, menu]) => ({
			title: label,
			desc: hint,
			fields: [{ key, label, hint, type: 'menu' as const, menu }],
		})),
	},
	{
		id: 'upload',
		cat: 'Hệ thống',
		title: 'Tải lên',
		sub: 'Định dạng, dung lượng, quét virus',
		icon: UploadSvg,
		note: 'Mọi file luôn được kiểm tra nội dung thật khớp với đuôi file (chặn file .exe đổi tên thành .pdf).',
		groups: [
			{
				title: 'Dung lượng',
				desc: 'Hạn mức theo ngày áp dụng cho MỌI lượt tải lên.',
				layout: 'grid',
				fields: [
					{
						key: 'UPLOAD_MAX_MB',
						label: 'Tối đa mỗi file',
						hint: 'Hồ sơ, minh chứng, tài liệu khóa học.',
						type: 'number',
						placeholder: '50',
						unit: 'MB',
						min: 1,
						max: 1024,
					},
					{
						key: 'UPLOAD_DAILY_QUOTA_MB',
						label: 'Tổng mỗi tài khoản / ngày',
						hint: 'Làm mới lúc 0h. 0 = không giới hạn.',
						more: 'Chặn 1 tài khoản (bị chiếm hoặc script lỗi) tải lên liên tục làm đầy ổ đĩa máy chủ.',
						type: 'number',
						placeholder: '2048',
						unit: 'MB',
						min: 0,
						max: 1048576,
					},
				],
			},
			{
				title: 'Định dạng được nhận',
				desc: 'Bấm để chọn / bỏ chọn. Chỉ chọn được trong danh sách định dạng an toàn.',
				more: 'Áp dụng cho hồ sơ đề tài, hồ sơ học viên, minh chứng CME, tài liệu khóa học và cổng đăng ký công khai. Video bài giảng, ảnh chèn nhận xét và file import Excel có quy định riêng.',
				fields: [
					{
						key: 'UPLOAD_ALLOWED_EXTENSIONS',
						label: 'Định dạng được nhận',
						type: 'multi',
						// Khớp backend fileTypeAllowlist.DOCUMENT_EXTENSIONS / uploadPolicy.DEFAULT_EXTENSIONS
						options: [
							['.pdf', 'PDF', 'Văn bản'], ['.doc', 'DOC', 'Văn bản'], ['.docx', 'DOCX', 'Văn bản'],
							['.txt', 'TXT', 'Văn bản'], ['.rtf', 'RTF', 'Văn bản'], ['.odt', 'ODT', 'Văn bản'],
							['.xls', 'XLS', 'Bảng tính'], ['.xlsx', 'XLSX', 'Bảng tính'], ['.csv', 'CSV', 'Bảng tính'], ['.ods', 'ODS', 'Bảng tính'],
							['.ppt', 'PPT', 'Trình chiếu'], ['.pptx', 'PPTX', 'Trình chiếu'], ['.odp', 'ODP', 'Trình chiếu'],
							['.rar', 'RAR', 'File nén'], ['.zip', 'ZIP', 'File nén'], ['.7z', '7Z', 'File nén'],
							['.png', 'PNG', 'Hình ảnh'], ['.jpg', 'JPG', 'Hình ảnh'], ['.jpeg', 'JPEG', 'Hình ảnh'],
							['.gif', 'GIF', 'Hình ảnh'], ['.webp', 'WEBP', 'Hình ảnh'], ['.bmp', 'BMP', 'Hình ảnh'],
						],
						defaultValue: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rar,.zip',
					},
				],
			},
			{
				title: 'Quét virus (ClamAV)',
				desc: 'Quét mọi file tải lên trước khi lưu; file nhiễm bị xóa ngay và ghi nhật ký bảo mật. Để trống máy chủ = không quét.',
				tool: 'clamav-test',
				fields: [
					{
						key: 'CLAMAV_HOST',
						label: 'Máy chủ ClamAV',
						hint: 'Tên máy hoặc IP của dịch vụ clamd.',
						more: 'Chạy bằng Docker: dịch vụ "clamav" được cài và bật sẵn, để trống ô này là dùng nó. Sau khi khởi động, ClamAV mất khoảng 1 phút để nạp cơ sở dữ liệu virus, trong lúc đó việc tải lên có thể bị từ chối.',
						placeholder: 'clamav',
					},
					{ key: 'CLAMAV_PORT', label: 'Cổng', type: 'number', placeholder: '3310', min: 1, max: 65535 },
					{
						key: 'CLAMAV_MAX_MB',
						label: 'Chỉ quét file nhỏ hơn',
						hint: 'File lớn hơn được nhận mà không quét (thường là video bài giảng).',
						more: 'Không đặt lớn hơn StreamMaxLength của clamd (mặc định 25MB), nếu không file lớn sẽ bị từ chối.',
						type: 'number',
						placeholder: '25',
						unit: 'MB',
						min: 1,
						max: 4095,
					},
					{
						key: 'CLAMAV_FAIL_OPEN',
						label: 'Khi ClamAV không hoạt động',
						hint: 'Mặc định từ chối tải lên cho tới khi ClamAV chạy lại — bật quét mà lặng lẽ bỏ qua thì không khác gì không quét.',
						type: 'bool',
						defaultOn: false,
						onText: 'Vẫn nhận file',
						offText: 'Từ chối tải lên',
					},
				],
			},
		],
	},
	{
		id: 'attendance',
		cat: 'Nghiệp vụ',
		title: 'Điểm danh',
		sub: 'Phương thức, mạng, vị trí, đơn xin phép',
		icon: ClockSvg,
		groups: [
			{ fields: [ATTENDANCE_TOGGLE] },
			{
				title: 'Phương thức điểm danh — Đào tạo',
				desc: 'Tắt ở đây là tắt cho mọi khóa học. Từng loại hình đào tạo chọn tiếp phương thức của mình ở Danh mục → Loại hình đào tạo. Điểm danh tay của giảng viên luôn dùng được.',
				more: 'Mã QR đã chiếu trước khi tắt cũng không còn nhận. Tắt máy chấm công: lượt chấm vẫn được lưu để xem nhưng không ghép vào buổi học / ca; bật lại thì lượt trong 7 ngày gần nhất được ghép lại.',
				layout: 'tiles',
				fields: TRAINING_METHOD_ORDER.map((m) => ({
					key: TRAINING_METHOD_KEY[m],
					label: TRAINING_METHOD[m].label,
					hint: TRAINING_METHOD[m].hint,
					type: 'bool' as const,
					defaultOn: true,
					onText: 'Bật',
					offText: 'Tắt',
				})),
			},
			{
				title: 'Phương thức điểm danh — Hội nghị, hội thảo',
				desc: 'Áp dụng cho hội nghị do bệnh viện tổ chức. Thêm người vào danh sách / nhập Excel luôn dùng được.',
				more: 'Máy chấm công vân tay: đặt mục đích máy là "Hội nghị" hoặc "Học viên + hội nghị" ở trang Máy chấm công. Lượt chấm trong ngày diễn ra hội nghị (từ trước giờ bắt đầu theo "Chấm sớm nhất" tới giờ kết thúc) được ghép vào người đã có trong danh sách tham dự — PIN trên máy là mã nhân viên, học viên là mã HV bỏ chữ HV. Người chưa có trong danh sách chấm thì không được ghép.\nBài kiểm tra làm trên vé yêu cầu đã điểm danh: loại hội nghị nào tắt hết phương thức điểm danh thì người tham dự chỉ làm bài được qua QR chung của đề.',
				layout: 'tiles',
				fields: SEMINAR_METHOD_ORDER.map((m) => ({
					key: SEMINAR_METHOD_KEY[m],
					label: SEMINAR_METHOD[m].label,
					hint: SEMINAR_METHOD[m].hint,
					type: 'bool' as const,
					defaultOn: true,
					onText: 'Bật',
					offText: 'Tắt',
				})),
			},
			{
				title: 'Phương thức theo loại hội nghị',
				desc: 'Bỏ tick để loại hội nghị đó không điểm danh bằng phương thức này. Cột bị mờ là phương thức đang tắt trên toàn hệ thống.',
				fields: [
					{
						key: 'SEMINAR_CHECKIN_BY_TYPE',
						label: 'Phương thức theo loại hội nghị',
						type: 'matrix',
						matrix: {
							rowHead: 'Loại hội nghị',
							rows: Object.entries(EVENT_TYPE_LABELS),
							cols: SEMINAR_METHOD_ORDER.map((m) => [m, SEMINAR_METHOD[m].short, SEMINAR_METHOD_KEY[m]]),
						},
					},
				],
			},
			{
				title: 'Điều kiện điểm danh hợp lệ',
				desc: 'Áp dụng khi quét QR buổi học và bấm vào / ra trên ứng dụng. Học viên phải đạt CẢ HAI: đang dùng mạng bệnh viện VÀ đang ở trong bán kính quanh bệnh viện.',
				tool: 'attendance-helper',
				fields: [
					{
						key: 'ATTENDANCE_ALLOWED_IPS',
						label: '1. IP mạng bệnh viện',
						hint: 'Nhiều giá trị phân cách bằng dấu phẩy, nhận dạng CIDR (vd 10.0.0.0/8). Để trống = không ai điểm danh được.',
						more: 'IP công cộng của đường mạng bệnh viện, hoặc dải IP nội bộ nếu máy chủ đặt trong viện.',
						type: 'textarea',
						placeholder: '113.161.1.2, 10.0.0.0/8',
					},
					{
						key: 'ATTENDANCE_LOCATION',
						label: '2. Tọa độ bệnh viện',
						hint: 'Dạng "vĩ độ, kinh độ".',
						more: 'Chuột phải vào bệnh viện trên Google Maps để sao chép, hoặc bấm "Dùng vị trí hiện tại" bên dưới khi đang ở viện.',
						placeholder: '10.7769, 106.7009',
					},
					{
						key: 'ATTENDANCE_RADIUS_M',
						label: 'Bán kính cho phép',
						hint: 'Học viên phải ở trong bán kính này quanh tọa độ bệnh viện.',
						type: 'number',
						placeholder: '200',
						unit: 'm',
						min: 1,
					},
					{
						key: 'ATTENDANCE_MAX_ACCURACY_M',
						label: 'Sai số GPS tối đa',
						hint: 'Vị trí có sai số lớn hơn bị từ chối.',
						more: 'Máy tính không có GPS thường sai vài trăm mét. Trong nhà GPS hay lệch 30–100m.',
						type: 'number',
						placeholder: '100',
						unit: 'm',
						min: 1,
					},
				],
			},
			{
				title: 'Đơn xin phép (xin nghỉ / xin đi muộn)',
				fields: [
					{
						key: 'LEAVE_REQUEST_ENABLED',
						label: 'Cho học viên gửi đơn xin phép',
						hint: 'Tắt thì học viên không gửi được đơn mới; đơn đang chờ vẫn duyệt được ở trang Đơn xin phép.',
						type: 'bool',
						defaultOn: true,
						onText: 'Cho phép',
						offText: 'Đã tắt',
					},
					{
						key: 'LEAVE_BACKDATE_DAYS',
						label: 'Nộp bổ sung cho ngày đã qua',
						hint: '0 = chỉ xin phép từ hôm nay trở đi.',
						type: 'number',
						placeholder: '3',
						unit: 'ngày',
						min: 0,
						max: 30,
					},
					{
						key: 'LEAVE_AHEAD_DAYS',
						label: 'Xin phép trước tối đa',
						hint: 'Ngày cuối của đơn không được quá hôm nay + số ngày này.',
						type: 'number',
						placeholder: '90',
						unit: 'ngày',
						min: 1,
						max: 365,
					},
					{
						key: 'LEAVE_MAX_SPAN_DAYS',
						label: 'Một đơn xin nghỉ dài tối đa',
						type: 'number',
						placeholder: '31',
						unit: 'ngày',
						min: 1,
						max: 180,
					},
				],
			},
		],
	},
	{
		id: 'cme',
		cat: 'Nghiệp vụ',
		title: 'Tín chỉ CME',
		sub: 'Ngưỡng, tự cộng, duyệt tín chỉ',
		icon: BadgeSvg,
		groups: [
			{
				title: 'Ngưỡng tín chỉ CME',
				layout: 'grid',
				fields: [
					{ key: 'CME_CYCLE_YEARS', label: 'Chu kỳ tính ngưỡng', hint: 'Số năm của một chu kỳ CME.', type: 'number', placeholder: '5', unit: 'năm', min: 1 },
					{ key: 'CME_MIN_HOURS', label: 'Giờ tín chỉ tối thiểu / chu kỳ', hint: 'Dùng cho cảnh báo thiếu tín chỉ.', type: 'number', placeholder: '120', unit: 'giờ', min: 0 },
				],
			},
			{
				title: 'Tự cộng tín chỉ CME (khóa ĐTLT / CTCV)',
				desc: 'Mặc định 1 tiết = 1 giờ tín chỉ. Chỉ cộng cho người có tài khoản trong hệ thống.',
				more: 'Theo TT 32/2023 Phụ lục I mục 1.1: học viên và giảng viên khóa ngắn hạn đều ghi danh mục "Khóa đào tạo, bồi dưỡng ngắn hạn" (DT_KHOAHOC). Sửa hệ số ở Tín chỉ CME → Danh mục quy đổi tín chỉ.',
				layout: 'tiles',
				// Khớp backend courseCmeService (syncTrainees / lecturerHours)
				fields: [
					{
						key: 'CME_AUTO_TRAINEE',
						label: 'Cộng CME cho học viên',
						hint: 'Khi học viên nội viện có tài khoản được cấp giấy chứng nhận — mỗi giấy 1 dòng CME.',
						more: [
							'• Tín chỉ = số giờ tín chỉ khai ở chương trình; chưa khai thì (tiết LT + TH) × hệ số DT_KHOAHOC.',
							'• Ngày ghi nhận = ngày kết thúc lớp của chương trình (hoặc của khóa).',
							'• Thu hồi giấy ⇒ dòng CME bị từ chối; xóa giấy cấp nhầm ⇒ xóa dòng CME (kể cả khi đang tắt công tắc).',
						].join('\n'),
						type: 'bool',
						defaultOn: true,
						onText: 'Tự cộng',
						offText: 'Không cộng',
					},
					{
						key: 'CME_AUTO_LECTURER',
						label: 'Cộng CME cho giảng viên',
						hint: 'Khi khóa điểm khóa học (hoặc bấm "Ghi lại CME" ở tab Kết quả): tín chỉ = số tiết giảng × hệ số DT_KHOAHOC.',
						more: [
							'Số tiết giảng tính theo từng bài, lần lượt:',
							'1. Có nhập số tiết ở phân công giảng viên ⇒ lấy số đó.',
							'2. Chưa nhập ⇒ chia số tiết của bài theo số buổi đã dạy (VD bài 6 tiết, 3 buổi: dạy 2 buổi được 4 tiết).',
							'3. Bài chưa có buổi nào gán giảng viên ⇒ GV chính nhận đủ số tiết bài, GV phụ 0.',
							'Phân công cả khóa (không gắn bài) chỉ tính khi có nhập số tiết.',
						].join('\n'),
						type: 'bool',
						defaultOn: true,
						onText: 'Tự cộng',
						offText: 'Không cộng',
					},
				],
			},
			{
				title: 'Duyệt tín chỉ tự cộng',
				desc: 'Dòng CME tự cộng được tính ngay (cộng thẳng) hay chờ người quản lý CME duyệt ở Tín chỉ CME → Ghi nhận độc lập.',
				more: 'TT 32/2023 Điều 9: cơ sở tổ chức xác nhận, tính giờ tín chỉ và quản lý việc xác nhận. Dòng đã bị từ chối luôn giữ nguyên khi ghi lại.',
				// Khớp backend courseCmeService.APPROVAL_MODES / systemSettingService.ENUM_KEYS
				fields: [
					{
						key: 'CME_TRAINEE_APPROVAL',
						label: 'Dòng CME của học viên',
						hint: 'Giấy chứng nhận do thủ trưởng đơn vị ký đã là xác nhận hoàn thành khóa (Điều 4 khoản 1 điểm i), nên mặc định cộng thẳng.',
						more: 'Chọn "Chờ duyệt" nếu phòng quản lý CME muốn soát lại trước khi tính. Cấp lại giấy sau khi thu hồi thì dòng CME về chờ duyệt (hoặc đã duyệt nếu đang cộng thẳng).',
						type: 'select',
						options: [
							['', 'Cộng thẳng — đã duyệt (mặc định)'],
							['pending', 'Chờ người quản lý CME duyệt'],
						],
					},
					{
						key: 'CME_LECTURER_APPROVAL',
						label: 'Dòng CME của giảng viên',
						hint: 'Thủ trưởng đơn vị tổ chức giảng dạy tính giờ tín chỉ dựa trên minh chứng đã tham gia giảng dạy (Điều 6 khoản 2 điểm c).',
						more: [
							'• Theo quyền người khóa điểm: người khóa điểm / bấm "Ghi lại CME" có quyền quản lý CME ⇒ đã duyệt; không có ⇒ chờ duyệt.',
							'• Cộng thẳng: đã duyệt ngay, trừ dòng của chính người khóa điểm khi người đó không có quyền quản lý CME (không ai tự duyệt CME cho mình).',
							'• Chờ duyệt: mọi dòng chờ người quản lý CME đối chiếu buổi dạy / phân công rồi duyệt.',
						].join('\n'),
						type: 'select',
						options: [
							['', 'Theo quyền người khóa điểm (mặc định)'],
							['approved', 'Cộng thẳng — đã duyệt'],
							['pending', 'Luôn chờ người quản lý CME duyệt'],
						],
					},
				],
			},
		],
	},
	{
		id: 'training',
		cat: 'Nghiệp vụ',
		title: 'Đào tạo',
		sub: 'Lớp học, đăng ký, điểm đạt',
		icon: BookOpenSvg,
		groups: [
			{
				title: 'Lớp học ĐTLT / CTCV',
				fields: [
					{
						key: 'PRACTICE_MENTOR_MAX_TRAINEES',
						label: 'Học viên tối đa / người hướng dẫn',
						hint: 'Hồ sơ thực hành GPHN cảnh báo (không chặn) khi vượt.',
						type: 'number',
						placeholder: '5',
						unit: 'người',
						min: 1,
					},
					{
						key: 'TRAINING_ALLOW_MULTI_PROGRAM',
						label: 'Cho học nhiều chương trình cùng lúc',
						hint: 'Tắt thì học viên đang học (hoặc chờ) một chương trình chưa kết thúc không ghi danh được chương trình khác.',
						type: 'bool',
						defaultOn: true,
						onText: 'Cho phép',
						offText: 'Không cho phép',
					},
					{
						key: 'TRAINING_CLASS_PREP_DAYS',
						label: 'Chuẩn bị trước khai giảng',
						hint: 'Gợi ý ngày bắt đầu lớp = thứ Hai đầu tiên sau (hôm nay + số ngày này).',
						type: 'number',
						placeholder: '7',
						unit: 'ngày',
						min: 0,
					},
				],
			},
			{
				title: 'Ngày nghỉ lễ',
				desc: 'Gợi ý ngày học bỏ qua T7, CN và các ngày nghỉ lễ dưới đây.',
				tool: 'holiday-preview',
				// Khớp backend utils/vnHolidays.js + utils/classDates.js (parseHolidays)
				fields: [
					{
						key: 'TRAINING_HOLIDAYS_AUTO',
						label: 'Tự tính ngày lễ theo luật cho mọi năm',
						hint: 'Tết Dương lịch, Tết Nguyên đán và Giỗ Tổ Hùng Vương (đổi từ âm lịch), 30/4, 1/5, Quốc khánh 2 ngày, kèm ngày nghỉ bù khi lễ rơi vào cuối tuần.',
						more: [
							'• Tết Nguyên đán: từ 2 ngày trước mùng 1 tới hết mùng 5 — khớp 5 ngày làm việc được nghỉ các năm 2023–2026.',
							'• Quốc khánh: 2/9 và 1 ngày liền kề nối với cuối tuần (Chính phủ chọn hằng năm, hệ thống đoán theo thứ).',
							'• Lịch Chính phủ công bố khác (hoán đổi ngày làm việc, chọn ngày liền kề khác…) thì sửa ở ô bên dưới.',
						].join('\n'),
						type: 'bool',
						defaultOn: true,
						onText: 'Tự động',
						offText: 'Chỉ dùng ngày nhập tay',
					},
					{
						key: 'TRAINING_HOLIDAYS_SYNC',
						label: 'Đối chiếu với lịch Google hằng tuần',
						hint: 'Sáng thứ Hai tải lịch ngày lễ Việt Nam, có ngày khác với danh sách đang dùng (hoán đổi ngày làm việc, ngày lễ mới) thì báo cho quản trị. Cần máy chủ ra được Internet.',
						more: 'Chỉ là gợi ý: ngày khác biệt hiện ở bảng xem trước bên dưới với nút Thêm / Bỏ, bấm rồi Lưu mới có hiệu lực. Nút "Đồng bộ ngay" dùng được cả khi tắt công tắc này.',
						type: 'bool',
						defaultOn: false,
						onText: 'Hằng tuần',
						offText: 'Tắt',
					},
					{
						key: 'TRAINING_HOLIDAYS_ICS_URL',
						label: 'Nguồn lịch (iCal)',
						hint: 'Để trống = lịch "Ngày lễ ở Việt Nam" của Google.',
						more: 'Địa chỉ https tới file .ics công khai. Ngày có mô tả "Ngày lễ kỷ niệm" (không được nghỉ) tự bị bỏ qua.',
						placeholder: 'https://calendar.google.com/…/basic.ics',
					},
					{
						key: 'TRAINING_HOLIDAYS',
						label: 'Thêm / bỏ ngày nghỉ',
						hint: 'Ngày nghỉ khác (nghỉ của viện, hoán đổi theo thông báo). Gõ "-" trước một ngày để bỏ ngày tự tính.',
						more: 'Phân cách bằng dấu phẩy hoặc xuống dòng. DD/MM = lặp lại hằng năm (vd 24/11); DD/MM/YYYY = một ngày cụ thể (vd 02/01/2026); -DD/MM/YYYY = bỏ ngày đó (vd -03/09/2026).',
						type: 'textarea',
						placeholder: '24/11, 02/01/2026, -03/09/2026',
					},
				],
			},
			{ fields: [TUITION_TOGGLE] },
			{
				title: 'Học phí — chuyển khoản',
				hiddenBy: 'MODULE_TUITION',
				desc: 'Cổng học viên tạo mã VietQR có sẵn số tiền và nội dung chuyển khoản riêng từng học viên. Chưa khai thì học viên chỉ xem số phải nộp và nộp tại phòng Đào tạo.',
				more: 'Học viên báo đã chuyển khoản kèm ảnh chứng từ; phòng Đào tạo đối chiếu sao kê rồi xác nhận ở tab Học phí của khóa — hệ thống cấp phiếu thu (nội bộ, không thay hóa đơn điện tử).',
				layout: 'grid',
				fields: [
					{
						key: 'TUITION_BANK_BIN',
						label: 'Ngân hàng nhận',
						type: 'select',
						options: [['', '— Chưa chọn —'], ...TUITION_BANKS],
					},
					{ key: 'TUITION_ACCOUNT_NO', label: 'Số tài khoản', placeholder: '0011001234567' },
					{
						key: 'TUITION_ACCOUNT_NAME',
						label: 'Chủ tài khoản',
						hint: 'Viết như tên hiện trong app ngân hàng.',
						placeholder: 'BENH VIEN HUU NGHI DA KHOA NGHE AN',
					},
					{
						key: 'TUITION_RECEIPT_UNIT',
						label: 'Đơn vị thu (in trên phiếu thu)',
						placeholder: 'Trung tâm Đào tạo và Chỉ đạo tuyến',
					},
				],
			},
			{
				title: 'Kết nối ngân hàng (tự đối soát)',
				desc: 'Ngân hàng báo giao dịch tiền vào tài khoản trên qua webhook. Giao dịch đúng nội dung "HP <mã ghi danh>" và không vượt số còn phải nộp được ghi nhận, cấp phiếu thu và báo học viên ngay; còn lại vào Đào tạo → Đối soát ngân hàng.',
				more: 'Mỗi ngân hàng có API riêng: cần hợp đồng / tài liệu kết nối từ ngân hàng để thêm bộ kết nối tương ứng. "Webhook chung" nhận JSON có chữ ký HMAC-SHA256 (header X-Bank-Timestamp + X-Bank-Signature = hex HMAC(khóa bí mật, "<timestamp>.<body>")) — dùng cho dịch vụ trung gian hoặc để thử. Giao dịch gửi lại (trùng mã giao dịch) không bị tính 2 lần.',
				hiddenBy: 'MODULE_TUITION',
				tool: 'bank-connect',
				fields: [
					{
						key: 'TUITION_BANK_API_PROVIDER',
						label: 'Bộ kết nối',
						hint: 'Đổi bộ kết nối thì khai lại đường dẫn webhook với ngân hàng.',
						type: 'select',
						options: [
							['', 'Tắt'],
							['generic', 'Webhook chung (chữ ký HMAC-SHA256)'],
						],
					},
					{
						key: 'TUITION_BANK_API_SECRET',
						label: 'Khóa bí mật (ký webhook)',
						hint: 'Ít nhất 16 ký tự, khai giống bên ngân hàng. Được che sau khi lưu, không xuất ra file cấu hình.',
						type: 'password',
					},
					{
						key: 'TUITION_BANK_AUTO_CONFIRM',
						label: 'Tự xác nhận khi khớp',
						hint: 'Tắt thì mọi giao dịch vào hàng chờ (đã gợi ý sẵn học viên) để cán bộ bấm ghi nhận.',
						type: 'bool',
						defaultOn: true,
						onText: 'Tự ghi nhận',
						offText: 'Chờ duyệt',
					},
					{
						key: 'TUITION_BANK_API_ALLOWED_IPS',
						label: 'Chỉ nhận từ IP',
						hint: 'IP / dải IP máy chủ ngân hàng, phân cách dấu phẩy. Để trống = không giới hạn IP (vẫn bắt buộc chữ ký).',
						placeholder: '203.0.113.10, 198.51.100.0/24',
					},
				],
			},
			{
				title: 'Đăng ký khóa ĐTLT từ cổng công khai',
				desc: 'Form /dang-ky-khoa-hoc. Phòng Đào tạo cũng bật/tắt được 2 công tắc này ở hộp "Link đăng ký" của trang Đào tạo liên tục.',
				more: 'Người đăng ký ký xác nhận điện tử, tự sửa bản khai khi đơn còn chờ duyệt (trang Tra cứu đơn đăng ký), hồ sơ đính kèm được tự kiểm tra loại file.',
				layout: 'tiles',
				tool: 'doc-check',
				fields: [
					{
						key: 'TRAINING_REGISTRATION_EMAIL_OTP',
						label: 'Xác minh email bằng mã OTP',
						hint: 'Tắt thì gửi đơn không cần mã xác minh — và cũng không còn email xác nhận.',
						more: 'Email xác nhận chỉ gửi tới địa chỉ đã xác minh, nên khi tắt OTP người đăng ký sẽ không nhận được email xác nhận đơn.',
						type: 'bool',
						defaultOn: true,
						onText: 'Bắt buộc',
						offText: 'Không bắt buộc',
					},
					{
						key: 'TRAINING_REGISTRATION_DOC_CHECK',
						label: 'Tự kiểm tra file hồ sơ (OCR / mã QR)',
						hint: 'Cảnh báo người duyệt khi file có vẻ nộp nhầm loại — chỉ cảnh báo, không tự từ chối.',
						more: 'Phát hiện nộp nhầm loại, thiếu mặt CCCD, trang trắng hoặc trùng file. Tắt thì ẩn mọi cảnh báo; file nộp trong lúc tắt được kiểm khi bật lại.',
						type: 'bool',
						defaultOn: true,
						onText: 'Bật',
						offText: 'Tắt',
					},
				],
			},
			{
				title: 'Máy chấm công vân tay',
				desc: 'Lượt chấm tự ghép vào điểm danh buổi học và điểm danh theo ca (khi bật phân hệ Ca & điểm danh); học viên đang học tự được gửi xuống máy. Quản lý máy ở trang Máy chấm công.',
				more: 'Mã người dùng trên máy = mã học viên bỏ chữ HV. Lượt chấm không ghi đè điểm danh giảng viên đã nhập tay và không sửa điểm đã khóa.',
				layout: 'grid',
				fields: [
					{
						key: 'DEVICE_CHECKIN_EARLY_MIN',
						label: 'Chấm sớm nhất',
						hint: 'Trước giờ bắt đầu buổi học.',
						type: 'number',
						placeholder: '30',
						unit: 'phút',
						min: 0,
						max: 240,
					},
					{
						key: 'DEVICE_LATE_AFTER_MIN',
						label: 'Tính đi muộn sau',
						hint: 'Quá giờ bắt đầu bao nhiêu phút thì ghi "Muộn".',
						type: 'number',
						placeholder: '15',
						unit: 'phút',
						min: 0,
						max: 240,
					},
					{
						key: 'DEVICE_CLEANUP_DAYS',
						label: 'Dọn học viên khỏi máy sau',
						hint: 'Tính từ ngày khóa học kết thúc.',
						type: 'number',
						placeholder: '30',
						unit: 'ngày',
						min: 0,
						max: 365,
					},
					{
						key: 'DEVICE_FP_SYNC',
						label: 'Chép vân tay giữa các máy',
						hint: 'Học viên chỉ đăng ký vân tay ở 1 máy.',
						more: 'Bật thì server lưu mẫu vân tay (đã mã hóa, không ai xem được) để chép sang máy khác, và xóa khi học viên được dọn khỏi máy. Đây là dữ liệu sinh trắc học (Nghị định 13/2023): cần thông báo và có sự đồng ý của học viên.',
						type: 'bool',
						defaultOn: true,
						onText: 'Bật',
						offText: 'Tắt',
					},
				],
			},
			{
				title: 'Điểm đạt & chuyên cần',
				desc: 'Theo Phụ lục III TT 32/2023. Lý thuyết đạt khi ≥ ngưỡng; thực hành đạt khi LỚN HƠN ngưỡng (60% ⇒ phải trên 6,0/10).',
				layout: 'grid',
				fields: [
					{ key: 'GRADE_THEORY_PASS_PCT', label: 'Điểm đạt lý thuyết', type: 'number', placeholder: '60', unit: '%', min: 0, max: 100 },
					{ key: 'GRADE_PRACTICE_PASS_PCT', label: 'Điểm đạt thực hành', type: 'number', placeholder: '60', unit: '%', min: 0, max: 100 },
					{ key: 'ATTEND_THEORY_MAX_ABSENT_PCT', label: 'Vắng lý thuyết tối đa', hint: 'Vắng quá tỉ lệ số buổi thì không đạt.', type: 'number', placeholder: '10', unit: '%', min: 0, max: 100 },
					{
						key: 'ATTEND_PRACTICE_MAX_ABSENT_PCT',
						label: 'Vắng thực hành tối đa',
						hint: '0 = không được vắng (bất khả kháng thì học bù).',
						type: 'number',
						placeholder: '0',
						unit: '%',
						min: 0,
						max: 100,
					},
					{
						key: 'GRADE_MAX_RETAKES',
						label: 'Thi lại tối đa / phần',
						hint: 'Lấy kết quả lần cao nhất.',
						type: 'number',
						placeholder: '1',
						unit: 'lần',
						min: 0,
					},
				],
			},
			{
				title: 'Xếp loại',
				desc: 'Điểm tổng = trung bình LT, TH theo số tiết, thang 10. Chỉ xếp loại khi Đạt.',
				layout: 'grid',
				fields: [
					{ key: 'GRADE_RANK_EXCELLENT', label: 'Giỏi từ', type: 'number', placeholder: '8', unit: 'điểm', min: 0, max: 10 },
					{ key: 'GRADE_RANK_GOOD', label: 'Khá từ', type: 'number', placeholder: '6.5', unit: 'điểm', min: 0, max: 10 },
					{ key: 'GRADE_RANK_AVERAGE', label: 'Trung bình từ', type: 'number', placeholder: '5', unit: 'điểm', min: 0, max: 10 },
				],
			},
		],
	},
];

export const CATS = [...new Set(SECTIONS.map((s) => s.cat))];
export const FIELDS = [...new Map(SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields)).map((f) => [f.key, f])).values()];
export const sectionFields = (s: Section) => [...new Set(s.groups.flatMap((g) => g.fields))];
export type Values = Record<string, string>;

/** Bỏ dấu để tìm "bao mat" ra "Bảo mật". */
export const fold = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase();

export const splitList = (v: string | undefined) => (v ?? '').split(',').filter(Boolean);

/** Tab chứa ô này (ô dùng chung nhiều tab thì lấy tab đầu). */
export const sectionOf = (f: Field) => SECTIONS.find((s) => sectionFields(s).includes(f))!;

/** Giá trị dễ đọc cho danh sách "xem lại thay đổi" trước khi lưu. */
// ── Ô 'matrix': JSON { hàng: [cột…] }, hàng vắng mặt = tick đủ mọi cột ──
/** Giá trị lưu → hàng → các cột đang tick (đủ mọi hàng của f.matrix) */
export const parseMatrix = (f: Field, v: string | undefined): Record<string, string[]> => {
	const cols = f.matrix!.cols.map(([c]) => c);
	let obj: Record<string, unknown> = {};
	try {
		const parsed = v ? JSON.parse(v) : {};
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) obj = parsed;
	} catch {
		/* giá trị hỏng ⇒ coi như mặc định (tick đủ) */
	}
	return Object.fromEntries(
		f.matrix!.rows.map(([r]) => {
			const list = obj[r];
			return [r, Array.isArray(list) ? cols.filter((c) => list.includes(c)) : cols];
		}),
	);
};
/** Ngược lại: chỉ ghi hàng bị bỏ bớt cột, theo thứ tự khai báo; không hàng nào ⇒ '' (mặc định) */
export const serializeMatrix = (f: Field, value: Record<string, string[]>): string => {
	const cols = f.matrix!.cols.map(([c]) => c);
	const out: Record<string, string[]> = {};
	for (const [r] of f.matrix!.rows) {
		const list = cols.filter((c) => value[r]?.includes(c));
		if (list.length < cols.length) out[r] = list;
	}
	return Object.keys(out).length ? JSON.stringify(out) : '';
};

export const displayValue = (f: Field, v: string | undefined): string => {
	const s = (v ?? '').trim();
	if (f.type === 'matrix') {
		const m = parseMatrix(f, s);
		const n = f.matrix!.rows.filter(([r]) => m[r].length < f.matrix!.cols.length).length;
		return n ? `Giới hạn ${n} loại` : 'Mọi loại dùng mọi phương thức';
	}
	if (f.type === 'bool') return s === 'true' ? (f.onText ?? 'Bật') : (f.offText ?? 'Tắt');
	if (f.type === 'password') return s ? 'Đã đặt' : 'Chưa đặt';
	if (f.type === 'select') return f.options?.find(([o]) => o === s)?.[1] ?? s;
	if (f.type === 'multi') return `${splitList(s).length} định dạng`;
	if (f.type === 'menu') return splitList(s).length ? `Ẩn ${splitList(s).length} mục` : 'Hiện tất cả';
	// placeholder của ô số là mặc định backend; của ô chữ chỉ là ví dụ gợi ý
	if (!s) return f.type === 'number' && f.placeholder ? `Mặc định (${f.placeholder}${f.unit ? ` ${f.unit}` : ''})` : 'Để trống';
	const text = f.unit ? `${s} ${f.unit}` : s;
	return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

// ── Sao lưu / chuyển cấu hình sang máy khác (file JSON) ──
// Không gồm mật khẩu / khóa bí mật (ô 'password'); nhập vào chỉ ĐIỀN form, người dùng xem lại rồi bấm Lưu.
export const BACKUP_KIND = 'hospital-rms/system-settings';
export const exportableFields = FIELDS.filter((f) => f.type !== 'password');

export const buildBackup = (values: Values) => ({
	kind: BACKUP_KIND,
	version: 1,
	exported_at: new Date().toISOString(),
	values: Object.fromEntries(exportableFields.map((f) => [f.key, values[f.key] ?? ''])),
});

/** Đọc file sao lưu → các giá trị nạp được + khóa bị bỏ qua. Ném Error nếu không phải file sao lưu. */
export const parseBackup = (text: string) => {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		throw new Error('File không phải JSON hợp lệ');
	}
	const o = json as { kind?: unknown; values?: unknown };
	if (!o || o.kind !== BACKUP_KIND || !o.values || typeof o.values !== 'object' || Array.isArray(o.values))
		throw new Error('Không phải file sao lưu cấu hình hệ thống');
	const byKey = new Map(exportableFields.map((f) => [f.key, f]));
	const values: Values = {};
	const skipped: string[] = [];
	for (const [k, v] of Object.entries(o.values as Record<string, unknown>)) {
		const f = byKey.get(k);
		if (!f || (typeof v !== 'string' && typeof v !== 'boolean' && typeof v !== 'number')) {
			skipped.push(k);
			continue;
		}
		const s = String(v);
		// Công tắc phải rõ bật / tắt — rỗng sẽ hiện thành "tắt" dù mặc định máy chủ đang bật
		if (f.type === 'bool' && s !== 'true' && s !== 'false') {
			skipped.push(k);
			continue;
		}
		values[k] = s;
	}
	return { values, skipped };
};
