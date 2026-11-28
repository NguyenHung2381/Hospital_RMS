import { Toggle } from '@/shared/components/Input/Toggle';
import { resetMenuConfig } from '@/shared/hooks/useMenuConfig';
import { showToast } from '@/shared/utils/feedback';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
import styles from '../pages/SigningAdmin.module.css';
import { signingApi } from '../api/signingApi';
import { SIGNING_STATUS_KEY } from '../hooks/useSigningStatus';
import type { SigningConfig } from '../types/signing.type';

type Patch = Partial<Pick<SigningConfig, 'enabled' | 'self_manage' | 'features' | 'providers'>>;

function Row({
	title,
	desc,
	on,
	disabled,
	onToggle,
}: {
	title: string;
	desc: string;
	on: boolean;
	disabled?: boolean;
	onToggle: () => void;
}) {
	const id = useId();
	return (
		<div className={`${styles.cfgRow} ${disabled ? styles.cfgRowMuted : ''}`}>
			<div>
				<div
					id={`${id}-t`}
					className={styles.toggleTitle}
				>
					{title}
				</div>
				<div
					id={`${id}-d`}
					className={styles.toggleDesc}
				>
					{desc}
				</div>
			</div>
			<Toggle
				on={on}
				disabled={disabled}
				onChange={onToggle}
				aria-labelledby={`${id}-t`}
				aria-describedby={`${id}-d`}
			/>
		</div>
	);
}

/**
 * Quản trị → Ký số → Cấu hình: bật/tắt ký số tổng, theo nơi dùng, theo nhà cung cấp, và quyền
 * tự khai báo chứng thư của cán bộ. Gạt là lưu ngay.
 */
export function ConfigPanel() {
	const qc = useQueryClient();
	const [cfg, setCfg] = useState<SigningConfig | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		signingApi
			.getConfig()
			.then(setCfg)
			.catch((e) => showToast('error', e instanceof Error ? e.message : 'Không tải được cấu hình ký số'));
	}, []);

	const save = async (patch: Patch) => {
		if (!cfg) return;
		const prev = cfg;
		const next = { ...cfg, ...patch };
		setCfg(next);
		setSaving(true);
		try {
			const saved = await signingApi.saveConfig({
				enabled: next.enabled,
				self_manage: next.self_manage,
				features: next.features,
				providers: next.providers,
			});
			setCfg(saved);
			resetMenuConfig();
			void qc.invalidateQueries({ queryKey: SIGNING_STATUS_KEY });
			showToast('success', 'Đã lưu cấu hình ký số');
		} catch (e) {
			setCfg(prev);
			showToast('error', e instanceof Error ? e.message : 'Không lưu được cấu hình ký số');
		} finally {
			setSaving(false);
		}
	};

	if (!cfg) return <div className={styles.cfgLoading}>Đang tải cấu hình…</div>;

	return (
		<div className={styles.cfg}>
			<section className={styles.cfgSection}>
				<h3 className={styles.cfgTitle}>Chung</h3>
				<Row
					title='Bật ký số trên hệ thống'
					desc='Tắt thì không có văn bản nào được ký số, mọi công tắc "Ký số" và mục menu Trình ký văn bản, Ký tài liệu đều ẩn. Tài khoản ký và nhật ký vẫn giữ nguyên.'
					on={cfg.enabled}
					disabled={saving}
					onToggle={() => void save({ enabled: !cfg.enabled })}
				/>
				<Row
					title='Cán bộ tự khai báo chứng thư'
					desc='Cán bộ tự thêm, đổi, xóa chứng thư cá nhân ở Hồ sơ cá nhân. Tắt thì chỉ quản trị ký số cấp ở tab Tài khoản ký; cán bộ vẫn đổi được ảnh chữ ký tay.'
					on={cfg.self_manage}
					disabled={saving}
					onToggle={() => void save({ self_manage: !cfg.self_manage })}
				/>
			</section>

			<section className={styles.cfgSection}>
				<h3 className={styles.cfgTitle}>Nơi dùng ký số</h3>
				{cfg.feature_list.map((f) => (
					<Row
						key={f.key}
						title={f.label}
						desc={f.description}
						on={cfg.enabled && cfg.features[f.key] !== false}
						disabled={saving || !cfg.enabled}
						onToggle={() =>
							void save({ features: { ...cfg.features, [f.key]: cfg.features[f.key] === false } })
						}
					/>
				))}
			</section>

			<section className={styles.cfgSection}>
				<h3 className={styles.cfgTitle}>Nhà cung cấp</h3>
				{cfg.provider_list.map((p) => (
					<Row
						key={p.key}
						title={p.label}
						desc={`${p.description}. Tắt thì các tài khoản ký của nhà cung cấp này tạm không ký được (kể cả ký thử).`}
						on={cfg.providers[p.key] !== false}
						disabled={saving}
						onToggle={() =>
							void save({ providers: { ...cfg.providers, [p.key]: cfg.providers[p.key] === false } })
						}
					/>
				))}
			</section>
		</div>
	);
}
