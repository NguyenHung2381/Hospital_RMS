import type { CustomValues } from '@/shared/formConfig/types';
import { BASE_URL } from '../../../shared/api/axios';
import { seg } from '../../../shared/api/path';

// Client riêng cho cổng công khai — KHÔNG dùng shared/api/axios.apiClient vì
// nó tự gắn Authorization/refresh-token cho phiên đăng nhập, không phù hợp
// với các trang không cần đăng nhập này (mirror cách features/auth/api/authApi.ts
// gọi thẳng fetch tới /auth/login).
async function send(path: string, options: RequestInit = {}): Promise<Response> {
	// FormData: để trình duyệt tự đặt Content-Type multipart kèm boundary
	const isForm = options.body instanceof FormData;
	return fetch(`${BASE_URL}/api/v1/public${path}`, {
		...options,
		headers: {
			...(isForm ? {} : { 'Content-Type': 'application/json' }),
			...(options.headers ?? {}),
		},
	});
}

// Lỗi validator: máy chủ để câu cụ thể ở errors[].msg, còn `message` chỉ là câu chung
// "Dữ liệu đầu vào không hợp lệ". 'Invalid value' là câu mặc định của express-validator.
const errorMessage = (json: { message?: string; errors?: { msg?: unknown }[] } | null): string => {
	const first = json?.errors?.[0]?.msg;
	if (typeof first === 'string' && first && first !== 'Invalid value') return first;
	return json?.message ?? 'Có lỗi xảy ra, vui lòng thử lại';
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await send(path, options);
	const json = await res.json();
	if (!res.ok || !json.success) {
		throw new Error(errorMessage(json));
	}
	return json.data as T;
}

// Endpoint trả file (đơn đăng ký .docx): thành công là nội dung file, lỗi vẫn là JSON { message }
async function requestBlob(path: string, options: RequestInit = {}): Promise<Blob> {
	const res = await send(path, options);
	if (!res.ok) {
		const json = await res.json().catch(() => null);
		throw new Error(errorMessage(json));
	}
	return res.blob();
}

// Có file đính kèm ⇒ gửi multipart: field `data` = JSON form (giữ cấu trúc lồng
// nhau như members[]), `files` = các file (backend middlewares/uploadPublic.js).
const buildBody = (data: object, files?: File[]): BodyInit => {
	if (!files?.length) return JSON.stringify(data);
	const form = new FormData();
	form.append('data', JSON.stringify(data));
	files.forEach((f) => form.append('files', f));
	return form;
};

/** Số file đính kèm tối đa trên cổng công khai — khớp MAX_FILES ở backend (định dạng/dung lượng: useUploadPolicy) */
export const PUBLIC_UPLOAD_MAX_FILES = 10;

export interface PublicCourse {
	id: string;
	name: string;
	description: string | null;
	start_date: string | null;
	end_date: string | null;
	/** Hạn đăng ký (null = không giới hạn) */
	enrollment_end_date: string | null;
	program_name: string | null;
	/** Người đăng ký chọn 1 trong các chương trình này (khóa chỉ có 1 thì tự chọn) */
	programs: PublicProgram[];
}

export interface PublicProgram {
	id: string;
	code: string | null;
	name: string;
	description?: string | null;
	duration?: string | null;
	target_audience?: string | null;
	trainee_type_name?: string | null;
	theory_hours?: number | null;
	practice_hours?: number | null;
	tuition_fee?: number | null;
	lesson_count: number;
	/** Khóa ĐTLT / CTCV (class_rule = 1): sĩ số lớp — tối thiểu để mở, tối đa (null = không giới hạn),
	 *  đã duyệt, số người trong danh sách chờ của chương trình. */
	class_rule: number;
	class_min: number;
	class_max: number | null;
	class_approved: number;
	class_waiting: number;
	/** Nội dung theo thứ tự: bài lý thuyết hoặc vòng thực hành GPHN */
	lessons: PublicProgramLesson[];
}

