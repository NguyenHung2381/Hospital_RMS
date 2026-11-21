import { apiClient } from '../../../shared/api/axios';
import { seg } from '../../../shared/api/path';

export interface SettingRow {
	setting_key: string;
	value: string | null;
	has_value: boolean;
	/** Giá trị đang áp dụng (UI hoặc .env); không có với secret. */
	effective?: string | null;
}

export const settingsApi = {
	list: () => apiClient.get<SettingRow[]>('/system-settings'),
	update: (key: string, value: string) => apiClient.put<SettingRow>(`/system-settings/${seg(key)}`, { value }),
	testMail: (to: string) => apiClient.post<null>('/system-settings/test-mail', { to }),
	testClamav: () => apiClient.post<{ host: string; port: number; version: string | null }>('/system-settings/test-clamav', {}),
};
