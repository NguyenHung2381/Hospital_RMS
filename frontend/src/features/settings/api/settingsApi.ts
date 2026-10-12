import { apiClient } from '../../../shared/api/axios';

export interface SettingRow {
	setting_key: string;
	value: string | null;
	has_value: boolean;
	/** Giá trị đang áp dụng (UI hoặc .env); không có với secret. */
	effective?: string | null;
}

export const settingsApi = {
	list: () => apiClient.get<SettingRow[]>('/system-settings'),
	update: (key: string, value: string) => apiClient.put<SettingRow>(`/system-settings/${key}`, { value }),
	testMail: (to: string) => apiClient.post<null>('/system-settings/test-mail', { to }),
};