export interface PublicProgramLesson {
	title: string;
	kind: 'theory' | 'rotation';
	theory_hours?: number | null;
	practice_hours?: number | null;
	/** Khoa thực hành của vòng ("Khoa A / Khoa B" = chọn 1 trong) */
	departments?: string | null;
	duration: string | null;
}

export interface TraineeTypeOption {
	id: string;
	name: string;
}

// Server chọn chế độ (backend utils/captcha.js): proof-of-work mặc định (trình
// duyệt tự giải ngầm), hoặc Cloudflare Turnstile / Google reCAPTCHA v2 khi đã
// cấu hình khóa.
export type Captcha =
	| { provider: 'pow'; token: string; bits: number; expires_in: number }
	| { provider: 'turnstile'; site_key: string; action: string }
	| { provider: 'recaptcha'; site_key: string };

export const getOpenCourses = () => request<PublicCourse[]>('/courses');
export const getTraineeTypes = () => request<TraineeTypeOption[]>('/trainee-types');
export const getCaptcha = () => request<Captcha>('/captcha');

export type RegistrationSource = 'internal' | 'external';

/** Đăng ký khóa học công khai — khóa trường khớp backend registrationConstants.SNAPSHOT_FIELDS */
export interface RegisterPayload {
	source: RegistrationSource;
	full_name: string;
	dob?: string;
	gender?: string;
	ethnicity?: string;
	hometown?: string;
	national_id?: string;
	national_id_issued_date?: string;
	national_id_issued_place?: string;
	permanent_address?: string;
	address?: string;
	phone?: string;
	email?: string;
	qualification?: string;
	graduated_school?: string;
	graduated_year?: number;
	graduated_major?: string;
	degree_number?: string;
	degree_registry_number?: string;
	workplace?: string;
	work_specialty?: string;
	work_seniority?: string;
	trainee_type_id?: string;
	/** Chỉ nội viện */
	staff_number?: string;
	department_id?: string;
	/** Chỉ ngoại viện, tùy chọn */
	invoice_org_name?: string;
	invoice_org_address?: string;
	invoice_tax_code?: string;
	invoice_budget_code?: string;
	invoice_email?: string;
	rules_accepted: boolean;
	declared_true: boolean;
	/** Đồng ý cho Bệnh viện xử lý dữ liệu cá nhân */
	data_consent: boolean;
	/** Họ tên gõ lại để ký xác nhận — máy chủ đòi trùng full_name (không phân biệt hoa thường) */
	signature_name: string;
	/** Trường tùy chỉnh (Cấu hình form 'course_registration') */
	custom?: CustomValues;
	course_id: string;
	program_id?: string;
	/** Từ verifyRegistrationEmailOtp — bỏ qua khi máy chủ tắt OTP email */
	email_token?: string;
	captcha_token: string;
	captcha_answer: string;
	website?: string; // honeypot — luôn để trống, ẩn khỏi người dùng thật bằng CSS
}

/** Mọi nhánh đăng ký trả cùng hình dạng này (kể cả khi bị chặn ngầm) */
export interface RegisterResult {
	submitted: boolean;
	registration_code: string;
	/** JWT 30 phút để tải đơn ngay ở màn "đăng ký thành công" */
	download_token: string;
}

export type RegistrationFileKind =
	| 'application_signed'
	| 'proposal_approved' // nội viện
	| 'national_id'
	| 'degree'
	| 'license'
	| 'decision'; // ngoại viện

export interface RegistrationFileKindDef {
	key: RegistrationFileKind;
	label: string;
	hint: string;
	/** Bắt buộc lúc gửi đăng ký */
	required: boolean;
	/** Không bắt buộc lúc gửi, nộp bổ sung sau được (tờ trình nội viện) — vẫn tính là "còn thiếu" */
	later?: boolean;
}

