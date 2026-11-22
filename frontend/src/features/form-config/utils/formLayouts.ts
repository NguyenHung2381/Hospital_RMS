// Bố cục thật của từng form (theo JSX hiện tại) + trang mở form — chỉ để trang
// Cấu hình form vẽ khung "Xem trước" đúng vị trí và có nút "Mở form thật".
// Sửa bố cục form ở JSX thì sửa cả ở đây (trường chưa khai báo vẫn hiện ở nhóm
// "Trường khác" cuối khung xem trước nên không bị mất).
//
// Mỗi hàng là danh sách ô cùng hàng (1–3 cột):
//   'key'      trường có sẵn trong registry
//   '@custom'  nhóm trường tùy chỉnh (mục "Thông tin bổ sung")
//   '~Nhãn'    ô cố định của form, không cấu hình được (vẽ mờ để biết vị trí)

export interface LayoutSection {
	title?: string;
	/** Ghi chú điều kiện hiện nhóm, vd "khi là khách ngoài viện" */
	note?: string;
	rows: string[][];
}

export interface FormPage {
	path: string;
	/** Cách mở form trên trang đó */
	how?: string;
}

export interface FormLayout {
	page: FormPage;
	sections: LayoutSection[];
}

export const CUSTOM_SLOT = '@custom';
export const isFixed = (item: string) => item.startsWith('~');

const custom: LayoutSection = { title: 'Thông tin bổ sung', rows: [[CUSTOM_SLOT]] };

