import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { Button, Card, SearchInput } from '../../../shared/components';
import { notify } from '../../../shared/utils/feedback';
import { cx } from '../../../shared/utils/cx';
import {
	BookOpenSvg,
	ClockSvg,
	EyeOffSvg,
	EyeSvg,
	InfoSvg,
	LayersSvg,
	MailSvg,
	MenuSvg,
	RefreshSvg,
	ShieldSvg,
	UploadSvg,
	WarnSvg,
} from '../../../assets/icons';
import { ADMIN_MENU } from '../../../layouts/AdminLayout/nav';
import { TRAINEE_MENU } from '../../../layouts/TraineeLayout/nav';
import { USER_MENU } from '../../../layouts/UserLayout/nav';
import { resetMenuConfig, type MenuCatalog } from '../../../shared/hooks/useMenuConfig';
import { resetModules } from '../../../shared/hooks/useModules';
import { resetUploadPolicy } from '../../../shared/hooks/useUploadPolicy';
import { getMyAttendance } from '../../portal/api/meApi';
import { settingsApi } from '../api/settingsApi';
import styles from './SystemSettings.module.css';
import RadiusMap from '../components/RadiusMap';

type Field = {
	key: string;
	label: string;
	hint?: string;
	/** Giải thích dài — ẩn sau "Xem thêm" để trang gọn. */
	more?: string;
	type?: 'bool' | 'text' | 'number' | 'password' | 'select' | 'textarea' | 'multi' | 'menu';
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

type Group = {
	title?: string;
	desc?: string;
	/** 'tiles' = lưới thẻ công tắc; 'grid' = lưới ô số gọn. Mặc định: mỗi cấu hình một dòng. */
	layout?: 'tiles' | 'grid';
	/** Công tắc tổng — khi tắt thì cảnh báo nhóm này chưa có tác dụng. */
	dependsOn?: { key: string; text: string };
	/** Công cụ hỗ trợ hiện cuối nhóm. */
	tool?: 'mail-test' | 'attendance-helper' | 'clamav-test';
	fields: Field[];
};

type Section = {
	id: string;
	title: string;
	sub: string;
	icon: typeof ShieldSvg;
	/** Ghi chú chung đầu tab. */
	note?: string;
	groups: Group[];
};

// Hiện ở cả tab "Phân hệ chức năng" lẫn tab "Điểm danh" (cùng 1 key)
const ATTENDANCE_TOGGLE: Field = {
	key: 'MODULE_ATTENDANCE',
	label: 'Điểm danh học viên',
	hint: 'Hiện mục Điểm danh ở cổng học viên (điểm danh vào/ra theo ca trong thời gian khóa học) và mục Ca & điểm danh cho quản trị.',
	more: 'Cấu hình IP và vị trí ở tab "Điểm danh" trước khi bật.',
	type: 'bool',
	defaultOn: false,
	onText: 'Đang bật',
	offText: 'Đã tắt',
};

const SECTIONS: Section[] = [
	{
		id: 'security',
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
						hint: 'Mật khẩu do quản trị cấp (mặc định = tên đăng nhập) mà quá hạn chưa đổi thì không đăng nhập được nữa, phải "Quên mật khẩu" hoặc nhờ quản trị đặt lại. 0 = không giới hạn.',
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
				desc: 'Google reCAPTCHA v2. Đặt đủ Site key + Secret key thì form đăng ký khóa học / đề tài hiện ô tích của Google; để trống cả hai = dùng kiểm tra chạy ngầm (proof-of-work), chạy được cả trong mạng nội bộ.',
				fields: [
					{
						key: 'RECAPTCHA_SITE_KEY',
						label: 'Site key',
						hint: 'Máy chủ phải gọi ra được www.google.com, không thì mọi lượt đăng ký bị từ chối.',
						more: 'Lấy ở google.com/recaptcha/admin → tạo site loại reCAPTCHA v2 "Tôi không phải người máy", thêm tên miền hệ thống.',
						placeholder: '6Lc…',
					},
					{
						key: 'RECAPTCHA_SECRET_KEY',
						label: 'Secret key',
						hint: 'Được che sau khi lưu. Để nguyên nếu không đổi.',
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
						['ACCOUNT_GRANTED', 'Cấp tài khoản thành viên đề tài', 'Báo thành viên mới, khoa và chủ nhiệm (không kèm mật khẩu).', false],
						['DEADLINE_REMINDER', 'Nhắc hạn nộp đợt NCKH', 'Trước hạn và khi quá hạn các mốc của đợt.', true],
						['COURSE_ENROLLMENT', 'Kết quả đăng ký khóa học', 'Gửi học viên khi đăng ký được duyệt / chờ / từ chối.', true],
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
				],
			},
		],
	},
	{
		id: 'menus',
		title: 'Menu hiển thị',
		sub: 'Bật/tắt từng mục menu',
		icon: MenuSvg,
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
		title: 'Tải lên',
		sub: 'Định dạng, dung lượng, quét virus',
		icon: UploadSvg,
		note: 'Định dạng & dung lượng áp dụng cho hồ sơ đề tài, hồ sơ học viên, minh chứng CME, tài liệu khóa học và cổng đăng ký công khai (video bài giảng, ảnh chèn nhận xét và file import Excel có quy định riêng). Hạn mức và quét virus áp dụng cho MỌI lượt tải lên. Ngoài ra mọi file luôn được kiểm tra nội dung thật khớp với đuôi file (chặn file .exe đổi tên thành .pdf).',
		groups: [
			{
				fields: [
					{
						key: 'UPLOAD_MAX_MB',
						label: 'Dung lượng tối đa mỗi file',
						type: 'number',
						placeholder: '50',
						unit: 'MB',
						min: 1,
						max: 1024,
					},
				],
			},
			{
				title: 'Định dạng được nhận',
				desc: 'Bấm để chọn / bỏ chọn. Chỉ chọn được trong danh sách định dạng an toàn.',
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
				title: 'Hạn mức tải lên',
				fields: [
					{
						key: 'UPLOAD_DAILY_QUOTA_MB',
						label: 'Tổng dung lượng mỗi tài khoản / ngày',
						hint: 'Chặn 1 tài khoản (bị chiếm hoặc script lỗi) tải lên liên tục làm đầy ổ đĩa máy chủ. Làm mới lúc 0h. 0 = không giới hạn.',
						type: 'number',
						placeholder: '2048',
						unit: 'MB',
						min: 0,
						max: 1048576,
					},
				],
			},
			{
				title: 'Quét virus (ClamAV)',
				desc: 'Quét mọi file tải lên bằng ClamAV trước khi lưu; file nhiễm bị xóa ngay và ghi vào nhật ký bảo mật. Để trống máy chủ = không quét.',
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
		title: 'Điểm danh',
		sub: 'Mạng, vị trí, đơn xin phép',
		icon: ClockSvg,
		groups: [
			{ fields: [ATTENDANCE_TOGGLE] },
			{
				title: 'Điều kiện điểm danh hợp lệ',
				desc: 'Học viên phải đạt CẢ HAI: đang dùng mạng bệnh viện VÀ đang ở trong bán kính quanh bệnh viện.',
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
		title: 'Đào tạo & CME',
		sub: 'Ngưỡng tín chỉ, chấm điểm',
		icon: BookOpenSvg,
		groups: [
			{
				title: 'Ngưỡng tín chỉ CME',
				layout: 'grid',
				fields: [
					{ key: 'CME_CYCLE_YEARS', label: 'Chu kỳ tính ngưỡng', hint: 'Số năm của một chu kỳ CME.', type: 'number', placeholder: '5', unit: 'năm', min: 1 },
					{ key: 'CME_MIN_HOURS', label: 'Giờ tín chỉ tối thiểu / chu kỳ', hint: 'Dùng cho cảnh báo thiếu tín chỉ.', type: 'number', placeholder: '120', unit: 'giờ', min: 0 },
					{
						key: 'PRACTICE_MENTOR_MAX_TRAINEES',
						label: 'Học viên tối đa / người hướng dẫn',
						hint: 'Hồ sơ thực hành GPHN cảnh báo (không chặn) khi vượt.',
						type: 'number',
						placeholder: '5',
						unit: 'người',
						min: 1,
					},
				],
			},
			{
				title: 'Tự cộng tín chỉ CME (khóa ĐTLT / CTCV)',
				layout: 'tiles',
				fields: [
					{
						key: 'CME_AUTO_TRAINEE',
						label: 'Cộng CME cho học viên',
						hint: 'Khi học viên nội viện có tài khoản được cấp giấy chứng nhận.',
						more: 'Ghi 1 dòng CME đã duyệt (tín chỉ = số giờ tín chỉ của chương trình, chưa khai thì theo số tiết). Thu hồi giấy chứng nhận thì thu hồi dòng CME.',
						type: 'bool',
						defaultOn: true,
						onText: 'Tự cộng',
						offText: 'Không cộng',
					},
					{
						key: 'CME_AUTO_LECTURER',
						label: 'Cộng CME cho giảng viên',
						hint: 'Khi khóa điểm, theo số tiết đảm nhận.',
						more: 'Giảng viên có tài khoản được ghi CME theo số tiết đảm nhận × hệ số danh mục "Giảng dạy về y khoa" (GIANGDAY).',
						type: 'bool',
						defaultOn: true,
						onText: 'Tự cộng',
						offText: 'Không cộng',
					},
				],
			},
			{
				title: 'Lớp học ĐTLT / CTCV',
				fields: [
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
					{
						key: 'TRAINING_HOLIDAYS',
						label: 'Ngày nghỉ lễ',
						hint: 'Bỏ qua khi gợi ý ngày học (cùng T7, CN).',
						more: 'Mỗi dòng 1 ngày: DD/MM = lễ cố định hằng năm (01/01, 30/04…), DD/MM/YYYY = 1 ngày cụ thể (Tết âm lịch).',
						type: 'textarea',
						placeholder: '01/01, 30/04, 01/05, 02/09, 16/02/2026',
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

const FIELDS = [...new Map(SECTIONS.flatMap((s) => s.groups.flatMap((g) => g.fields)).map((f) => [f.key, f])).values()];
const sectionFields = (s: Section) => [...new Set(s.groups.flatMap((g) => g.fields))];
type Values = Record<string, string>;

/** Bỏ dấu để tìm "bao mat" ra "Bảo mật". */
const fold = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase();

const splitList = (v: string | undefined) => (v ?? '').split(',').filter(Boolean);

export default function SystemSettings() {
	const [saved, setSaved] = useState<Values>({});
	const [form, setForm] = useState<Values>({});
	const [env, setEnv] = useState<Values>({}); // giá trị đang áp dụng từ .env khi chưa đặt qua UI
	const [params, setParams] = useSearchParams();
	const [query, setQuery] = useState('');
	const [showPass, setShowPass] = useState(false);
	const [hasSecret, setHasSecret] = useState<Record<string, boolean>>({}); // secret đã đặt (backend chỉ trả ••••••)
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [testTo, setTestTo] = useState('');
	const [testing, setTesting] = useState(false);
	const [clamTesting, setClamTesting] = useState(false);
	const [myIp, setMyIp] = useState<string | null>(null);
	const [locating, setLocating] = useState(false);

	// Tab nằm trên URL (?tab=mail) để F5 / gửi link vẫn mở đúng chỗ
	const tab = SECTIONS.some((s) => s.id === params.get('tab')) ? params.get('tab')! : SECTIONS[0].id;
	const setTab = (id: string) => {
		setQuery('');
		setParams({ tab: id }, { replace: true });
	};

	const load = () =>
		settingsApi
			.list()
			.then((rows) => {
				const v: Values = {};
				const e: Values = {};
				const secrets: Record<string, boolean> = {};
				for (const f of FIELDS) {
					const r = rows.find((x) => x.setting_key === f.key);
					if (f.type === 'bool') {
						v[f.key] = r?.effective === 'true' || r?.effective === 'false' ? r.effective : String(!!f.defaultOn);
					} else if (f.type === 'multi') {
						v[f.key] = r?.effective || f.defaultValue || '';
					} else {
						v[f.key] = r?.value ?? '';
						if (!r?.value && r?.effective) e[f.key] = r.effective;
					}
					if (f.type === 'password') secrets[f.key] = !!r?.has_value;
				}
				setHasSecret(secrets);
				setSaved(v);
				setForm(v);
				setEnv(e);
			})
			.catch(() => notify.error('Không thể tải cấu hình'))
			.finally(() => setLoading(false));

	useEffect(() => {
		load();
	}, []);
	useEffect(() => {
		if (tab === 'attendance' && myIp === null) getMyAttendance().then((r) => setMyIp(r.client_ip ?? '')).catch(() => setMyIp(''));
	}, [tab, myIp]);

	const set = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));
	const isDirty = (f: Field) => form[f.key] !== saved[f.key];
	const dirty = FIELDS.filter(isDirty);
	const on = (key: string) => saved[key] === 'true';

	const errorOf = (f: Field): string | null => {
		const v = (form[f.key] ?? '').trim();
		if (f.type === 'multi' && !v) return 'Chọn ít nhất 1 định dạng';
		if (f.type !== 'number' || !v) return null;
		const n = Number(v);
		if (!Number.isFinite(n)) return 'Phải là số';
		if (f.min !== undefined && n < f.min) return `Nhỏ nhất là ${f.min}`;
		if (f.max !== undefined && n > f.max) return `Lớn nhất là ${f.max}`;
		return null;
	};
	const invalid = dirty.filter((f) => errorOf(f));

	const useCurrentLocation = () => {
		if (!navigator.geolocation) return notify.error('Trình duyệt không hỗ trợ định vị (cần HTTPS)');
		setLocating(true);
		navigator.geolocation.getCurrentPosition(
			({ coords }) => {
				set('ATTENDANCE_LOCATION', `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}`);
				notify.success(`Đã lấy vị trí (sai số ±${Math.round(coords.accuracy)}m) — nhớ bấm Lưu`);
				setLocating(false);
			},
			(e) => {
				notify.error(
					e.code === 1
						? 'Bạn đã chặn quyền vị trí cho trang này'
						: e.code === 2
							? 'Thiết bị không xác định được vị trí — bật Dịch vụ định vị của hệ điều hành (Windows: Cài đặt → Quyền riêng tư → Vị trí)'
							: 'Lấy vị trí quá lâu — thử lại hoặc nhập tọa độ từ Google Maps',
				);
				setLocating(false);
			},
			{ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
		);
	};
	const addMyIp = () => {
		const cur = (form.ATTENDANCE_ALLOWED_IPS ?? '').split(/[\s,;]+/).filter(Boolean);
		if (myIp && !cur.includes(myIp)) set('ATTENDANCE_ALLOWED_IPS', [...cur, myIp].join(', '));
	};

	const save = async () => {
		if (!dirty.length || saving) return;
		if (invalid.length) {
			const s = SECTIONS.find((x) => sectionFields(x).includes(invalid[0]));
			if (s && !query) setTab(s.id);
			return notify.error(`${invalid[0].label}: ${errorOf(invalid[0])}`);
		}
		setSaving(true);
		try {
			for (const f of dirty) await settingsApi.update(f.key, form[f.key]);
			resetUploadPolicy();
			resetModules();
			resetMenuConfig();
			notify.success(`Đã lưu ${dirty.length} thay đổi`);
			await load();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	// Ctrl+S để lưu; cảnh báo khi rời trang còn thay đổi chưa lưu
	const saveRef = useRef(save);
	useEffect(() => {
		saveRef.current = save;
	});
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				saveRef.current();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
	const hasDirty = dirty.length > 0;
	useEffect(() => {
		if (!hasDirty) return;
		const warn = (e: BeforeUnloadEvent) => e.preventDefault();
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [hasDirty]);

	const sendTest = async () => {
		setTesting(true);
		try {
			await settingsApi.testMail(testTo.trim());
			notify.success(`Đã gửi email thử tới ${testTo.trim()}`);
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Gửi thử thất bại');
		} finally {
			setTesting(false);
		}
	};

	const testClamav = async () => {
		setClamTesting(true);
		try {
			await settingsApi.testClamav();
			notify.success('Kết nối ClamAV thành công — đang quét file tải lên');
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Kiểm tra thất bại');
		} finally {
			setClamTesting(false);
		}
	};

	const modules = SECTIONS.find((s) => s.id === 'modules')!.groups[0].fields;
	const smtp = saved.SMTP_HOST || env.SMTP_HOST;
	const clamHost = saved.CLAMAV_HOST || env.CLAMAV_HOST;
	const stats = [
		{ label: '2FA quản trị', value: on('REQUIRE_2FA_FOR_ADMINS') ? 'Bắt buộc' : 'Không bắt buộc', ok: on('REQUIRE_2FA_FOR_ADMINS'), tab: 'security' },
		{ label: 'Quên mật khẩu', value: on('PASSWORD_RESET_ENABLED') ? 'Cho phép' : 'Đã tắt', ok: on('PASSWORD_RESET_ENABLED'), tab: 'security' },
		{ label: 'Gửi email', value: on('MAIL_ENABLED') ? 'Đang bật' : 'Đang tắt', ok: on('MAIL_ENABLED'), tab: 'mail' },
		{ label: 'Máy chủ SMTP', value: smtp || 'Chưa cấu hình', ok: !!smtp, tab: 'mail' },
		{ label: 'Quét virus', value: clamHost ? `ClamAV ${clamHost}` : 'Chưa bật', ok: !!clamHost, tab: 'upload' },
		{ label: 'Phân hệ', value: `${modules.filter((f) => on(f.key)).length}/${modules.length} đang bật`, ok: true, tab: 'modules' },
	];

	const renderSwitch = (f: Field) => {
		const checked = form[f.key] === 'true';
		return (
			<label className={styles.switch}>
				<span className={cx(styles.switchText, checked && styles.switchTextOn)}>{checked ? f.onText ?? 'Bật' : f.offText ?? 'Tắt'}</span>
				<input id={f.key} type='checkbox' checked={checked} onChange={(e) => set(f.key, String(e.target.checked))} />
				<span className={styles.track} />
			</label>
		);
	};

	const renderMulti = (f: Field) => {
		const picked = new Set(splitList(form[f.key]));
		const toggle = (v: string) => {
			if (picked.has(v)) picked.delete(v);
			else picked.add(v);
			set(f.key, f.options!.map(([o]) => o).filter((o) => picked.has(o)).join(','));
		};
		const cats = [...new Set(f.options!.map((o) => o[2] ?? ''))];
		return (
			<div className={styles.multi}>
				{cats.map((c) => (
					<div className={styles.chipRow} key={c}>
						<span className={styles.chipCat}>{c}</span>
						<div className={styles.chips}>
							{f.options!
								.filter((o) => (o[2] ?? '') === c)
								.map(([v, l]) => (
									<button
										key={v}
										type='button'
										className={cx(styles.chip, picked.has(v) && styles.chipOn)}
										aria-pressed={picked.has(v)}
										onClick={() => toggle(v)}
									>
										{l}
									</button>
								))}
						</div>
					</div>
				))}
				<div className={styles.multiFoot}>
					<span>Đã chọn {picked.size} định dạng</span>
					{form[f.key] !== f.defaultValue && (
						<button type='button' className={styles.linkBtn} onClick={() => set(f.key, f.defaultValue ?? '')}>
							Dùng bộ mặc định
						</button>
					)}
				</div>
			</div>
		);
	};

	const renderMenu = (f: Field) => {
		const hidden = new Set(splitList(form[f.key]));
		const toggle = (k: string) => {
			if (hidden.has(k)) hidden.delete(k);
			else hidden.add(k);
			set(f.key, f.menu!.flatMap((g) => g.items.map((i) => i.key)).filter((x) => hidden.has(x)).join(','));
		};
		// Mục của module đang tắt (theo form, kể cả chưa lưu) thì ẩn dù bật ở đây.
		const moduleOff = (m?: string) => !!m && form[`MODULE_${m.toUpperCase()}`] === 'false';
		return (
			<div className={styles.menuSections}>
				{f.menu!.map((g) => (
					<div key={g.section}>
						<div className={styles.menuSectionTitle}>{g.section}</div>
						<div className={styles.menuGrid}>
							{g.items.map((it) => {
								const visible = it.locked || !hidden.has(it.key);
								return (
									<label key={it.key} className={cx(styles.menuItem, !visible && styles.menuItemOff)}>
										<span className={styles.menuLabel}>{it.label}</span>
										{it.locked && <span className={styles.tag}>Luôn hiện</span>}
										{!it.locked && moduleOff(it.module) && (
											<span className={cx(styles.tag, styles.tagWarn)} title='Phân hệ của mục này đang tắt ở tab "Phân hệ chức năng"'>
												Phân hệ tắt
											</span>
										)}
										<span className={styles.switch}>
											<input type='checkbox' checked={visible} disabled={it.locked} onChange={() => toggle(it.key)} />
											<span className={cx(styles.track, styles.trackSm)} />
										</span>
									</label>
								);
							})}
						</div>
					</div>
				))}
			</div>
		);
	};

	const renderInput = (f: Field) => {
		if (f.type === 'select') {
			return (
				<select id={f.key} className={styles.input} value={form[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
					{f.options!.map(([v, l]) => (
						<option key={v} value={v}>
							{l}
						</option>
					))}
				</select>
			);
		}
		if (f.type === 'textarea') {
			return (
				<textarea
					id={f.key}
					className={styles.input}
					rows={2}
					placeholder={env[f.key] ?? f.placeholder}
					value={form[f.key] ?? ''}
					onChange={(e) => set(f.key, e.target.value)}
				/>
			);
		}
		if (f.type === 'number') {
			return (
				<div className={cx(styles.numWrap, errorOf(f) && styles.invalid)}>
					<input
						id={f.key}
						className={styles.numInput}
						type='number'
						inputMode='decimal'
						min={f.min}
						max={f.max}
						placeholder={env[f.key] ?? f.placeholder}
						value={form[f.key] ?? ''}
						onChange={(e) => set(f.key, e.target.value)}
					/>
					{f.unit && <span className={styles.unit}>{f.unit}</span>}
				</div>
			);
		}
		const isPass = f.type === 'password';
		return (
			<div className={styles.inputWrap}>
				<input
					id={f.key}
					className={styles.input}
					type={isPass && !showPass ? 'password' : 'text'}
					autoComplete='off'
					placeholder={isPass ? (hasSecret[f.key] ? 'Đã đặt — nhập để thay đổi' : 'Chưa đặt') : (env[f.key] ?? f.placeholder)}
					value={form[f.key] ?? ''}
					onChange={(e) => set(f.key, e.target.value)}
					onFocus={(e) => isPass && e.target.value === '••••••' && set(f.key, '')}
				/>
				{isPass && (
					<button
						type='button'
						className={styles.eyeBtn}
						onClick={() => setShowPass((s) => !s)}
						aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
						title={showPass ? 'Ẩn' : 'Hiện'}
					>
						{showPass ? <EyeOffSvg /> : <EyeSvg />}
					</button>
				)}
			</div>
		);
	};

	/** Dòng phụ dưới ô nhập: lỗi > nguồn .env > mặc định khi để trống. */
	const renderNote = (f: Field) => {
		const err = errorOf(f);
		if (err && f.type !== 'multi') return <span className={styles.error}>{err}</span>;
		if (f.type === 'bool' || f.type === 'multi' || f.type === 'password' || form[f.key]) return null;
		if (env[f.key]) return <span className={styles.envNote}>Đang dùng giá trị trong file .env</span>;
		if (f.type === 'number' && f.placeholder)
			return (
				<span className={styles.defaultNote}>
					Để trống = mặc định {f.placeholder}
					{f.unit && ` ${f.unit}`}
				</span>
			);
		return null;
	};

	const renderRevert = (f: Field) =>
		isDirty(f) && (
			<button type='button' className={styles.revert} onClick={() => set(f.key, saved[f.key])} title='Trả về giá trị đã lưu'>
				<RefreshSvg /> Hoàn tác
			</button>
		);

	const renderLabel = (f: Field, withFor = true) => (
		<div className={styles.labelCol}>
			<div className={styles.labelLine}>
				{withFor ? (
					<label className={styles.label} htmlFor={f.key}>
						{f.label}
					</label>
				) : (
					<span className={styles.label}>{f.label}</span>
				)}
				{renderRevert(f)}
			</div>
			{f.hint && <p className={styles.hint}>{f.hint}</p>}
			{f.more && (
				<details className={styles.more}>
					<summary>Xem thêm</summary>
					<p>{f.more}</p>
				</details>
			)}
		</div>
	);

	const renderField = (f: Field, layout?: Group['layout']) => {
		const d = isDirty(f);
		if (f.type === 'menu') {
			return (
				<div key={f.key} className={cx(styles.menuBlock, d && styles.dirtyBlock)}>
					{renderMenu(f)}
				</div>
			);
		}
		if (f.type === 'multi') {
			return (
				<div key={f.key} className={cx(styles.menuBlock, d && styles.dirtyBlock)}>
					{d && <div className={styles.blockRevert}>{renderRevert(f)}</div>}
					{renderMulti(f)}
					{renderNote(f)}
				</div>
			);
		}
		if (layout === 'tiles' && f.type === 'bool') {
			const checked = form[f.key] === 'true';
			return (
				<div key={f.key} className={cx(styles.tile, checked && styles.tileOn, d && styles.dirty)}>
					<div className={styles.tileHead}>
						<label className={styles.label} htmlFor={f.key}>
							{f.label}
						</label>
						{renderSwitch(f)}
					</div>
					{f.hint && <p className={styles.hint}>{f.hint}</p>}
					{f.more && (
						<details className={styles.more}>
							<summary>Xem thêm</summary>
							<p>{f.more}</p>
						</details>
					)}
					{renderRevert(f)}
				</div>
			);
		}
		if (layout === 'grid') {
			return (
				<div key={f.key} className={cx(styles.cell, d && styles.dirty)}>
					{renderLabel(f)}
					{renderInput(f)}
					{renderNote(f)}
				</div>
			);
		}
		if (f.type === 'bool') {
			return (
				<div key={f.key} className={cx(styles.row, styles.rowSwitch, d && styles.dirty)}>
					{renderLabel(f)}
					{renderSwitch(f)}
				</div>
			);
		}
		return (
			<div key={f.key} className={cx(styles.row, d && styles.dirty)}>
				{renderLabel(f)}
				<div className={styles.control}>
					{renderInput(f)}
					{renderNote(f)}
				</div>
			</div>
		);
	};

	const renderTool = (tool: Group['tool']): ReactNode => {
		if (tool === 'mail-test') {
			return (
				<div className={styles.toolRow}>
					<input
						className={styles.input}
						type='email'
						placeholder='email-nhan@benhvien.vn'
						value={testTo}
						onChange={(e) => setTestTo(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && testTo.trim() && !dirty.length && sendTest()}
					/>
					<Button variant='secondary' loading={testing} disabled={!testTo.trim() || dirty.length > 0} onClick={sendTest}>
						Gửi thử
					</Button>
					{dirty.length > 0 && <span className={styles.toolHint}>Lưu thay đổi trước khi gửi thử</span>}
				</div>
			);
		}
		if (tool === 'clamav-test') {
			return (
				<div className={styles.toolRow}>
					<Button variant='secondary' loading={clamTesting} disabled={!clamHost || dirty.length > 0} onClick={testClamav}>
						Kiểm tra kết nối
					</Button>
					<span className={dirty.length > 0 || !clamHost ? styles.toolHint : styles.toolNote}>
						{dirty.length > 0
							? 'Lưu thay đổi trước khi kiểm tra'
							: clamHost
								? 'Gửi lệnh PING và quét thử một đoạn dữ liệu sạch tới ClamAV đã lưu.'
								: 'Đang tắt — điền máy chủ ClamAV và lưu để bật quét virus.'}
					</span>
				</div>
			);
		}
		if (tool === 'attendance-helper') {
			// Bản đồ xem trước tọa độ + bán kính đang nhập (chưa lưu cũng hiện)
			const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(form.ATTENDANCE_LOCATION ?? '');
			const [lat, lng] = m ? [Number(m[1]), Number(m[2])] : [NaN, NaN];
			const hasPoint = Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
			const radius = Number(form.ATTENDANCE_RADIUS_M) > 0 ? Number(form.ATTENDANCE_RADIUS_M) : 200;
			return (
				<div className={styles.helper}>
					<InfoSvg className={styles.helperIcon} />
					<div className={styles.helperText}>
						IP máy chủ đang thấy từ máy bạn: <b>{myIp === null ? 'đang kiểm tra…' : myIp || 'không rõ'}</b>. Nếu bạn đang ở bệnh viện, bấm để điền nhanh:
					</div>
					<div className={styles.toolRow}>
						<Button variant='secondary' size='sm' disabled={!myIp} onClick={addMyIp}>
							Thêm IP hiện tại
						</Button>
						<Button variant='secondary' size='sm' loading={locating} onClick={useCurrentLocation}>
							Dùng vị trí hiện tại
						</Button>
					</div>
					<div className={styles.mapBox}>
						<RadiusMap
							className={styles.mapFrame}
							lat={hasPoint ? lat : null}
							lng={hasPoint ? lng : null}
							radius={radius}
							onPick={(a, b) => set('ATTENDANCE_LOCATION', `${a.toFixed(6)}, ${b.toFixed(6)}`)}
						/>
						<span className={styles.toolNote}>
							Bấm lên bản đồ để chọn tọa độ bệnh viện (nhớ bấm Lưu).
							{hasPoint && (
								<>
									{' '}Chấm đỏ = tọa độ đang chọn, vòng xanh = vùng điểm danh hợp lệ (bán kính {radius}m) —{' '}
									<a href={`https://www.google.com/maps?q=${lat},${lng}`} target='_blank' rel='noreferrer'>
										mở bằng Google Maps
									</a>
								</>
							)}
						</span>
					</div>
				</div>
			);
		}
		return null;
	};

	const renderGroup = (g: Group, key: string | number, fields = g.fields) => {
		const offBy = g.dependsOn && form[g.dependsOn.key] === 'false';
		const isMenu = fields[0]?.type === 'menu';
		const menuHidden = isMenu ? splitList(form[fields[0].key]).length : 0;
		return (
			<Card key={key} className={styles.groupCard}>
				{g.title && (
					<div className={styles.groupHead}>
						<div>
							<div className={styles.groupTitle}>{g.title}</div>
							{g.desc && <p className={styles.groupDesc}>{g.desc}</p>}
						</div>
						{isMenu && (
							<div className={styles.groupActions}>
								<span className={cx(styles.countPill, menuHidden > 0 && styles.countPillWarn)}>
									{menuHidden ? `Đang ẩn ${menuHidden} mục` : 'Hiện tất cả'}
								</span>
								{menuHidden > 0 && (
									<button type='button' className={styles.linkBtn} onClick={() => set(fields[0].key, '')}>
										Hiện lại tất cả
									</button>
								)}
							</div>
						)}
					</div>
				)}
				{offBy && (
					<div className={styles.warnNote}>
						<WarnSvg /> {g.dependsOn!.text}
					</div>
				)}
				<div className={cx(styles.groupBody, g.layout === 'tiles' && styles.tiles, g.layout === 'grid' && styles.grid, offBy && styles.dimmed)}>
					{fields.map((f) => renderField(f, g.layout))}
				</div>
				{g.tool && !query && renderTool(g.tool)}
			</Card>
		);
	};

	// Tìm trên mọi tab: khớp tên, mô tả, tên nhóm hoặc mã cấu hình
	const results = useMemo(() => {
		const q = fold(query.trim());
		if (!q) return null;
		const seen = new Set<string>();
		return SECTIONS.map((s) => ({
			section: s,
			groups: s.groups
				.map((g) => ({
					group: g,
					fields: g.fields.filter((f) => {
						if (seen.has(f.key)) return false;
						const hit = fold([s.title, g.title, f.label, f.hint, f.more, f.key].filter(Boolean).join(' ')).includes(q);
						if (hit) seen.add(f.key);
						return hit;
					}),
				}))
				.filter((x) => x.fields.length),
		})).filter((x) => x.groups.length);
	}, [query]);

	const section = SECTIONS.find((s) => s.id === tab)!;
	const SectionIcon = section.icon;

	return (
		<AdminLayout pageTitle='Cấu hình hệ thống' pageSubtitle='Bật/tắt chức năng bảo mật, email SMTP, ngưỡng CME — áp dụng ngay, không cần khởi động lại'>
			<div className={styles.summary}>
				{stats.map((s) => (
					<button type='button' className={styles.stat} key={s.label} onClick={() => setTab(s.tab)} title='Mở phần cấu hình này'>
						<span className={cx(styles.dot, s.ok && styles.dotOn)} />
						<span className={styles.statText}>
							<span className={styles.statLabel}>{s.label}</span>
							<span className={styles.statValue}>{loading ? '…' : s.value}</span>
						</span>
					</button>
				))}
			</div>

			<div className={styles.layout}>
				<aside className={styles.side}>
					<SearchInput value={query} onChange={setQuery} placeholder='Tìm cấu hình…' />
					<nav className={styles.tabs}>
						{SECTIONS.map((s) => {
							const Icon = s.icon;
							const n = sectionFields(s).filter(isDirty).length;
							return (
								<button
									key={s.id}
									type='button'
									className={cx(styles.tab, s.id === tab && !query && styles.tabActive)}
									onClick={() => setTab(s.id)}
								>
									<span className={styles.tabIcon}>
										<Icon />
									</span>
									<span className={styles.tabText}>
										<span className={styles.tabTitle}>{s.title}</span>
										<span className={styles.tabSub}>{s.sub}</span>
									</span>
									{n > 0 && (
										<span className={styles.tabBadge} title={`${n} thay đổi chưa lưu`}>
											{n}
										</span>
									)}
								</button>
							);
						})}
					</nav>
				</aside>

				<div className={styles.main}>
					{results ? (
						<>
							<div className={styles.sectionHead}>
								<div>
									<h2 className={styles.sectionTitle}>Kết quả tìm “{query.trim()}”</h2>
									<p className={styles.sectionSub}>
										{results.length
											? `${results.reduce((a, r) => a + r.groups.reduce((b, g) => b + g.fields.length, 0), 0)} cấu hình phù hợp`
											: 'Không tìm thấy cấu hình nào. Thử từ khóa khác, ví dụ "email", "2FA", "điểm danh".'}
									</p>
								</div>
							</div>
							{results.map(({ section: s, groups }) => (
								<div key={s.id} className={styles.resultSection}>
									<button type='button' className={styles.resultHead} onClick={() => setTab(s.id)}>
										<s.icon /> {s.title} <span>Mở tab →</span>
									</button>
									{groups.map(({ group, fields }, i) => renderGroup(group, `${s.id}-${i}`, fields))}
								</div>
							))}
						</>
					) : (
						<>
							<div className={styles.sectionHead}>
								<span className={styles.sectionIcon}>
									<SectionIcon />
								</span>
								<div>
									<h2 className={styles.sectionTitle}>{section.title}</h2>
									<p className={styles.sectionSub}>{section.sub}</p>
								</div>
							</div>
							{section.note && (
								<div className={styles.infoNote}>
									<InfoSvg /> {section.note}
								</div>
							)}
							{loading ? <div className={styles.loading}>Đang tải cấu hình…</div> : section.groups.map((g, i) => renderGroup(g, i))}
						</>
					)}

					<div className={cx(styles.saveBar, hasDirty && styles.saveBarDirty)}>
						<div className={styles.saveText}>
							{hasDirty ? (
								<>
									<b>{dirty.length} thay đổi chưa lưu</b>
									<span className={styles.saveList}>
										{dirty
											.slice(0, 3)
											.map((f) => f.label)
											.join(', ')}
										{dirty.length > 3 && ` và ${dirty.length - 3} mục khác`}
									</span>
								</>
							) : (
								<span>Mọi thay đổi đã được lưu</span>
							)}
						</div>
						{invalid.length > 0 && <span className={styles.error}>{invalid.length} giá trị chưa hợp lệ</span>}
						{hasDirty && (
							<Button variant='ghost' onClick={() => setForm(saved)}>
								Hoàn tác tất cả
							</Button>
						)}
						<Button loading={saving} disabled={!hasDirty} onClick={save} title='Ctrl + S'>
							Lưu thay đổi
						</Button>
					</div>
				</div>
			</div>
		</AdminLayout>
	);
}
