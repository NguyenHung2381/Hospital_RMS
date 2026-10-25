// Danh mục quyền — các module nghiệp vụ: Nghiên cứu khoa học, Hội thảo & CME, Đào tạo.
// Quy ước + cách thêm quyền: xem đầu permissions/catalog.js.
const { p } = require('./catalogDef');

const BUSINESS_MODULES = [
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
				label: 'Hội đồng chấm & chuyên gia ngoài viện',
				permissions: [
					p('PERM-CNL-READ', 'read', 'Xem hội đồng', 'Xem hội đồng chấm và chuyên gia ngoài viện'),
					p(
						'PERM-CNL-CREATE',
						'create',
						'Tạo hội đồng',
						'Tạo hội đồng chấm, thêm chuyên gia ngoài viện',
					),
					p(
						'PERM-CNL-UPDATE',
						'update',
						'Cập nhật hội đồng',
						'Sửa thành viên / thông tin hội đồng',
					),
					p('PERM-CNL-DELETE', 'delete', 'Xóa hội đồng', 'Xóa hội đồng chấm khỏi hệ thống'),
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
						'Xóa mục danh mục',
						'Xóa phân loại / cấp độ / loại đợt nghiên cứu',
					),
				],
			},
		],
	},
	{
		key: 'events',
		label: 'Hội thảo, hội nghị & CME',
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
						'Thêm / sửa / xóa / nhập Excel ghi nhận CME ngoài hội thảo của viện, kèm minh chứng',
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
					p('PERM-CRS-DELETE', 'delete', 'Xóa khóa học', 'Xóa khóa học, buổi học, phân công'),
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
				key: 'grades',
				label: 'Bảng điểm',
				permissions: [
					p(
						'PERM-GRD-UNLOCK',
						'unlock',
						'Mở khóa bảng điểm',
						'Mở khóa bảng điểm đã khóa để sửa điểm (ghi nhật ký)',
						{ seedFrom: ['courses:approve'] },
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
					p('PERM-TRN-DELETE', 'delete', 'Xóa học viên', 'Xóa hồ sơ học viên'),
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
					p('PERM-TRPROG-DELETE', 'delete', 'Xóa chương trình đào tạo', 'Xóa chương trình đào tạo'),
				],
			},
			{
				key: 'lecturers',
				label: 'Giảng viên',
				permissions: [
					p('PERM-LEC-READ', 'read', 'Xem giảng viên', 'Xem danh sách giảng viên'),
					p('PERM-LEC-CREATE', 'create', 'Thêm giảng viên', 'Tạo giảng viên mới'),
					p('PERM-LEC-UPDATE', 'update', 'Sửa giảng viên', 'Cập nhật thông tin giảng viên'),
					p('PERM-LEC-DELETE', 'delete', 'Xóa giảng viên', 'Xóa giảng viên'),
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
					p('PERM-TRNCAT-DELETE', 'delete', 'Xóa danh mục đào tạo', 'Xóa mục danh mục đào tạo'),
				],
			},
			{
				key: 'staff_licenses',
				label: 'Chứng chỉ hành nghề (CCHN)',
				permissions: [
					p('PERM-LIC-READ', 'read', 'Xem CCHN', 'Xem hồ sơ chứng chỉ hành nghề nhân sự'),
					p('PERM-LIC-CREATE', 'create', 'Thêm CCHN', 'Tạo hồ sơ chứng chỉ hành nghề mới'),
					p('PERM-LIC-UPDATE', 'update', 'Sửa CCHN', 'Cập nhật hồ sơ chứng chỉ hành nghề'),
					p('PERM-LIC-DELETE', 'delete', 'Xóa CCHN', 'Xóa hồ sơ chứng chỉ hành nghề'),
				],
			},
		],
	},
];

module.exports = { BUSINESS_MODULES };
