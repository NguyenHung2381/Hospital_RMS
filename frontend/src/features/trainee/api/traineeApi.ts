import { apiClient } from '../../../shared/api/axios';
import type {
	Trainee,
	TraineeEnrollment,
	TraineeFormData,
	TraineeImportResult,
	TraineeListResponse,
	TraineeProgress,
} from '../types/trainee.type';

export const getTrainees = (trainingTypeId?: string) =>
	apiClient.get<TraineeListResponse>(
		`/trainees?limit=0${trainingTypeId ? `&training_type_id=${encodeURIComponent(trainingTypeId)}` : ''}`,
	);

export const getTrainee = (traineeId: string) => apiClient.get<Trainee>(`/trainees/${traineeId}`);

export const getTraineeEnrollments = (traineeId: string) =>
	apiClient.get<TraineeEnrollment[]>(`/trainees/${traineeId}/enrollments`);

export const getTraineeProgress = (traineeId: string) =>
	apiClient.get<TraineeProgress[]>(`/trainees/${traineeId}/progress`);

const toPayload = (form: TraineeFormData) => ({
	full_name: form.full_name,
	dob: form.dob || null,
	gender: form.gender || null,
	national_id: form.national_id || null,
	phone: form.phone || null,
	email: form.email || null,
	address: form.address || null,
	permanent_address: form.permanent_address || null,
	trainee_type_id: form.trainee_type_id || null,
	department_id: form.department_id || null,
	national_id_issued_date: form.national_id_issued_date || null,
	national_id_issued_place: form.national_id_issued_place || null,
	graduated_school: form.graduated_school || null,
	graduated_year: form.graduated_year ? Number(form.graduated_year) : null,
	workplace: form.workplace || null,
	position: form.position || null,
	qualification: form.qualification || null,
	notes: form.notes || null,
	birth_province: form.birth_province || null,
	graduated_date: form.graduated_date || null,
	degree_issued_date: form.degree_issued_date || null,
	legacy_code: form.legacy_code || null,
	is_active: form.is_active,
	is_employee: form.is_employee,
});

export const createTrainee = (form: TraineeFormData) =>
	apiClient.post<Trainee>('/trainees', toPayload(form));

export const updateTrainee = (id: string, form: TraineeFormData) =>
	apiClient.put<Trainee>(`/trainees/${id}`, toPayload(form));

export const deleteTrainee = (id: string) => apiClient.delete<null>(`/trainees/${id}`);

export interface GrantedTraineeAccount {
	trainee_id: string;
	user_id: string;
	username: string;
	full_name: string;
	password_plain: string;
}

export interface GrantTraineeAccountsResult {
	credentials: GrantedTraineeAccount[];
	skipped: { trainee_id: string; full_name: string | null; reason: string }[];
}

// Bắt buộc truyền danh sách học viên — backend không còn "cấp cho tất cả".
// Tên đăng nhập dạng NVA_0001, mật khẩu mặc định = tên đăng nhập.
export const grantTraineeAccounts = (traineeIds: string[]) =>
	apiClient.post<GrantTraineeAccountsResult>('/trainees/grant-accounts', {
		trainee_ids: traineeIds,
	});

// Tài khoản học viên cấp riêng — quản lý tại hồ sơ học viên, không qua /users.
// Đặt lại về mật khẩu mặc định (= tên đăng nhập), bắt đổi ở lần đăng nhập tới.
export const resetTraineeAccountPassword = (traineeId: string) =>
	apiClient.post<{ temporary_password: string } | null>(
		`/trainees/${traineeId}/account/reset-password`,
		{},
	);

export const setTraineeAccountActive = (traineeId: string, isActive: boolean) =>
	apiClient.patch<null>(`/trainees/${traineeId}/account`, { is_active: isActive });

export const importTraineesExcel = (file: File, dryRun: boolean) => {
	const form = new FormData();
	form.append('dry_run', dryRun ? '1' : '0');
	form.append('file', file);
	return apiClient.postForm<TraineeImportResult>('/trainees/import-excel', form);
};
