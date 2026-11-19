// Hằng số dùng chung của form đăng ký khóa đào tạo liên tục (nội viện / ngoại viện):
// nội quy lớp học, danh sách trường của bản khai (snapshot), nơi cấp CCCD.

// Đổi nội dung nội quy thì đổi luôn phiên bản — course_registrations.rules_version ghi
// người đăng ký đã cam kết theo bản nào.
const RULES_VERSION = '2026-01';

const CLASS_RULES = [
	'Chấp hành nghiêm chỉnh nội quy, quy chế của bệnh viện và lớp học, tuân thủ các quy định về y đức, kiểm soát nhiễm khuẩn.',
	'Không tham gia khóa đào tạo nào khác trong thời gian học tập tại Bệnh viện. Nếu học 2 khóa đào tạo cùng lúc sẽ bị ngừng học khóa đã đăng ký tại Bệnh viện và không được hoàn trả học phí.',
	'Quy định về thời gian: Đi học đúng giờ, đúng chương trình đã đăng ký, không vắng quá 20% số tiết lý thuyết theo quy định và không vắng buổi thực hành nào. Trường hợp vắng, nghỉ học, học viên phải báo cáo với khoa/phòng/trung tâm phụ trách giảng dạy và có đơn xin nghỉ học gửi về TT ĐT-CĐT ít nhất trước 01 ngày làm việc. Học viên vắng quá 03 buổi không có lý do sẽ bị thôi học.',
	'Học viên được bảo lưu kết quả học tập nếu có lý do chính đáng và được sự đồng ý của khoa/phòng/trung tâm phụ trách giảng dạy, TT ĐT-CĐT. Thời hạn bảo lưu trong vòng 06 tháng.',
	'Trang phục: Áo blouse trắng, quần dài trắng, đeo thẻ học viên, không mang dép lê.',
	'Học phí: Hoàn thành học phí đầy đủ vào ngày khai giảng lớp học.',
	'Tham gia đầy đủ các buổi thi lý thuyết và thực hành. Trường hợp vắng thi không có lý do chính đáng sẽ bị đình chỉ học tập và không đủ điều kiện cấp chứng chỉ.',
	'Trường hợp học viên không đi học đầy đủ, bị đình chỉ học và không đủ điều kiện dự thi và cấp chứng chỉ; không được hoàn trả học phí.',
	'Đối với học viên là cán bộ, nhân viên của Bệnh viện HNĐK Nghệ An, khi đăng ký đào tạo phải có tờ trình của khoa/phòng/trung tâm đang công tác và xác nhận của Ban giám đốc Bệnh viện.',
];

const SOURCES = ['internal', 'external'];

// Gợi ý nơi cấp CCCD (người đăng ký vẫn nhập được nơi khác)
const ID_ISSUE_PLACES = ['Bộ Công an', 'Cục Cảnh sát quản lý hành chính về trật tự xã hội'];

// Trường của bản khai lưu ở course_registrations.snapshot — cũng là khóa của form
// 'course_registration' (Cấu hình form) và là dữ liệu in ra Đơn đăng ký.
const SNAPSHOT_FIELDS = [
	'full_name',
	'dob',
	'gender',
	'ethnicity',
	'hometown',
	'national_id',
	'national_id_issued_date',
	'national_id_issued_place',
	'permanent_address',
	'address',
	'phone',
	'email',
	'qualification',
	'graduated_school',
	'graduated_year',
	'graduated_major',
	'degree_number',
	'degree_registry_number',
	'workplace',
	'work_specialty',
	'work_seniority',
	'trainee_type_id',
	// Chỉ nội viện
	'staff_number',
	'department_id',
];

// Trường của snapshot ghi tiếp vào hồ sơ học viên (traineeService.create). Các trường
// còn lại (hometown, graduated_major, work_specialty, work_seniority) chỉ nằm trong snapshot.
const TRAINEE_FIELDS = [
	'full_name',
	'dob',
	'gender',
	'ethnicity',
	'national_id',
	'national_id_issued_date',
	'national_id_issued_place',
	'permanent_address',
	'address',
	'phone',
	'email',
	'qualification',
	'graduated_school',
	'graduated_year',
	'degree_number',
	'degree_registry_number',
	'workplace',
	'trainee_type_id',
	'department_id',
];

const INVOICE_FIELDS = [
	'invoice_org_name',
	'invoice_org_address',
	'invoice_tax_code',
	'invoice_budget_code',
	'invoice_email',
];

const CHECK_KEYS = ['id_checked', 'degree_checked', 'proposal_checked'];

module.exports = {
	RULES_VERSION,
	CLASS_RULES,
	SOURCES,
	ID_ISSUE_PLACES,
	SNAPSHOT_FIELDS,
	TRAINEE_FIELDS,
	INVOICE_FIELDS,
	CHECK_KEYS,
};
