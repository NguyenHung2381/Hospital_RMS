// Danh mục quyền — module Quản trị hệ thống.
// Quy ước + cách thêm quyền: xem đầu permissions/catalog.js.
const { p } = require('./catalogDef');

const ADMIN_MODULE = {
	key: 'admin',
	label: 'Quản trị hệ thống',
	resources: [
		{
			key: 'admin_panel',
			label: 'Khu vực quản trị',
			permissions: [
				p('PERM-PANEL-ACCESS', 'access', 'Truy cập trang quản trị', 'Được vào khu vực /admin'),
			],
		},
		{
			key: 'users',
			label: 'Người dùng',
			permissions: [
				p('PERM-USR-READ', 'read', 'Xem người dùng', 'Xem danh sách tài khoản người dùng'),
				p(
					'PERM-USR-CREATE',
					'create',
					'Thêm người dùng',
					'Tạo tài khoản mới cho cán bộ, nhân viên',
					{ critical: true },
				),
				p(
					'PERM-USR-UPDATE',
					'update',
					'Chỉnh sửa người dùng',
					'Cập nhật thông tin và mật khẩu người dùng',
					{ critical: true },
				),
				p('PERM-USR-DELETE', 'delete', 'Xóa người dùng', 'Xóa tài khoản người dùng'),
			],
		},
		{
			key: 'roles',
			label: 'Vai trò & phân quyền',
			permissions: [
				p('PERM-ROLE-READ', 'read', 'Xem vai trò', 'Xem danh sách vai trò và phân quyền'),
				p('PERM-ROLE-CREATE', 'create', 'Thêm vai trò', 'Tạo vai trò mới'),
				p('PERM-ROLE-UPDATE', 'update', 'Sửa vai trò', 'Cập nhật thông tin vai trò', {
					critical: true,
				}),
				p('PERM-ROLE-DELETE', 'delete', 'Xóa vai trò', 'Xóa vai trò khỏi hệ thống'),
				p(
					'PERM-ROLE-MANAGE',
					'manage',
					'Phân quyền vai trò',
					'Thay đổi tập quyền và phạm vi dữ liệu của vai trò',
					{ critical: true },
				),
			],
		},
		{
			key: 'departments',
			label: 'Khoa / phòng ban',
			permissions: [
				p('PERM-DEPT-READ', 'read', 'Xem khoa/phòng', 'Xem danh sách khoa/phòng, đơn vị'),
				p('PERM-DEPT-CREATE', 'create', 'Thêm khoa/phòng', 'Tạo khoa/phòng mới'),
				p('PERM-DEPT-UPDATE', 'update', 'Sửa khoa/phòng', 'Cập nhật thông tin khoa/phòng'),
				p('PERM-DEPT-DELETE', 'delete', 'Xóa khoa/phòng', 'Xóa khoa/phòng khỏi hệ thống'),
			],
		},
		{
			key: 'venues',
			label: 'Địa điểm, phòng họp',
			permissions: [
				p(
					'PERM-VEN-READ',
					'read',
					'Xem địa điểm',
					'Xem danh mục địa điểm (phòng họp, hội trường, phòng học)',
				),
				p('PERM-VEN-CREATE', 'create', 'Thêm địa điểm', 'Tạo địa điểm mới'),
				p('PERM-VEN-UPDATE', 'update', 'Sửa địa điểm', 'Cập nhật thông tin địa điểm'),
				p('PERM-VEN-DELETE', 'delete', 'Xóa địa điểm', 'Xóa địa điểm khỏi danh mục'),
			],
		},
		{
			key: 'notifications',
			label: 'Thông báo hệ thống',
			permissions: [
				p(
					'PERM-NOTIF-READ',
					'read',
					'Xem thông báo đã gửi',
					'Xem danh sách thông báo hệ thống đã gửi và người nhận',
				),
				p(
					'PERM-NOTIF-CREATE',
					'create',
					'Gửi thông báo',
					'Soạn và gửi thông báo tới người dùng / toàn hệ thống',
				),
				p('PERM-NOTIF-DELETE', 'delete', 'Xóa thông báo', 'Thu hồi / xóa thông báo đã gửi'),
			],
		},
		{
			key: 'persons',
			label: 'Trùng danh tính',
			permissions: [
				p(
					'PERM-PERSON-READ',
					'read',
					'Xem hàng đợi trùng danh tính',
					'Xem các cặp hồ sơ nghi là cùng một người',
				),
				p(
					'PERM-PERSON-MERGE',
					'merge',
					'Gộp danh tính',
					'Gộp hai hồ sơ người, bỏ qua hoặc mở lại cặp nghi trùng',
				),
			],
		},
		{
			key: 'surveys',
			label: 'Khảo sát',
			permissions: [
				p(
					'PERM-SURVEY-MANAGE',
					'manage',
					'Quản lý khảo sát',
					'Tạo/sửa/xóa khảo sát và xem kết quả tổng hợp',
				),
			],
		},
		{
			key: 'workflows',
			label: 'Quy trình duyệt',
			permissions: [
				p(
					'PERM-WORKFLOW-MANAGE',
					'manage',
					'Quản lý quy trình duyệt',
					'Cấu hình quy trình duyệt nhiều bước cho các đối tượng (đề tài...)',
				),
			],
		},
		{
			key: 'reports',
			label: 'Báo cáo & thống kê',
			permissions: [
				p('PERM-RPT-READ', 'read', 'Xem báo cáo', 'Xem báo cáo thống kê toàn hệ thống'),
				p('PERM-RPT-CREATE', 'create', 'Tạo báo cáo', 'Xuất và tạo báo cáo mới'),
				p('PERM-RPT-UPDATE', 'update', 'Sửa báo cáo', 'Chỉnh sửa nội dung báo cáo'),
				p('PERM-RPT-DELETE', 'delete', 'Xóa báo cáo', 'Xóa báo cáo khỏi hệ thống'),
			],
		},
		{
			key: 'staff_attendance',
			label: 'Điểm danh học viên',
			permissions: [
				p(
					'PERM-STATT-READ',
					'read',
					'Xem bảng điểm danh',
					'Xem giờ vào/ra điểm danh của học viên theo khóa đào tạo, trong khoa hoặc toàn viện (theo phạm vi)',
				),
				p(
					'PERM-STATT-MANAGE',
					'manage',
					'Cấu hình ca học viên',
					'Tạo ca, mẫu ca theo tuần và gán mẫu ca cho khóa đào tạo (luôn toàn viện, không theo phạm vi)',
				),
				p(
					'PERM-STATT-ROSTER',
					'roster',
					'Phân ca',
					'Xếp ca theo ngày cho học viên trong khoa hoặc toàn viện (theo phạm vi), ghi đè mẫu ca tuần của khóa',
				),
				p(
					'PERM-STATT-APPROVE',
					'approve',
					'Duyệt đơn xin phép',
					'Duyệt / từ chối đơn xin nghỉ, xin đi muộn của học viên trong khoa hoặc toàn viện (theo phạm vi)',
					// Người đang phân ca (khoa trưởng, điều dưỡng trưởng…) duyệt luôn đơn của học viên khoa mình
					{ seedFrom: ['staff_attendance:roster'] },
				),
			],
		},
		{
			key: 'activity_logs',
			label: 'Nhật ký hoạt động',
			permissions: [
				p(
					'PERM-ACTLOG-READ',
					'read',
					'Xem nhật ký hoạt động',
					'Truy cập nhật ký hoạt động hệ thống',
				),
			],
		},
		{
			key: 'security_events',
			label: 'Nhật ký bảo mật',
			permissions: [
				p(
					'PERM-SECEVT-READ',
					'read',
					'Xem nhật ký bảo mật',
					'Xem lịch sử khóa tài khoản, xoay phiên đăng nhập, truy cập dữ liệu nhạy cảm',
				),
			],
		},
		{
			key: 'system_settings',
			label: 'Cấu hình hệ thống',
			permissions: [
				p(
					'PERM-SETTINGS-MANAGE',
					'manage',
					'Quản lý cấu hình hệ thống',
					'Xem và sửa cấu hình hệ thống (SMTP, ngưỡng CME, địa chỉ trang công khai)',
					{ critical: true },
				),
			],
		},
	],
};

module.exports = { ADMIN_MODULE };