export const FORM_LAYOUTS: Record<string, Record<string, FormLayout>> = {
	topic: {
		admin: {
			page: { path: '/admin/topics', how: 'Bấm "Thêm đề tài" hoặc sửa một đề tài' },
			sections: [
				{ title: 'Thông tin chung', rows: [['article_type'], ['title'], ['description']] },
				{ title: 'Phân loại & đơn vị', rows: [['round_id', 'category_id'], ['department_id']] },
				{ title: 'Thông tin xuất bản', note: 'khi là bài báo', rows: [['journal_name'], ['doi', 'publish_date']] },
				{
					title: 'Kinh phí & quyết định',
					rows: [
						['budget_estimated', 'budget_actual'],
						['approval_decision_no', 'approval_decision_date'],
						['recognition_decision_no', 'recognition_decision_date'],
					],
				},
				{ title: 'Kết quả nghiệm thu', rows: [['acceptance_rating', 'acceptance_score', 'acceptance_date']] },
				custom,
				{ title: 'Trạng thái đề tài', rows: [['~Trạng thái', '~Đưa vào Thư viện đề tài']] },
			],
		},
		portal: {
			page: { path: '/user/register-topic', how: 'Chọn loại hồ sơ rồi điền form' },
			sections: [
				{ title: 'Loại hồ sơ', rows: [['article_type']] },
				{ title: 'Thông tin cơ bản', rows: [['title'], ['description']] },
				{
					title: 'Phân loại & Đợt nghiên cứu',
					rows: [['round_id'], ['~Cấp độ (theo đợt)', 'department_id'], ['category_id'], ['doi', 'publish_date']],
				},
				custom,
				{
					title: 'Kết quả nghiệm thu',
					note: 'chỉ ở trang Nhập đề tài đã hoàn thành',
					rows: [['acceptance_rating'], ['acceptance_score', 'acceptance_date']],
				},
				{
					title: 'Kinh phí & quyết định',
					note: 'chỉ ở trang Nhập đề tài đã hoàn thành',
					rows: [
						['budget_estimated', 'budget_actual'],
						['approval_decision_no', 'approval_decision_date'],
						['recognition_decision_no', 'recognition_decision_date'],
					],
				},
				{ title: 'Thành viên tham gia', rows: [['~Danh sách thành viên']] },
			],
		},
		public: {
			page: { path: '/dang-ky-de-tai' },
			sections: [
				{ title: '1. Chọn đợt đăng ký', rows: [['round_id']] },
				{
					title: '2. Thông tin đề tài',
					rows: [['title'], ['description'], ['category_id', 'department_id'], [CUSTOM_SLOT]],
				},
				{
					title: '3. Chủ nhiệm đề tài',
					rows: [
						['full_name', 'staff_number'],
						['position', '~Vai trò trong đề tài'],
						['~Khoa/phòng công tác'],
						['phone', 'email'],
					],
				},
				{ title: '4. Thư ký & thành viên', rows: [['~Danh sách thư ký, thành viên']] },
				{ title: '5. Tài liệu đính kèm', rows: [['~Tệp đính kèm']] },
			],
		},
	},
	topic_member: {
		portal: {
			page: { path: '/user/my-topics', how: 'Mở một đề tài → tab Thành viên → Thêm thành viên' },
			sections: [
				{
					rows: [
						['~Tìm nhân viên có sẵn'],
						['ho_ten', 'role'],
						['email', 'so_dien_thoai'],
						['chuc_vu', 'staff_number'],
						[CUSTOM_SLOT],
					],
				},
			],
		},
	},
	seminar_participant: {
		public: {
			page: { path: '/admin/seminars', how: 'Mở một hội nghị → mở đường dẫn / mã QR đăng ký' },
			sections: [
				{ title: '1. Đối tượng tham dự', rows: [['source']] },
				{ title: '2. Thông tin nhân viên', note: 'khi là nhân viên bệnh viện', rows: [['full_name', 'staff_number']] },
				{
					title: '2. Thông tin người tham dự',
					note: 'khi là khách ngoài viện',
					rows: [
						['title_prefix', 'full_name'],
						['dob', 'gender'],
						['phone', 'email'],
					],
				},
				{
					title: 'Công tác',
					note: 'khi là khách ngoài viện',
					rows: [['organization', 'department_raw'], ['qualification_raw']],
				},
				{ title: '3. Thông tin bổ sung', rows: [[CUSTOM_SLOT]] },
			],
		},
	},
	course_registration: {
		public: {
			page: { path: '/dang-ky-khoa-hoc' },
			sections: [
				{ title: 'Bước 1 — Đối tượng', rows: [['source'], ['staff_number', 'department_id']] },
				{
					title: 'Bước 2 — Thông tin cá nhân',
					rows: [['full_name'], ['dob', 'gender'], ['ethnicity', 'hometown'], ['trainee_type_id']],
				},
				{
					title: 'Căn cước công dân',
					rows: [['national_id'], ['national_id_issued_date', 'national_id_issued_place']],
				},
				{ title: 'Liên hệ', rows: [['phone', 'email'], ['permanent_address'], ['address']] },
				{
					title: 'Học vấn và văn bằng',
					rows: [
						['qualification'],
						['graduated_school'],
						['graduated_year', 'graduated_major'],
						['degree_number', 'degree_registry_number'],
					],
				},
				{ title: 'Công tác', rows: [['workplace'], ['work_specialty', 'work_seniority']] },
				{ title: 'Thông tin bổ sung', rows: [[CUSTOM_SLOT]] },
				{
					title: 'Thông tin xuất hóa đơn',
					note: 'khi mở mục hóa đơn',
					rows: [
						['invoice_org_name'],
						['invoice_org_address'],
						['invoice_tax_code', 'invoice_budget_code'],
						['invoice_email'],
					],
				},
				{ title: 'Nội quy & cam kết', rows: [['rules_accepted'], ['declared_true']] },
			],
		},
	},
	cme_record: {
		portal: {
			page: { path: '/user/cme', how: 'Bấm "Khai CME" hoặc gửi lại một bản khai' },
			sections: [
				{
					rows: [
						['category_id'],
						['title'],
						['role', 'quantity'],
						['credits', 'activity_date'],
						['end_date', 'year'],
						['note'],
						[CUSTOM_SLOT],
					],
				},
			],
		},
	},
	leave_request: {
		portal: {
			page: { path: '/user/cham-cong', how: 'Bấm "Xin phép"' },
			sections: [{ rows: [['type'], ['from_date', 'to_date'], ['~Ca làm việc'], ['reason'], [CUSTOM_SLOT]] }],
		},
	},
	user_profile: {
		profile: {
			page: { path: '/user/profile', how: 'Họ tên ở đầu trang, trường tùy chỉnh ở thẻ "Thông tin bổ sung"' },
			sections: [{ rows: [['full_name']] }, custom],
		},
	},
	trainee: {
		admin: {
			page: { path: '/admin/trainees', how: 'Bấm "Thêm học viên" hoặc sửa một học viên' },
			sections: [
				{
					rows: [
						['full_name'],
						['dob', 'gender'],
						['qualification', 'national_id'],
						['national_id_issued_date', 'national_id_issued_place'],
						['phone', 'email'],
						['trainee_type_id', 'department_id'],
						['workplace', 'position'],
						['graduated_school', 'graduated_year'],
						['graduated_date', 'degree_issued_date'],
						['birth_province', 'legacy_code'],
						['address', 'permanent_address'],
						['notes'],
						[CUSTOM_SLOT],
					],
				},
			],
		},
	},
	training_program: {
		admin: {
			page: { path: '/admin/training-programs', how: 'Bấm "Thêm chương trình" hoặc sửa một chương trình' },
			sections: [
				{
					rows: [
						['code', 'training_type_id'],
						['name'],
						['duration_value', 'credit_hours'],
						['theory_hours', 'practice_hours'],
						['exam_parts'],
						['target_audience'],
						['professional_field_id', 'practice_form_id'],
						['department_id', 'department_note'],
						['tuition_fee', 'min_capacity'],
						['max_capacity'],
						['description'],
						[CUSTOM_SLOT],
					],
				},
			],
		},
	},
	course: {
		admin: {
			page: { path: '/admin/courses', how: 'Bấm "Thêm khóa học" hoặc sửa một khóa' },
			sections: [
				{ title: '1. Thông tin chung', rows: [['training_type_id', 'batch_no'], ['name'], [CUSTOM_SLOT]] },
				{ title: '2. Thời gian', rows: [['~Ngày bắt đầu', '~Ngày kết thúc']] },
				{ title: '3. Đăng ký', rows: [['training_form_id'], ['~Hạn đăng ký, sĩ số']] },
				{ title: '4. Giới thiệu khóa học', rows: [['description']] },
			],
		},
	},
	enrollment: {
		course: {
			page: { path: '/admin/courses', how: 'Mở một khóa → tab Ghi danh → bấm vào một học viên' },
			sections: [{ rows: [['program_id'], ['progress_status'], ['progress_reason'], ['note']] }, custom],
		},
		practice: {
			page: { path: '/admin/practice-records', how: 'Bấm "Thêm hồ sơ" hoặc mở một hồ sơ thực hành' },
			sections: [
				{ title: 'Chương trình & tiến độ', rows: [['program_id'], ['progress_status'], ['progress_reason']] },
				{
					title: 'Thời gian & địa điểm thực hành',
					rows: [
						['start_date', 'end_date'],
						['total_duration', 'practice_location'],
					],
				},
				{
					title: 'Thông tin in trên giấy tờ',
					rows: [['practice_code', 'sending_unit'], ['professional_field', 'practice_form'], ['note']],
				},
				custom,
			],
		},
	},
	lesson: {
		admin: {
			page: { path: '/admin/lessons', how: 'Bấm "Thêm bài học" hoặc sửa một bài' },
			sections: [
				{
					rows: [
						['code', 'lesson_kind'],
						['title'],
						['theory_hours', 'practice_hours', 'credits'],
						['duration_value'],
						['description'],
						[CUSTOM_SLOT],
					],
				},
			],
		},
	},
	course_session: {
		admin: {
			page: { path: '/admin/courses', how: 'Mở một khóa → tab Lịch học → Thêm buổi' },
			sections: [
				{
					rows: [
						['session_date'],
						['start_time', 'end_time'],
						['subject_id'],
						['lecturer_id'],
						['session_kind', 'room'],
						[CUSTOM_SLOT],
					],
				},
			],
		},
	},
	lecturer: {
		admin: {
			page: { path: '/admin/lecturers', how: 'Bấm "Thêm giảng viên" hoặc sửa một giảng viên' },
			sections: [{ rows: [['full_name'], ['specialty', 'phone'], ['email'], [CUSTOM_SLOT]] }],
		},
	},
};

export const layoutOf = (formKey: string, variant: string): FormLayout | undefined => FORM_LAYOUTS[formKey]?.[variant];
