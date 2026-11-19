import { apiClient } from '@/shared/api/axios';
import { BASE_URL } from '@/shared/api/endpoints';
import { readJson, safeFetch } from '@/shared/api/http';
import { refreshQueued } from '@/shared/api/interceptors';
import { getToken } from '@/shared/utils/storage';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';
import type { EnrollmentStatus } from '../types/course.type';

// ─── Bản khai đăng ký (form /dang-ky-khoa-hoc) — phòng Đào tạo đối chiếu trước khi duyệt ──

export type RegistrationSource = 'internal' | 'external';
export type RegistrationCheckKey = 'id_checked' | 'degree_checked' | 'proposal_checked';

/** Mốc đối chiếu đã đánh dấu: lúc nào, ai. */
export interface RegistrationCheckInfo {
	at: string;
	by: string | null;
	by_name: string | null;
}

/** Trường có cả trong bản khai lẫn hồ sơ học viên mà lệch nhau. */
export interface RegistrationDiff {
	key: string;
	declared: string | number | null;
	profile: string | number | null;
	/** Trường danh mục (khoa, đối tượng): tên thay cho mã. */
	declared_label?: string | null;
	profile_label?: string | null;
}

export interface RegistrationDossier {
	file_id: string;
	file_name: string;
	/** null khi thiếu quyền xem dữ liệu nhạy cảm của học viên */
	file_url: string | null;
	mime_type: string | null;
	file_size: number | null;
	uploaded_at: string | null;
}

export interface RegistrationReview {
	enrollment_id: string;
	registration_code: string;
	source: RegistrationSource;
	channel: 'public' | 'portal' | null;
	staff_number: number | null;
	department_id: string | null;
	department_name: string | null;
	trainee_type_name: string | null;
	course_id: string | null;
	course_name: string | null;
	program_name: string | null;
	enrollment_status: EnrollmentStatus | null;
	snapshot: Record<string, string | number | null | undefined>;
	diffs: RegistrationDiff[];
	rules_version: string | null;
	rules_accepted_at: string | null;
	declared_true_at: string | null;
	verified_email: string | null;
	email_verified_at: string | null;
	invoice: Record<string, string | null>;
	checks: Record<RegistrationCheckKey, RegistrationCheckInfo | null>;
	/** Điều kiện phải đủ trước khi duyệt: mốc đối chiếu + 'dossier' (nội viện). */
	required: (RegistrationCheckKey | 'dossier')[];
	/** false = cấu hình tắt chốt chặn (TRAINING_REGISTRATION_REQUIRE_CHECKS = 'false'). */
	require_checks: boolean;
	/** Tên điều kiện còn thiếu để duyệt (rỗng khi đủ hoặc cấu hình tắt). */
	missing: string[];
	dossier: RegistrationDossier | null;
	created_at: string | null;
}

/** Tóm tắt bản khai trên 1 dòng danh sách ghi danh (null = ghi danh hộ / nhập Excel). */
export interface EnrollmentRegistrationFlag {
	code: string;
	source: RegistrationSource;
	id_checked: boolean;
	degree_checked: boolean;
	proposal_checked: boolean;
	has_dossier: boolean;
	require_checks: boolean;
	missing: string[];
	ready: boolean;
}

/** 1 nhóm nội viện (khóa + chương trình + khoa) — dữ liệu Tờ trình. */
export interface ProposalGroup {
	course_id: string;
	course_name: string;
	start_date: string | null;
	end_date: string | null;
	program_id: string | null;
	program_name: string | null;
	tuition_fee: number | null;
	department_id: string;
	department_name: string;
	/** Số người còn được cử đi (bỏ người bị từ chối). */
	proposed_count: number;
	people: {
		enrollment_id: string;
		staff_user_id: string;
		staff_number: number | null;
		full_name: string;
		birth_year: number | null;
		qualification: string | null;
		enrollment_status: EnrollmentStatus;
		dossier_uploaded_at: string | null;
		proposal_checked_at: string | null;
	}[];
}

const reg = (enrollmentId: string) => `/courses/enrollments/${enrollmentId}/registration`;

export const getEnrollmentRegistration = (enrollmentId: string) =>
	apiClient.get<RegistrationReview | null>(reg(enrollmentId));
export const setRegistrationChecks = (enrollmentId: string, checks: Partial<Record<RegistrationCheckKey, boolean>>) =>
	apiClient.put<RegistrationReview>(`${reg(enrollmentId)}/checks`, checks);
export const getRegistrationDossier = (enrollmentId: string) =>
	apiClient.get<RegistrationDossier>(`${reg(enrollmentId)}/dossier`);
