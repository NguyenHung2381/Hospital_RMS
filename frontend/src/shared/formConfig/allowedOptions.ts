import type { FormConfig } from './useFormConfig';

/** Lựa chọn còn được phép sau khi admin thu hẹp danh sách (select có sẵn trong code). */
export const allowedOptions = <T extends { value: string }>(cfg: FormConfig, key: string, options: readonly T[]) => {
	const allowed = cfg.field(key)?.options;
	return allowed ? options.filter((o) => allowed.some((a) => a.value === o.value)) : [...options];
};