export interface RegistrationAttachmentRules {
	/** ['.pdf', '.jpg', '.jpeg', '.png'] */
	extensions: string[];
	/** Dung lượng tối đa mỗi file (MB) — = UPLOAD_MAX_MB */
	max_size_mb: number;
	kinds: Record<RegistrationSource, RegistrationFileKindDef[]>;
}

/** 1 dòng hồ sơ của 1 lượt đăng ký. Luôn có đủ các loại của đối tượng (theo thứ tự trong rules),
 *  thêm dòng 'dossier' ở cuối nếu đơn cũ có file gộp. */
export interface RegistrationFileItem {
	kind: RegistrationFileKind | 'dossier';
	label: string;
	required: boolean;
	/** Nộp bổ sung sau được (tờ trình nội viện) */
	later?: boolean;
	/** true = file gộp nộp theo cách cũ (chỉ xem, không nộp mới) */
	legacy: boolean;
	/** null = chưa nộp (hoặc file đã bị xóa) */
	uploaded_at: string | null;
	file_name: string | null;
	/** Link /uploads có chữ ký. Luôn null ở cổng công khai; null ở quản trị khi thiếu trainees:read_sensitive */
	file_url: string | null;
	mime_type: string | null;
	/** Ngoại viện: trạng thái duyệt của dòng trainee_documents; nội viện / chưa nộp: null */
	review_status: 'pending' | 'approved' | 'rejected' | null;
	/** Kết quả tự kiểm tra loại file (OCR / QR) — chỉ để cảnh báo; null = chưa nộp / loại không kiểm */
	check?: RegistrationFileCheck | null;
}

/** Mã cảnh báo của bước tự kiểm tra (backend docCheckRules.js WARNING_MESSAGES + 'duplicate') */
export type RegistrationFileCheckWarning =
	| 'blank'
	| 'low_resolution'
	| 'duplicate'
	| 'id_mismatch'
	| 'cccd_missing_front'
	| 'cccd_missing_back'
	| 'name_not_found';

/** Kết quả tự kiểm tra 1 file hồ sơ (backend docCheckService.present) */
export interface RegistrationFileCheck {
	status: 'pending' | 'running' | 'done' | 'error' | 'skipped';
	/** ok = đúng loại; mismatch = có vẻ sai loại; unclear = không đọc được; null = chưa xong */
	verdict: 'ok' | 'mismatch' | 'unclear' | null;
	detected_kind: string | null;
	detected_label: string | null;
	/** ok = đúng, không cảnh báo; warn = nên xem lại; info = đang kiểm / không kết luận */
	level: 'ok' | 'warn' | 'info';
	message: string;
	warnings: { code: RegistrationFileCheckWarning; message: string }[];
}

/** Kết quả nộp / thay 1 file (công khai và cổng nhân viên) */
export interface RegistrationFileUploadResult {
	kind: RegistrationFileKind;
	uploaded_at: string;
	/** Khóa loại bắt buộc còn thiếu sau lần nộp này */
	files_missing: RegistrationFileKind[];
}

/** Gửi đăng ký: luôn multipart — `data` = JSON form, mỗi loại hồ sơ 1 phần `files[<kind>]` */
export const registerCourse = (data: RegisterPayload, files: Partial<Record<RegistrationFileKind, File>>) => {
	const form = new FormData();
	form.append('data', JSON.stringify(data));
	(Object.entries(files) as [RegistrationFileKind, File | undefined][]).forEach(([kind, file]) => {
		if (file) form.append(`files[${kind}]`, file);
	});
	return request<RegisterResult>('/course-registration', { method: 'POST', body: form });
};

export interface CourseRegistrationRules {
	version: string;
	rules: string[];
	/** Gợi ý "Nơi cấp" CCCD */
	id_issue_places: string[];
	email_otp_required: boolean;
	attachments: RegistrationAttachmentRules;
	/** Nguyên văn câu cam kết máy chủ sẽ lưu vào bản ghi xác nhận điện tử */
	consent: RegistrationConsentText;
}
export interface RegistrationConsentText {
	version: string;
	commitments: { rules: string; declared: string; data: string };
	signature_note: string;
}
export const getCourseRegistrationRules = () => request<CourseRegistrationRules>('/course-registration/rules');

