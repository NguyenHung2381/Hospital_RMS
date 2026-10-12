import { useEffect, useState } from 'react';
import { apiClient } from '../api/axios';

export type ModuleKey = 'research' | 'training' | 'seminar' | 'survey';
export type Modules = Record<ModuleKey, boolean>;

const ALL_ON: Modules = { research: true, training: true, seminar: true, survey: true };
let cache: Modules | null = null;
let inflight: Promise<Modules> | null = null;

const fetchModules = () =>
	(inflight ??= apiClient
		.get<Modules>('/modules')
		.then((m) => (cache = m))
		.catch(() => ALL_ON) // lỗi mạng: không ẩn gì, server vẫn chặn API của module tắt
		.finally(() => (inflight = null)));

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
