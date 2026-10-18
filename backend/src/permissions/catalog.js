// ─── Danh mục quyền — NGUỒN CHÂN LÝ DUY NHẤT ─────────────────────────────────
// Mọi quyền "resource:action" của hệ thống khai báo ở đây. Khi server khởi
// động, permissions/sync.js đồng bộ danh mục này vào bảng `permissions` (thêm
// quyền mới, cập nhật tên/mô tả/nhóm; KHÔNG xoá quyền lạ — chỉ cảnh báo), API
// GET /permissions/catalog trả nó cho màn hình phân quyền, và
// scripts/gen-permission-types.js sinh kiểu PermissionKey cho frontend.
//
// Thêm quyền mới:
//   1. Thêm p(...) vào đúng resource bên dưới (id cố định, không đổi về sau).
//   2. Quyền tách ra từ một quyền cũ → khai báo `seedFrom`: lần đầu tạo, mọi
//      vai trò đang có quyền cũ được cấp luôn quyền mới (không ai mất quyền).
//   3. `npm run gen:perm-types` rồi dùng key mới ở route/frontend.
//
// Quy ước (xem middlewares/auth.js):
//   - Superuser (bỏ qua mọi kiểm tra) là cờ roles.is_superuser, KHÔNG phải quyền
//     trong danh mục này — không cấp được qua ma trận phân quyền. Trong code nó
//     hiện dưới dạng key 'system:manage' (permissions/permissionCache.js).
//   - Có đúng quyền được cấp mới được làm — "manage" KHÔNG còn là wildcard bao
//     các action khác; nó chỉ là tên của một quyền cụ thể (vd roles:manage =
//     phân quyền, surveys:manage = quản lý khảo sát).
//   - Phạm vi dữ liệu (của mình / trong khoa / toàn viện...) là thuộc tính của
//     lượt cấp quyền, không phải action — xem permissions/scopes.js.
//   - critical: quyền cho phép quản lý tài khoản / phân quyền — giao diện cảnh báo khi cấp.

/**
 * @param {string} id
 * @param {string} action
 * @param {string} name
 * @param {string} description
 * @param {{ critical?: boolean, seedFrom?: string[], scoped?: boolean, [k: string]: any }} [opts]
 */
const p = (id, action, name, description, opts = {}) => ({
	id,
	action,
	name,
	description,
	...opts,
});

const ACTION_LABELS = {
	read: 'Xem',
	read_sensitive: 'Xem dữ liệu nhạy cảm',
	create: 'Tạo',
	update: 'Sửa',
	delete: 'Xoá',
	approve: 'Duyệt',
	import: 'Nhập Excel',
	export: 'Xuất Excel',
	merge: 'Gộp',
	cme_manage: 'Cấp CME',
	access: 'Truy cập',
	manage: 'Quản lý',
	roster: 'Phân ca',
};