export interface RegistrationStaff {
	full_name: string;
	department_id: string;
	department_name: string;
	qualification: string | null;
	/** Email trong hồ sơ nhân sự đã che (null = không có email thật) */
	email_masked: string | null;
}
// Không khớp ⇒ 404 với thông báo chung (không lộ mã nhân viên có tồn tại hay không)
export const checkRegistrationStaff = (staff_number: string, full_name: string) =>
	request<RegistrationStaff>('/course-registration/staff-check', {
		method: 'POST',
		body: JSON.stringify({ staff_number, full_name }),
	});

export interface EmailOtpPayload {
	source: RegistrationSource;
	email: string;
	staff_number?: string;
	full_name?: string;
	captcha_token: string;
	captcha_answer: string;
}
export interface EmailOtpChallenge {
	challenge_id: string;
	to_masked: string;
	ttl_min: number;
}
export const requestRegistrationEmailOtp = (data: EmailOtpPayload) =>
	request<EmailOtpChallenge>('/course-registration/email-otp', {
		method: 'POST',
		body: JSON.stringify(data),
	});
export const verifyRegistrationEmailOtp = (challenge_id: string, code: string) =>
	request<{ email_token: string }>('/course-registration/email-otp/verify', {
		method: 'POST',
		body: JSON.stringify({ challenge_id, code }),
	});

/** Yếu tố xác thực của 1 đơn — luôn gửi trong body (POST), không đưa lên URL */
export type RegistrationProof = { national_id: string } | { email: string } | { download_token: string };

export interface RegistrationStatus {
	registration_code: string;
	full_name: string;
	source: RegistrationSource;
	course_name: string;
	program_name: string | null;
	enrollment_status: 'pending' | 'approved' | 'rejected' | 'waitlisted' | string;
	registered_at: string;
	/** true khi lượt ghi danh còn pending / waitlisted — được nộp / thay file */
	can_upload: boolean;
	/** file_url luôn null ở cổng công khai */
	files: RegistrationFileItem[];
	files_missing: RegistrationFileKind[];
}
const registrationPath = (code: string, action: 'status' | 'application' | 'details' | 'amend') =>
	`/course-registration/${encodeURIComponent(code)}/${seg(action)}`;

export const getRegistrationStatus = (code: string, proof: RegistrationProof) =>
	request<RegistrationStatus>(registrationPath(code, 'status'), {
		method: 'POST',
		body: JSON.stringify(proof),
	});
/** Đơn đăng ký (.docx) đã điền sẵn để in, ký */
export const downloadRegistrationApplication = (code: string, proof: RegistrationProof) =>
	requestBlob(registrationPath(code, 'application'), {
		method: 'POST',
		body: JSON.stringify(proof),
	});
/** Bản khai đầy đủ để điền sẵn form sửa (mã + CCCD / download_token, không nhận email) */
export interface RegistrationEditable {
	registration_code: string;
	source: RegistrationSource;
	enrollment_status: string | null;
	/** Còn chờ duyệt và chưa sửa quá số lần cho phép */
	can_edit: boolean;
	/** Lý do không sửa được (null = sửa được) */
	closed_reason: string | null;
	amendments_left: number;
	snapshot: Record<string, string | number | null | undefined>;
	/** null với nội viện */
	invoice: Record<string, string | null> | null;
	custom: CustomValues;
	/** Nội viện: phần lấy từ hồ sơ nhân sự (không sửa ở đây) + email nhận OTP đã che */
	staff: {
		staff_number: number | string | null;
		full_name: string | null;
		department_id: string | null;
		department_name: string | null;
		qualification: string | null;
		email_masked: string | null;
	} | null;
	amendments: { seq: number; created_at: string; reason: string; fields: string[] }[];
}
export const getRegistrationDetails = (code: string, proof: RegistrationProof) =>
	request<RegistrationEditable>(registrationPath(code, 'details'), {
		method: 'POST',
		body: JSON.stringify(proof),
	});

