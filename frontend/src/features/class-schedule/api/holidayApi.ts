import { apiClient } from '../../../shared/api/axios';

/** 1 ngày nghỉ lễ đang áp dụng (Cấu hình hệ thống → Ngày nghỉ lễ). */
export interface Holiday {
	/** 'YYYY-MM-DD' */
	date: string;
	name: string;
	/** Ngày nghỉ bù (lễ rơi vào cuối tuần) */
	compensatory: boolean;
}

/** Ngày nghỉ lễ của 1 năm — mọi tài khoản đã đăng nhập xem được. */
export const getHolidays = (year: number) => apiClient.get<Holiday[]>(`/me/holidays?year=${year}`);
