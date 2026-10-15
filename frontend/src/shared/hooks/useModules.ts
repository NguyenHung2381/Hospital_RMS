import { useEffect, useState } from 'react';
import { apiClient } from '../api/axios';

export type ModuleKey = 'research' | 'training' | 'seminar' | 'survey' | 'attendance';
export type Modules = Record<ModuleKey, boolean>;

// Chấm công mặc định tắt (backend moduleGuard.DEFAULT_OFF)
const ALL_ON: Modules = { research: true, training: true, seminar: true, survey: true, attendance: false };
let cache: Modules | null = null;
let inflight: Promise<Modules> | null = null;

const fetchModules = () =>
	(inflight ??= apiClient
		.get<Modules>('/modules')
		.then((m) => (cache = m))
		.catch(() => ALL_ON) // lỗi mạng: không ẩn gì, server vẫn chặn API của module tắt
		.finally(() => (inflight = null)));

/** Gọi sau khi lưu Cấu hình hệ thống để lần render sau tải lại. */
export const resetModules = () => {
	cache = null;
};

/** Module nghiệp vụ nào đang bật (Cấu hình hệ thống). Mặc định bật hết tới khi tải xong. */
export function useModules(): Modules {
	const [modules, setModules] = useState<Modules>(cache ?? ALL_ON);
	useEffect(() => {
		let alive = true;
		fetchModules().then((m) => alive && setModules(m));
		return () => {
			alive = false;
		};
	}, []);
	return modules;
}
