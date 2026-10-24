import { apiClient } from '../../../shared/api/axios';
import type { CmeStatus } from '../../seminar/types/seminar.type';

// Nhân viên tự đăng ký Tập huấn bệnh viện — backend modules/portal/hospitalTrainingSelf.routes.js.
// Chỉ thêm / bớt chính tài khoản đang đăng nhập.

export interface MyHospitalTraining {
	id: string;
	title: string;
	start_date: string | null;
	end_date: string | null;
	start_time: string | null;
	end_time: string | null;
	date_text: string | null;
	location: string | null;
	lesson_hours: number | null;
	grants_cme: boolean;
	speakers: string | null;
	organizer_department_name: string | null;
	topic_name: string | null;
	/** Khoa của mình thuộc khoa bắt buộc tham dự */
	required: boolean;
	registered: boolean;
	self_registered: boolean;
	checked_in_at: string | null;
	cme_status: CmeStatus | null;
	cme_credits: number | null;
	/** Chưa tới ngày học (còn đăng ký được) */
	open: boolean;
	can_register: boolean;
	can_cancel: boolean;
}

export const hospitalTrainingSelfApi = {
	list: () => apiClient.get<MyHospitalTraining[]>('/me/hospital-trainings'),
	register: (id: string) => apiClient.post<MyHospitalTraining>(`/me/hospital-trainings/${id}/register`, {}),
	cancel: (id: string) => apiClient.delete<MyHospitalTraining>(`/me/hospital-trainings/${id}/register`),
};
