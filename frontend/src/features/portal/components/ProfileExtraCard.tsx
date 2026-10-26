import { useState } from 'react';
import { UserSvg } from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import { CustomFields } from '@/shared/formConfig/CustomFields';
import { CustomFieldsView } from '@/shared/formConfig/CustomFieldsView';
import type { CustomValues } from '@/shared/formConfig/types';
import type { FormConfig } from '@/shared/formConfig/useFormConfig';
import { showToast } from '@/shared/utils/feedback';
import styles from '../pages/Profile.module.css';

/**
 * Thẻ "Thông tin bổ sung" ở trang Hồ sơ — trường tùy chỉnh admin thêm cho form
 * 'user_profile' (Cấu hình form). Không có trường nào thì không hiện thẻ.
 */
export default function ProfileExtraCard({ cfg, initial }: { cfg: FormConfig; initial: CustomValues }) {
	const [saved, setSaved] = useState(initial);
	// null = đang xem, không sửa
	const [draft, setDraft] = useState<CustomValues | null>(null);
	const [errors, setErrors] = useState<Record<string, string>>({});
	const [saving, setSaving] = useState(false);

	if (!cfg.custom.length) return null;

	const save = async () => {
		if (!draft) return;
		const errs = cfg.validate({}, draft);
		setErrors(errs);
		if (Object.keys(errs).length) return;
		setSaving(true);
		try {
			const res = await apiClient.patch<{ custom?: CustomValues }>('/users/me', { custom: draft });
			setSaved(res?.custom ?? draft);
			setDraft(null);
			showToast('success', 'Đã cập nhật thông tin bổ sung.');
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Có lỗi xảy ra.');
		} finally {
			setSaving(false);
		}
	};

	const empty = !cfg.custom.some((f) => {
		const v = saved[f.key];
		return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);
	});

	return (
		<div className={styles.detailCard}>
			<div className={styles.detailCardHeader}>
				<div
					className={styles.detailCardIcon}
					style={{ background: '#ede9fe', color: '#6d28d9' }}
				>
					<UserSvg />
				</div>
				<div style={{ flex: 1 }}>
					<div className={styles.detailCardTitle}>Thông tin bổ sung</div>
					<div className={styles.detailCardSub}>Các thông tin đơn vị yêu cầu thêm</div>
				</div>
				{draft === null && (
					<button
						type='button'
						className={styles.linkBtn}
						onClick={() => {
							setErrors({});
							setDraft(saved);
						}}
					>
						Sửa
					</button>
				)}
			</div>

			{draft === null ? (
				<div className={styles.detailGrid}>
					{empty ? (
						<div className={styles.detailItem}>
							<div className={styles.detailValue}>Chưa cập nhật</div>
						</div>
					) : (
						<CustomFieldsView
							cfg={cfg}
							data={saved}
							itemClassName={styles.detailItem}
							labelClassName={styles.detailLabel}
							valueClassName={styles.detailValue}
						/>
					)}
				</div>
			) : (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						save();
					}}
				>
					<div className={styles.detailGrid}>
						<CustomFields
							cfg={cfg}
							value={draft}
							onChange={setDraft}
							errors={errors}
							title={null}
						/>
					</div>
					<div style={{ display: 'flex', gap: 8, padding: '0 var(--space-6) var(--space-5)' }}>
						<button
							className={styles.btnPrimary}
							disabled={saving}
						>
							{saving ? 'Đang lưu...' : 'Lưu'}
						</button>
						<button
							type='button'
							className={styles.linkBtn}
							onClick={() => setDraft(null)}
							disabled={saving}
						>
							Hủy
						</button>
					</div>
				</form>
			)}
		</div>
	);
}