/** Bản sửa: đúng các trường của form đăng ký (trừ khóa học / nội quy) + lý do + ký lại */
export type AmendPayload = Omit<RegisterPayload, 'course_id' | 'program_id' | 'rules_accepted' | 'website'> & {
	/** Yếu tố thứ hai ĐANG lưu (CCCD cũ / download_token) — body còn chứa CCCD mới */
	access: { national_id: string } | { download_token: string };
	reason: string;
};
export interface AmendResult {
	seq: number;
	consent_hash: string;
	fields: string[];
	identity_changed: boolean;
	/** Trạng thái tra cứu sau khi sửa */
	status: RegistrationStatus;
}
export const amendRegistration = (code: string, payload: AmendPayload) =>
	request<AmendResult>(registrationPath(code, 'amend'), {
		method: 'POST',
		body: JSON.stringify(payload),
	});

/** Nộp / thay 1 loại hồ sơ của đơn (chỉ khi lượt ghi danh còn chờ duyệt) */
export const uploadRegistrationFile = (
	code: string,
	proof: RegistrationProof,
	kind: RegistrationFileKind,
	file: File,
) => {
	const form = new FormData();
	form.append('data', JSON.stringify(proof));
	form.append('file', file);
	return request<RegistrationFileUploadResult>(`/course-registration/${encodeURIComponent(code)}/files/${seg(kind)}`, {
		method: 'POST',
		body: form,
	});
};

/** Đơn đăng ký nháp (nội viện) — chưa có mã đăng ký; khóa trường thừa bị máy chủ bỏ qua */
export interface DraftApplicationPayload {
	source: 'internal';
	course_id: string;
	program_id?: string;
	staff_number: string;
	full_name: string;
	dob?: string;
	gender?: string;
	ethnicity?: string;
	hometown?: string;
	national_id?: string;
	national_id_issued_date?: string;
	national_id_issued_place?: string;
	permanent_address?: string;
	address?: string;
	phone?: string;
	email?: string;
	graduated_school?: string;
	graduated_year?: number;
	graduated_major?: string;
	degree_number?: string;
	degree_registry_number?: string;
	work_specialty?: string;
	work_seniority?: string;
	trainee_type_id?: string;
}

export interface DraftProposalPayload {
	course_id: string;
	program_id?: string;
	staff_number: string;
	full_name: string;
	/** Để in năm sinh trong bảng danh sách */
	dob?: string;
}

/** Đơn đăng ký nháp (.docx, điền sẵn, chưa có mã) — không cần captcha, máy chủ bắt khớp lại mã NV + họ tên */
export const downloadDraftApplication = (data: DraftApplicationPayload) =>
	requestBlob('/course-registration/draft/application', { method: 'POST', body: JSON.stringify(data) });
/** Tờ trình + Bảng phân tích nhu cầu nháp (.docx) */
export const downloadDraftProposal = (data: DraftProposalPayload) =>
	requestBlob('/course-registration/draft/proposal', { method: 'POST', body: JSON.stringify(data) });

export interface LookupResult {
	full_name: string;
	course_name: string;
	enrollment_status: 'pending' | 'approved' | 'rejected' | 'waitlisted' | string;
	result: string | null;
	score: number | null;
	cert_no: string | null;
	issue_date: string | null;
}

export const lookupByNationalId = (nationalId: string, dob: string, fullName: string) =>
	request<LookupResult[]>(
		`/lookup?national_id=${encodeURIComponent(nationalId)}&dob=${encodeURIComponent(dob)}&full_name=${encodeURIComponent(fullName)}`,
	);

