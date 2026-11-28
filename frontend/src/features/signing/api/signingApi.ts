import { apiClient } from '../../../shared/api/axios';
import type {
	SigningAccount,
	SigningAccountForm,
	SigningConfig,
	SigningLogPage,
	SigningStatus,
} from '../types/signing.type';

const qs = (params: Record<string, string | number | undefined | null>) => {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
	const s = sp.toString();
	return s ? `?${s}` : '';
};

export const signingApi = {
	// ─── Quản trị (signing:manage) ────────────────────────────────────────
	listAccounts: () => apiClient.get<SigningAccount[]>('/signing/accounts'),
	createAccount: (data: SigningAccountForm) =>
		apiClient.post<SigningAccount>('/signing/accounts', { ...data, kind: data.kind ?? 'organization' }),
	updateAccount: (id: number, data: Partial<SigningAccountForm> & { is_active?: boolean }) =>
		apiClient.put<SigningAccount>(`/signing/accounts/${id}`, data),
	removeAccount: (id: number) => apiClient.delete<null>(`/signing/accounts/${id}`),
	checkAccount: (id: number) => apiClient.post<SigningAccount>(`/signing/accounts/${id}/check`, {}),
	/** Ký thử phiếu mẫu — trả file PDF đã ký */
	testSignAccount: (id: number) => apiClient.postBlob(`/signing/accounts/${id}/test-sign`, {}),
	logs: (q: { page?: number; limit?: number; status?: string; doc_type?: string; account_id?: number | '' }) =>
		apiClient.get<SigningLogPage>(`/signing/logs${qs(q)}`),
	getConfig: () => apiClient.get<SigningConfig>('/signing/config'),
	saveConfig: (data: Pick<SigningConfig, 'enabled' | 'self_manage' | 'features' | 'providers'>) =>
		apiClient.put<SigningConfig>('/signing/config', data),

	// ─── Của tôi ─────────────────────────────────────────────────────────
	getMine: () => apiClient.get<{ account: SigningAccount | null; status: SigningStatus }>('/signing/me'),
	saveMine: (data: { region: string; api_key?: string; secret?: string }) =>
		apiClient.put<SigningAccount>('/signing/me', data),
	removeMine: () => apiClient.delete<null>('/signing/me'),
	checkMine: () => apiClient.post<SigningAccount>('/signing/me/check', {}),
	testSignMine: () => apiClient.postBlob('/signing/me/test-sign', {}),
	/** Ảnh chữ ký tay của mình (data URL PNG) */
	getSignatureImage: () => apiClient.get<{ image: string | null }>('/signing/me/signature-image'),
	/** image: data URL ảnh mới, null = xóa; show_text: in chức vụ dưới ảnh; caption: chữ chức vụ */
	saveSignatureImage: (data: {
		image?: string | null;
		show_text?: boolean;
		caption?: string | null;
		display_name?: string | null;
	}) =>
		apiClient.put<SigningAccount>('/signing/me/signature-image', data),
	/** Ký 1 PDF tự tải lên tại vị trí đã chọn (form: file, page, x, y, width, height — pt, gốc dưới-trái) */
	signPdf: (form: FormData) => apiClient.postBlob('/signing/me/sign-pdf', form),
	myStatus: () => apiClient.get<SigningStatus>('/signing/me/status'),
};