const MODULES = [
	{
		key: 'research',
		label: 'Nghiên cứu khoa học',
		resources: [
			{
				key: 'topics',
				label: 'Đề tài nghiên cứu',
				permissions: [
					p('PERM-TOP-READ', 'read', 'Xem đề tài', 'Xem danh sách và chi tiết đề tài nghiên cứu'),
					p('PERM-TOP-CREATE', 'create', 'Tạo đề tài', 'Đăng ký đề tài nghiên cứu mới'),
					p('PERM-TOP-UPDATE', 'update', 'Chỉnh sửa đề tài', 'Cập nhật thông tin đề tài'),
					p('PERM-TOP-DELETE', 'delete', 'Xóa đề tài', 'Xóa đề tài khỏi hệ thống'),
					p(
						'PERM-TOP-APPROVE',
						'approve',
						'Phê duyệt đề tài',
						'Phê duyệt hoặc từ chối đề tài nghiên cứu',
					),
				],
			},
			{
				key: 'rounds',
				label: 'Đợt nghiên cứu',
				permissions: [
					p('PERM-RND-READ', 'read', 'Xem đợt nghiên cứu', 'Xem thông tin đợt nghiên cứu'),
					p('PERM-RND-CREATE', 'create', 'Thêm đợt nghiên cứu', 'Tạo đợt nghiên cứu mới'),
					p('PERM-RND-UPDATE', 'update', 'Sửa đợt nghiên cứu', 'Cập nhật thông tin đợt nghiên cứu'),
					p('PERM-RND-DELETE', 'delete', 'Xóa đợt nghiên cứu', 'Xóa đợt nghiên cứu khỏi hệ thống'),
				],
			},
			{
				key: 'councils',
				label: 'Hội đồng chấm & người ngoài viện',
				permissions: [
					p('PERM-CNL-READ', 'read', 'Xem hội đồng', 'Xem hội đồng chấm và người ngoài viện'),
					p(
						'PERM-CNL-CREATE',
						'create',
						'Tạo hội đồng',
						'Tạo hội đồng chấm, thêm người ngoài viện',
					),
					p(
						'PERM-CNL-UPDATE',
						'update',
						'Cập nhật hội đồng',
						'Sửa thành viên / thông tin hội đồng',
					),
					p('PERM-CNL-DELETE', 'delete', 'Xoá hội đồng', 'Xoá hội đồng chấm khỏi hệ thống'),
				],
			},
			{
				key: 'files',
				label: 'Tài liệu đề tài',
				permissions: [
					p('PERM-FILE-READ', 'read', 'Xem tài liệu', 'Tải xuống và xem tài liệu đề tài'),
					p('PERM-FILE-CREATE', 'create', 'Tải tài liệu', 'Tải lên tài liệu cho đề tài'),
					p('PERM-FILE-UPDATE', 'update', 'Sửa tài liệu', 'Chỉnh sửa thông tin tài liệu'),
					p('PERM-FILE-DELETE', 'delete', 'Xóa tài liệu', 'Xóa tài liệu khỏi hệ thống'),
				],
			},
			{
				key: 'catalog',
				label: 'Danh mục NCKH (phân loại, cấp độ, loại đợt)',
				permissions: [
					p(
						'PERM-CAT-READ',
						'read',
						'Xem danh mục',
						'Mở màn hình quản lý phân loại, cấp độ, loại đợt nghiên cứu',
					),
					p(
						'PERM-CAT-CREATE',
						'create',
						'Thêm mục danh mục',
						'Tạo phân loại / cấp độ / loại đợt nghiên cứu',
					),
					p(
						'PERM-CAT-UPDATE',
						'update',
						'Sửa mục danh mục',
						'Cập nhật phân loại / cấp độ / loại đợt nghiên cứu',
					),
					p(
						'PERM-CAT-DELETE',
						'delete',
						'Xoá mục danh mục',
						'Xoá phân loại / cấp độ / loại đợt nghiên cứu',
					),
				],
			},
		],
	},
	{
		key: 'events',
		label: 'Hội thảo, Hội nghị & CME',
		resources: [
			{
				key: 'seminars',
				label: 'Hội thảo, hội nghị',
				permissions: [
					p(
						'PERM-SEM-READ',
						'read',
						'Xem hội thảo, hội nghị',
						'Xem danh sách & chi tiết hội thảo/hội nghị và người tham dự',
					),
					p('PERM-SEM-CREATE', 'create', 'Thêm hội thảo, hội nghị', 'Tạo mới hội thảo/hội nghị'),
					p(
						'PERM-SEM-UPDATE',
						'update',
						'Sửa hội thảo, hội nghị',
						'Cập nhật hội thảo/hội nghị và danh sách người tham dự',
					),
					p(
						'PERM-SEM-DELETE',
						'delete',
						'Xóa hội thảo, hội nghị',
						'Xóa hội thảo/hội nghị khỏi hệ thống',
					),
					p(
						'PERM-SEM-IMPORT',
						'import',
						'Nhập từ Excel',
						'Nhập danh sách người tham dự / CME từ file Excel',
					),
					p(
						'PERM-SEM-EXPORT',
						'export',
						'Xuất Excel',
						'Xuất danh sách, sổ CME, thống kê hội thảo/hội nghị',
					),
					p(
						'PERM-SEM-CME-MANAGE',
						'cme_manage',
						'Quản lý cấp CME',
						'Cấp / thu hồi số quyết định CME, chỉnh sổ cấp CME theo năm',
					),
				],
			},
			{
				key: 'cme_records',
				label: 'Ghi nhận CME độc lập',
				permissions: [
					p(
						'PERM-CMEREC-MANAGE',
						'manage',
						'Quản lý ghi nhận CME độc lập',
						'Thêm / sửa / xoá / nhập Excel ghi nhận CME ngoài hội thảo của viện, kèm minh chứng',
						{ seedFrom: ['seminars:cme_manage'] },
					),
				],
			},
		],
	},
	{
		key: 'training',
		label: 'Đào tạo',
		resources: [
			{
				key: 'courses',
				label: 'Khóa học (đăng ký, lịch học, điểm danh)',
				permissions: [
					p('PERM-CRS-READ', 'read', 'Xem khóa học', 'Xem khóa học, đăng ký, lịch học, điểm danh'),
					p(
						'PERM-CRS-CREATE',
						'create',
						'Thêm khóa học',
						'Tạo khóa học, phân công giảng viên, lịch học',
					),
					p('PERM-CRS-UPDATE', 'update', 'Sửa khóa học', 'Cập nhật khóa học, lịch học, điểm danh'),
					p('PERM-CRS-DELETE', 'delete', 'Xoá khóa học', 'Xoá khóa học, buổi học, phân công'),
					p(
						'PERM-CRS-APPROVE',
						'approve',
						'Duyệt đăng ký khóa học',
						'Duyệt / từ chối đăng ký khóa học của học viên',
					),
				],
			},
			{
				key: 'exams',
				label: 'Thi & kiểm tra',
				permissions: [
					p(
						'PERM-EXAM-MANAGE',
						'manage',
						'Quản lý thi & kiểm tra',
						'Ngân hàng câu hỏi, đề thi, xem và chấm bài làm của học viên',
						{ seedFrom: ['courses:update'] },
					),
				],
			},
			{
				key: 'trainees',
				label: 'Học viên',
				permissions: [
					p('PERM-TRN-READ', 'read', 'Xem học viên', 'Xem danh sách và chi tiết học viên'),
					p(
						'PERM-TRN-READSENS',
						'read_sensitive',
						'Xem dữ liệu nhạy cảm học viên',
						'Xem đầy đủ CCCD và tệp hồ sơ nhạy cảm (không bị che)',
					),
					p('PERM-TRN-CREATE', 'create', 'Thêm học viên', 'Tạo hồ sơ học viên mới'),
					p('PERM-TRN-UPDATE', 'update', 'Sửa học viên', 'Cập nhật hồ sơ học viên'),
					p('PERM-TRN-DELETE', 'delete', 'Xoá học viên', 'Xoá hồ sơ học viên'),
					p(
						'PERM-TRN-IMPORT',
						'import',
						'Nhập Excel học viên',
						'Nhập danh sách học viên hàng loạt từ file Excel',
					),
					p(
						'PERM-TRN-MANAGE',
						'manage',
						'Cấp tài khoản học viên',
						'Cấp tài khoản đăng nhập cho học viên (vai trò Học viên)',
						{ critical: true },
					),
				],
			},
			{
				key: 'training_programs',
				label: 'Chương trình đào tạo & bài học',
				permissions: [
					p(
						'PERM-TRPROG-READ',
						'read',
						'Xem chương trình đào tạo',
						'Xem chương trình đào tạo và môn học',
					),
					p(
						'PERM-TRPROG-CREATE',
						'create',
						'Thêm chương trình đào tạo',
						'Tạo chương trình đào tạo mới',
					),
					p(
						'PERM-TRPROG-UPDATE',
						'update',
						'Sửa chương trình đào tạo',
						'Cập nhật chương trình đào tạo',
					),
					p('PERM-TRPROG-DELETE', 'delete', 'Xoá chương trình đào tạo', 'Xoá chương trình đào tạo'),
				],
			},
			{
				key: 'lecturers',
				label: 'Giảng viên',
				permissions: [
					p('PERM-LEC-READ', 'read', 'Xem giảng viên', 'Xem danh sách giảng viên'),
					p('PERM-LEC-CREATE', 'create', 'Thêm giảng viên', 'Tạo giảng viên mới'),
					p('PERM-LEC-UPDATE', 'update', 'Sửa giảng viên', 'Cập nhật thông tin giảng viên'),
					p('PERM-LEC-DELETE', 'delete', 'Xoá giảng viên', 'Xoá giảng viên'),
				],
			},
			{
				key: 'training_catalog',
				label: 'Danh mục đào tạo',
				permissions: [
					p(
						'PERM-TRNCAT-READ',
						'read',
						'Xem danh mục đào tạo',
						'Xem đối tượng học viên, hình thức học, loại hình đào tạo, môn học, danh mục quy đổi CME',
					),
					p(
						'PERM-TRNCAT-CREATE',
						'create',
						'Thêm danh mục đào tạo',
						'Tạo mục danh mục đào tạo mới',
					),
					p(
						'PERM-TRNCAT-UPDATE',
						'update',
						'Sửa danh mục đào tạo',
						'Cập nhật mục danh mục đào tạo',
					),
					p('PERM-TRNCAT-DELETE', 'delete', 'Xoá danh mục đào tạo', 'Xoá mục danh mục đào tạo'),
				],
			},
			{
				key: 'staff_licenses',
				label: 'Chứng chỉ hành nghề (CCHN)',
				permissions: [
					p('PERM-LIC-READ', 'read', 'Xem CCHN', 'Xem hồ sơ chứng chỉ hành nghề nhân sự'),
					p('PERM-LIC-CREATE', 'create', 'Thêm CCHN', 'Tạo hồ sơ chứng chỉ hành nghề mới'),
					p('PERM-LIC-UPDATE', 'update', 'Sửa CCHN', 'Cập nhật hồ sơ chứng chỉ hành nghề'),
					p('PERM-LIC-DELETE', 'delete', 'Xoá CCHN', 'Xoá hồ sơ chứng chỉ hành nghề'),
				],
			},
		],
	},
	{
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
					p('PERM-DEPT-READ', 'read', 'Xem khoa phòng', 'Xem danh sách khoa phòng, đơn vị'),
					p('PERM-DEPT-CREATE', 'create', 'Thêm khoa phòng', 'Tạo khoa phòng mới'),
					p('PERM-DEPT-UPDATE', 'update', 'Sửa khoa phòng', 'Cập nhật thông tin khoa phòng'),
					p('PERM-DEPT-DELETE', 'delete', 'Xóa khoa phòng', 'Xóa khoa phòng khỏi hệ thống'),
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
					p('PERM-VEN-DELETE', 'delete', 'Xoá địa điểm', 'Xoá địa điểm khỏi danh mục'),
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
					p('PERM-NOTIF-DELETE', 'delete', 'Xoá thông báo', 'Thu hồi / xoá thông báo đã gửi'),
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
						'Tạo/sửa/xoá khảo sát và xem kết quả tổng hợp',
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
						'Quản lý workflow duyệt',
						'Cấu hình quy trình duyệt nhiều bước cho các resource (đề tài...)',
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
				label: 'Chấm công nhân viên',
				permissions: [
					p(
						'PERM-STATT-READ',
						'read',
						'Xem bảng chấm công',
						'Xem giờ vào/ra chấm công của nhân viên trong khoa hoặc toàn viện (theo phạm vi)',
					),
					p(
						'PERM-STATT-MANAGE',
						'manage',
						'Cấu hình ca làm việc',
						'Tạo ca làm, mẫu ca theo tuần và gán mẫu ca cho nhân viên (luôn toàn viện, không theo phạm vi)',
					),
					p(
						'PERM-STATT-ROSTER',
						'roster',
						'Phân ca',
						'Xếp ca làm việc theo ngày cho nhân viên trong khoa hoặc toàn viện (theo phạm vi), ghi đè mẫu ca tuần',
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
						'Xem lịch sử khoá tài khoản, xoay phiên đăng nhập, truy cập dữ liệu nhạy cảm',
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
						'Xem và sửa cấu hình hệ thống (SMTP, ngưỡng CME, URL public)',
						{ critical: true },
					),
				],
			},
		],
	},
];

