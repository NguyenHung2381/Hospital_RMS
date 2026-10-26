import { useEffect, useMemo, useState } from 'react';
import { BASE_URL } from '../api/endpoints';
import { validateForm } from './fieldRules';
import type { CustomValues, ResolvedField, ResolvedForm } from './types';

// Cấu hình form (trang Cấu hình form) — endpoint công khai, dùng chung cho cổng
// công khai lẫn trang nội bộ. Cache theo form + variant, hết hạn sau 30s để
// thay đổi của admin tới form đang mở ở tab khác mà không cần tải lại trang.
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; data: ResolvedForm }>();
const inflight = new Map<string, Promise<ResolvedForm | null>>();

const fetchConfig = (formKey: string, variant: string) => {
	const id = `${formKey}:${variant}`;
	const hit = cache.get(id);
	if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.data);
	let p = inflight.get(id);
	if (!p) {
		p = fetch(`${BASE_URL}/api/v1/form-configs/${formKey}?variant=${encodeURIComponent(variant)}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((j) => {
				if (!j?.data) return null;
				cache.set(id, { at: Date.now(), data: j.data as ResolvedForm });
				return j.data as ResolvedForm;
			})
			// Lỗi mạng: form chạy như mặc định trong code, server vẫn kiểm lại
			.catch(() => null)
			.finally(() => inflight.delete(id));
		inflight.set(id, p);
	}
	return p;
};

/** Gọi sau khi admin lưu cấu hình để lần mở form sau tải bản mới. */
export const resetFormConfig = () => cache.clear();

export interface FormConfig {
	/** null = chưa tải xong / lỗi → mọi trường theo mặc định trong JSX */
	resolved: ResolvedForm | null;
	field: (key: string) => ResolvedField | undefined;
	/** Trường có hiển thị không (chưa tải xong = có) */
	visible: (key: string) => boolean;
	custom: ResolvedField[];
	/** Nhãn admin đặt, không thì `def` (cho form tự vẽ ô nhập, không dùng CfgField) */
	label: (key: string, def: string) => string;
	/** Bắt buộc theo cấu hình, chưa tải xong thì `def` */
	required: (key: string, def?: boolean) => boolean;
	placeholder: (key: string, def?: string) => string | undefined;
	maxLength: (key: string) => number | undefined;
	hint: (key: string) => string | undefined;
	/** Lỗi theo cấu hình — gộp vào validate của form */
	validate: (
		values: Record<string, unknown>,
		custom?: CustomValues,
		opts?: { mode?: 'create' | 'edit' },
	) => Record<string, string>;
}

/** FormConfig từ cấu hình đã ghép — dùng cho hook và cho xem trước ở trang quản trị. */
export const configFromResolved = (resolved: ResolvedForm | null): FormConfig => ({
	resolved,
	field: (key) => resolved?.fields[key],
	visible: (key) => resolved?.fields[key]?.visible ?? true,
	custom: resolved?.custom ?? [],
	label: (key, def) => {
		const f = resolved?.fields[key];
		return f?.labelSet ? f.label : def;
	},
	required: (key, def = false) => resolved?.fields[key]?.required ?? def,
	placeholder: (key, def) => resolved?.fields[key]?.placeholder ?? def,
	maxLength: (key) => resolved?.fields[key]?.rules.maxLength,
	hint: (key) => resolved?.fields[key]?.hint ?? undefined,
	validate: (values, custom, opts) => (resolved ? validateForm(resolved, values, custom, opts) : {}),
});

/**
 * const cfg = useFormConfig('topic', 'admin');
 * <CfgField cfg={cfg} name='description' label='Mô tả'>…</CfgField>
 * <CustomFields cfg={cfg} value={custom} onChange={setCustom} errors={errors} />
 */
export function useFormConfig(formKey: string, variant: string): FormConfig {
	const id = `${formKey}:${variant}`;
	const [resolved, setResolved] = useState<ResolvedForm | null>(() => cache.get(id)?.data ?? null);
	useEffect(() => {
		let alive = true;
		fetchConfig(formKey, variant).then((r) => alive && r && setResolved(r));
		return () => {
			alive = false;
		};
	}, [formKey, variant]);

	return useMemo(() => configFromResolved(resolved), [resolved]);
}