// ─── Đăng ký đề tài công khai ────────────────────────────────────────────────
export interface PublicTopicRound {
	id: string;
	name: string;
	year: number;
	round_type_id: string | null;
	round_type_name: string | null;
	registration_start: string | null;
	registration_end: string | null;
}

export interface SimpleOption {
	id: string;
	name: string;
}

export interface TokenTopicRound extends PublicTopicRound {
	status: string;
	registration_open: boolean;
}

export const getOpenTopicRounds = () => request<PublicTopicRound[]>('/topic-rounds');
// Đợt theo public_token trong link đăng ký (?token=) — dùng cho cả cổng công
// khai lẫn form khoa/phòng. Token sai ⇒ throw với thông báo của server.
export const getTopicRoundByToken = (token: string) =>
	request<TokenTopicRound>(`/topic-rounds/by-token/${encodeURIComponent(token)}`);
export const getPublicCategories = () => request<SimpleOption[]>('/categories');
export const getPublicDepartments = () => request<SimpleOption[]>('/departments');
export const getPublicLevels = (roundId: string) =>
	request<SimpleOption[]>(`/levels?round_id=${encodeURIComponent(roundId)}`);

export interface TopicRegisterMember {
	full_name: string;
	role: 'secretary' | 'member';
	staff_number: string;
	phone: string;
	/** Chức danh chuyên môn */
	position: string;
	department_id?: string;
	email?: string;
}

export interface TopicRegisterPayload {
	/** Người đăng ký = chủ nhiệm đề tài */
	full_name: string;
	staff_number: string;
	phone: string;
	position: string;
	/** Khoa phòng của chủ nhiệm — trống thì lấy khoa/phòng của đề tài */
	member_department_id?: string;
	email?: string;
	title: string;
	description?: string;
	round_id: string;
	department_id: string;
	category_id: string;
	members?: TopicRegisterMember[];
	/** Trường tùy chỉnh (Cấu hình form) */
	custom?: CustomValues;
	captcha_token: string;
	captcha_answer: string;
	website?: string; // honeypot — luôn để trống
}

export const registerTopic = (data: TopicRegisterPayload, files?: File[]) =>
	request<{ topic_id: string | null }>('/topic-registration', {
		method: 'POST',
		body: buildBody(data, files),
	});

// ─── Tra cứu hồ sơ đề tài theo mã ────────────────────────────────────────────
export interface TopicStatus {
	id: string;
	title: string;
	status: 'submitted' | 'approved' | 'rejected' | 'supplement' | 'cancelled';
	created_at: string;
	updated_at: string | null;
}

// contact: email hoặc số điện thoại của 1 thành viên đề tài (đã nhập khi nộp hồ sơ)
export const getTopicStatus = (topicId: string, contact: string) =>
	request<TopicStatus>(`/topics/${encodeURIComponent(topicId)}/status?contact=${encodeURIComponent(contact)}`);

// ─── Thư viện đề tài công khai ───────────────────────────────────────────────
export interface FeaturedTopic {
	id: string;
	title: string;
	description: string | null;
	article_type: 'de_tai' | 'bai_bao';
	journal_name: string | null;
	publish_date: string | null;
	created_at: string;
	department_name: string | null;
	round_year: number | null;
	category_name: string | null;
}

export const getFeaturedTopics = () => request<FeaturedTopic[]>('/featured-topics');

// ─── Hội nghị: đăng ký qua QR, vé QR, bài kiểm tra cuối buổi ─────────────────────
export interface PublicSeminar {
	id: string;
	title: string;
	location: string | null;
	start_date: string | null;
	end_date: string | null;
	/** 'HH:mm' */
	start_time?: string | null;
	end_time?: string | null;
	date_text: string | null;
	grants_cme: boolean;
	cme_default_credits: number | null;
	registration_open: boolean;
}