/** Đường dẫn cho FileViewerModal (xem trước .docx) */
export const registrationApplicationUrl = (enrollmentId: string) => `/api/v1${reg(enrollmentId)}/application`;
export const downloadRegistrationApplication = (enrollmentId: string) => getBlob(`${reg(enrollmentId)}/application`);

export const getCourseProposals = (courseId: string) => apiClient.get<ProposalGroup[]>(`/courses/${courseId}/proposals`);
export const downloadCourseProposal = (courseId: string, departmentId: string, programId: string | null) =>
	getBlob(
		`/courses/${courseId}/proposals/document?${new URLSearchParams({
			department_id: departmentId,
			...(programId ? { program_id: programId } : {}),
		})}`,
	);

/**
 * Tải file qua GET có Bearer (apiClient chỉ có postBlob). Hết hạn access token thì làm mới
 * 1 lần rồi thử lại, giống requestBlob của apiClient.
 */
export async function getBlob(path: string): Promise<Blob> {
	const run = (token: string | null) =>
		safeFetch(`${BASE_URL}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
	let res = await run(getToken());
	if (res.status === 401) {
		const fresh = await refreshQueued();
		if (!fresh) throw new Error('Phiên đăng nhập đã hết hạn');
		res = await run(fresh);
	}
	if (!res.ok) {
		const json = (res.headers.get('Content-Type') ?? '').includes('json') ? await readJson(res) : null;
		throw new Error(json?.message ?? `Không tải được file (${res.status})`);
	}
	return res.blob();
}

// ─── Nhãn trường, nhóm như trên form đăng ký ────────────────────────────────
export const REGISTRATION_FIELD_LABELS: Record<string, string> = {
	full_name: 'Họ và tên',
	dob: 'Ngày sinh',
	gender: 'Giới tính',
	ethnicity: 'Dân tộc',
	hometown: 'Quê quán',
	national_id: 'Số CCCD',
	national_id_issued_date: 'Ngày cấp',
	national_id_issued_place: 'Nơi cấp',
	permanent_address: 'Địa chỉ thường trú',
	address: 'Địa chỉ liên hệ',
	phone: 'Số điện thoại',
	email: 'Email',
	qualification: 'Trình độ',
	graduated_school: 'Trường tốt nghiệp',
	graduated_year: 'Năm tốt nghiệp',
	graduated_major: 'Chuyên ngành tốt nghiệp',
	degree_number: 'Số hiệu văn bằng',
	degree_registry_number: 'Số vào sổ cấp bằng',
	workplace: 'Đơn vị công tác',
	work_specialty: 'Chuyên ngành đang công tác',
	work_seniority: 'Thâm niên công tác',
	trainee_type_id: 'Đối tượng học viên',
	staff_number: 'Mã nhân viên',
	department_id: 'Khoa/Phòng/TT đang công tác',
	invoice_org_name: 'Tên đơn vị',
	invoice_org_address: 'Địa chỉ đơn vị',
	invoice_tax_code: 'Mã số thuế',
	invoice_budget_code: 'Mã đơn vị quan hệ ngân sách',
	invoice_email: 'Email nhận hóa đơn',
};

export const REGISTRATION_FIELD_GROUPS: { title: string; keys: string[] }[] = [
	{ title: 'Thông tin cá nhân', keys: ['full_name', 'dob', 'gender', 'ethnicity', 'hometown'] },
	{ title: 'Căn cước công dân', keys: ['national_id', 'national_id_issued_date', 'national_id_issued_place'] },
	{ title: 'Liên hệ', keys: ['permanent_address', 'address', 'phone', 'email'] },
	{
		title: 'Trình độ và văn bằng',
		keys: [
			'qualification',
			'graduated_school',
			'graduated_year',
			'graduated_major',
			'degree_number',
			'degree_registry_number',
		],
	},
	{
		title: 'Công tác',
		keys: ['staff_number', 'department_id', 'workplace', 'work_specialty', 'work_seniority', 'trainee_type_id'],
	},
];

export const GENDER_LABEL: Record<string, string> = { male: 'Nam', female: 'Nữ', other: 'Khác' };

/** Tên mốc đối chiếu hiện trên checkbox */
export const CHECK_LABEL: Record<RegistrationCheckKey, string> = {
	id_checked: 'Đã đối chiếu CCCD',
	degree_checked: 'Đã đối chiếu văn bằng',
	proposal_checked: 'Đã đối chiếu tờ trình (đã duyệt)',
};

/** Tông Badge theo trạng thái ghi danh (nhãn: ENROLLMENT_STATUS_CFG) */
export const ENROLLMENT_STATUS_TONE: Record<EnrollmentStatus, BadgeTone> = {
	pending: 'amber',
	approved: 'green',
	rejected: 'red',
	waitlisted: 'blue',
};