// ─── Chỉ mục & kiểm tra nhất quán (chạy 1 lần lúc require) ───────────────────
const ALL = [];
const BY_KEY = new Map(); // "resource:action" → permission (kèm resource, module)
const BY_ID = new Map();
const NAMES = new Set(); // permissions.name có UNIQUE trong DB

for (const [moduleOrder, mod] of MODULES.entries()) {
	for (const [resourceOrder, res] of mod.resources.entries()) {
		for (const [actionOrder, perm] of res.permissions.entries()) {
			const key = `${res.key}:${perm.action}`;
			if (!ACTION_LABELS[perm.action]) throw new Error(`[permissions] action lạ: ${key}`);
			if (BY_KEY.has(key)) throw new Error(`[permissions] trùng key: ${key}`);
			if (BY_ID.has(perm.id)) throw new Error(`[permissions] trùng id: ${perm.id}`);
			if (NAMES.has(perm.name)) throw new Error(`[permissions] trùng tên: ${perm.name}`);
			NAMES.add(perm.name);
			const entry = {
				...perm,
				key,
				resource: res.key,
				module: mod.key,
				// Thứ tự hiển thị ổn định: module → resource → action
				sortOrder: moduleOrder * 10000 + resourceOrder * 100 + actionOrder,
			};
			ALL.push(entry);
			BY_KEY.set(key, entry);
			BY_ID.set(perm.id, entry);
		}
	}
}
for (const perm of ALL) {
	for (const src of perm.seedFrom ?? []) {
		if (!BY_KEY.has(src))
			throw new Error(`[permissions] ${perm.key}.seedFrom trỏ tới quyền không tồn tại: ${src}`);
	}
}

// Quyền "đi kèm" khi cấp một quyền — giao diện tự tick theo (vd có quyền Sửa
// mà không có Xem thì không mở được màn hình để sửa).
const impliesOf = (perm) => {
	if (perm.action === 'read') return [];
	const read = `${perm.resource}:read`;
	return BY_KEY.has(read) ? [read] : [];
};

const isKnownKey = (key) => BY_KEY.has(key);

module.exports = {
	ACTION_LABELS,
	MODULES,
	ALL_PERMISSIONS: ALL,
	BY_KEY,
	BY_ID,
	impliesOf,
	isKnownKey,
};