export interface SeminarRegisterPayload {
	title_prefix?: string;
	full_name: string;
	/** Nội viện: chỉ cần họ tên + mã NV, backend tự lấy phần còn lại */
	staff_number?: string;
	dob?: string;
	gender?: string;
	phone?: string;
	email?: string;
	organization?: string;
	department_raw?: string;
	qualification_raw?: string;
	source: 'internal' | 'external';
	/** Trường tùy chỉnh (Cấu hình form 'seminar_participant') */
	custom?: CustomValues;
	captcha_token: string;
	captcha_answer: string;
	website?: string; // honeypot
}

export interface SeminarTicket {
	title_prefix: string | null;
	full_name: string;
	organization: string | null;
	checked_in_at: string | null;
	seminar: Pick<
		PublicSeminar,
		'title' | 'location' | 'start_date' | 'end_date' | 'start_time' | 'end_time' | 'date_text' | 'grants_cme'
	>;
	test: {
		has_test: boolean;
		open: boolean;
		/** off = BTC chưa bật · scheduled = chưa tới giờ · open · closed = quá giờ */
		state?: 'off' | 'scheduled' | 'open' | 'closed';
		/** Mở bài: date + start_time · dừng tiếp nhận: end_date + end_time (YYYY-MM-DD) */
		window?: { date: string; end_date?: string; start_time: string | null; end_time: string | null } | null;
		question_count?: number;
		/** Tổng điểm bài kiểm tra */
		max_score?: number | null;
		/** Thời gian làm bài (phút) — null = không giới hạn */
		duration_minutes?: number | null;
		pass_score?: number | null;
		/** Có giới hạn thời gian: đủ điều kiện nhưng chưa bấm "Bắt đầu" */
		can_start?: boolean;
		/** Đã bắt đầu nhưng hết giờ mà chưa nộp */
		expired?: boolean;
		/** Giây còn lại tới hạn nộp khi đang làm bài — null = không giới hạn */
		remaining_seconds?: number | null;
		submitted_at: string | null;
		correct: number | null;
		total: number | null;
		score?: number | null;
		passed?: boolean | null;
		/** Chỉ có khi đang làm bài (đã điểm danh + bài kiểm tra đang mở + chưa nộp) — đã trộn theo vé */
		questions: { q: string; image: string | null; options: string[]; points?: number }[] | null;
	};
	cme: { certificate_no: string; year: number; credits: number | null } | null;
}

export const getPublicSeminar = (token: string) =>
	request<PublicSeminar>(`/seminars/${encodeURIComponent(token)}`);
export interface SeminarStaff {
	full_name: string;
	title_prefix: string | null;
	department_name: string | null;
	qualification: string | null;
}
export const lookupSeminarStaff = (token: string, full_name: string, staff_number: string) =>
	request<SeminarStaff>(`/seminars/${encodeURIComponent(token)}/staff-lookup`, {
		method: 'POST',
		body: JSON.stringify({ full_name, staff_number }),
	});
export const registerSeminar = (token: string, data: SeminarRegisterPayload) =>
	request<{ ticket_code: string }>(`/seminars/${encodeURIComponent(token)}/register`, {
		method: 'POST',
		body: JSON.stringify(data),
	});
export const getSeminarTicket = (code: string) =>
	request<SeminarTicket>(`/seminar-tickets/${encodeURIComponent(code)}`);
export const startSeminarTest = (code: string) =>
	request<SeminarTicket>(`/seminar-tickets/${encodeURIComponent(code)}/test/start`, { method: 'POST' });
/** answers theo thứ tự hiển thị; null = bỏ trống (hết giờ tự nộp) */
export const submitSeminarTest = (code: string, answers: (number | null)[]) =>
	request<{ correct: number; total: number; score: number; max_score: number; passed: boolean }>(`/seminar-tickets/${encodeURIComponent(code)}/test`, {
		method: 'POST',
		body: JSON.stringify({ answers }),
	});
