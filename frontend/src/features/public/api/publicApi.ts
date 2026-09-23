import { BASE_URL } from '../../../shared/api/axios';

// Client riêng cho cổng công khai — KHÔNG dùng shared/api/axios.apiClient vì
// nó tự gắn Authorization/refresh-token cho phiên đăng nhập, không phù hợp
// với các trang không cần đăng nhập này (mirror cách features/auth/api/authApi.ts
// gọi thẳng fetch tới /auth/login).
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
	const res = await fetch(`${BASE_URL}/api/v1/public${path}`, {
		...options,
		headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
	});
	const json = await res.json();
	if (!res.ok || !json.success) {
		throw new Error(json.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
	}
	return json.data as T;
}

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

export interface Captcha {
	token: string;
	question: string;
}

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
	captcha_token: string;
	captcha_answer: string;
	website?: string; // honeypot — luôn để trống, ẩn khỏi người dùng thật bằng CSS
}

export const registerCourse = (data: RegisterPayload) =>
	request<{ trainee_id: string | null; enrollment_id: string | null }>('/course-registration', {
		method: 'POST',
		body: JSON.stringify(data),
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

export const lookupByNationalId = (nationalId: string) =>
	request<LookupResult[]>(`/lookup?national_id=${encodeURIComponent(nationalId)}`);

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

export const getOpenTopicRounds = () => request<PublicTopicRound[]>('/topic-rounds');
export const getPublicCategories = () => request<SimpleOption[]>('/categories');
export const getPublicDepartments = () => request<SimpleOption[]>('/departments');
export const getPublicLevels = (roundId: string) =>
	request<SimpleOption[]>(`/levels?round_id=${encodeURIComponent(roundId)}`);

export interface TopicRegisterPayload {
	full_name: string;
	email?: string;
	phone?: string;
	position?: string;
	title: string;
	description?: string;
	round_id: string;
	department_id: string;
	category_id?: string;
	level_id: string;
	captcha_token: string;
	captcha_answer: string;
	website?: string; // honeypot — luôn để trống
}

export const registerTopic = (data: TopicRegisterPayload) =>
	request<{ topic_id: string | null }>('/topic-registration', {
		method: 'POST',
		body: JSON.stringify(data),
	});
