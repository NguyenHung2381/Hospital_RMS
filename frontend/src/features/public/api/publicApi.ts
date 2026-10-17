import { BASE_URL } from '../../../shared/api/axios';

// Client riêng cho cổng công khai — KHÔNG dùng shared/api/axios.apiClient vì
// nó tự gắn Authorization/refresh-token cho phiên đăng nhập, không phù hợp
// với các trang không cần đăng nhập này (mirror cách features/auth/api/authApi.ts
// gọi thẳng fetch tới /auth/login).
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	// FormData: để trình duyệt tự đặt Content-Type multipart kèm boundary
	const isForm = options.body instanceof FormData;
	const res = await fetch(`${BASE_URL}/api/v1/public${path}`, {
		...options,
		headers: {
			...(isForm ? {} : { 'Content-Type': 'application/json' }),
			...(options.headers ?? {}),
		},
	});
	const json = await res.json();
	if (!res.ok || !json.success) {
		throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	}
	return json.data as T;
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
	start_date: string | null;
	end_date: string | null;
	capacity: number | null;
	program_name: string | null;
}

export interface TraineeTypeOption {
	id: string;
	name: string;
}

// Server chọn chế độ (backend utils/captcha.js): proof-of-work mặc định (trình
// duyệt tự giải ngầm), hoặc Cloudflare Turnstile khi đã cấu hình khoá.
export type Captcha =
	| { provider: 'pow'; token: string; bits: number; expires_in: number }
	| { provider: 'turnstile'; site_key: string; action: string };

export const getOpenCourses = () => request<PublicCourse[]>('/courses');
export const getTraineeTypes = () => request<TraineeTypeOption[]>('/trainee-types');
export const getCaptcha = () => request<Captcha>('/captcha');

export interface RegisterPayload {
	full_name: string;
	dob?: string;
	gender?: string;
	national_id?: string;
	phone?: string;
	email?: string;
	address?: string;
	trainee_type_id?: string;
	course_id: string;
	/** Loại hồ sơ của từng file đính kèm, cùng thứ tự với `files` */
	doc_types?: TraineeDocType[];
	captcha_token: string;
	captcha_answer: string;
	website?: string; // honeypot — luôn để trống, ẩn khỏi người dùng thật bằng CSS
}

export type TraineeDocType = 'national_id' | 'degree' | 'other';

export const registerCourse = (data: RegisterPayload, files?: File[]) =>
	request<{ trainee_id: string | null; enrollment_id: string | null }>('/course-registration', {
		method: 'POST',
		body: buildBody(data, files),
	});

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
	/** Chỉ cần khi đợt cho nhiều cấp độ — đợt 1 cấp độ thì server tự gán */
	level_id?: string;
	members?: TopicRegisterMember[];
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

// ─── Hội nghị: đăng ký qua QR, vé QR, bài test cuối buổi ─────────────────────
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
	dob?: string;
	gender?: string;
	phone: string;
	email?: string;
	organization: string;
	department_raw?: string;
	qualification_raw?: string;
	source: 'internal' | 'external';
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
		/** Tổng điểm bài test */
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
		/** Chỉ có khi đang làm bài (đã điểm danh + bài test đang mở + chưa nộp) — đã trộn theo vé */
		questions: { q: string; image: string | null; options: string[]; points?: number }[] | null;
	};
	cme: { certificate_no: string; year: number; credits: number | null } | null;
}

export const getPublicSeminar = (token: string) =>
	request<PublicSeminar>(`/seminars/${encodeURIComponent(token)}`);
export const registerSeminar = (token: string, data: SeminarRegisterPayload) =>
	request<{ ticket_code: string | null }>(`/seminars/${encodeURIComponent(token)}/register`, {
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
