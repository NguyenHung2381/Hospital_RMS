import { Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { PasswordInput } from '@/shared/components/Input/PasswordInput';
import { Toggle } from '@/shared/components/Input/Toggle';
import base from '@/shared/components/Table/CrudPage.module.css';
import { useState } from 'react';
import type { SigningAccount, SigningAccountForm } from '../types/signing.type';
import type { UserOption } from '../api/signRequestApi';
import { UserSearch } from './UserSearch';
import styles from '../pages/SigningAdmin.module.css';

/**
 * Thêm / sửa tài khoản ký số: chứng thư bệnh viện, hoặc quản trị cấp sẵn chứng thư cho 1 cán bộ
 * (cán bộ nhận thông báo, tự quản lý tiếp ở Hồ sơ cá nhân). Sửa: API key / secret để trống = giữ nguyên.
 */
export function AccountFormModal({
	account,
	loading,
	onClose,
	onSave,
}: {
	account: SigningAccount | null;
	loading: boolean;
	onClose: () => void;
	onSave: (d: SigningAccountForm) => void;
}) {
	const [kind, setKind] = useState<'organization' | 'personal'>(account?.kind ?? 'organization');
	const [owner, setOwner] = useState<UserOption | null>(null);
	const isOrg = kind === 'organization';
	const initial: SigningAccountForm = {
		label: account?.label ?? '',
		region: account?.region ?? 'hn10',
		api_key: '',
		secret: '',
		use_for_certificates: account?.use_for_certificates ?? false,
	};
	const [form, setForm] = useState<SigningAccountForm>(initial);
	const dirty = JSON.stringify(form) !== JSON.stringify(initial);
	const set = <K extends keyof SigningAccountForm>(k: K, v: SigningAccountForm[K]) =>
		setForm((f) => ({ ...f, [k]: v }));
	const missing =
		!account && (!form.label.trim() || !form.api_key.trim() || !form.secret.trim() || (!isOrg && !owner));

	return (
		<Modal
			open
			dirty={dirty}
			onClose={onClose}
			title={account ? 'Sửa tài khoản ký số' : 'Thêm tài khoản ký số'}
			subtitle={
				account
					? account.kind === 'personal'
						? `Chứng thư cá nhân của ${account.user_name ?? account.user_id}`
						: account.cert_subject ?? undefined
					: 'Tài khoản dịch vụ ký số VIN-HSM — mỗi tài khoản gắn với 1 chứng thư'
			}
			className={base.modal}
			bodyClassName={base.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() =>
						onSave(
							account
								? form
								: { ...form, kind, user_id: isOrg ? null : (owner?.id ?? null), use_for_certificates: isOrg && form.use_for_certificates },
						)
					}
					loading={loading}
					disabled={missing}
					confirmLabel={account ? 'Lưu thay đổi' : 'Thêm và kiểm tra kết nối'}
				/>
			}
		>
			{!account && (
				<div
					className={styles.kindPick}
					role='radiogroup'
					aria-label='Loại chứng thư'
				>
					{(
						[
							['organization', 'Chứng thư bệnh viện', 'Con dấu / chứng thư tổ chức, dùng ký giấy chứng nhận'],
							['personal', 'Cấp cho cán bộ', 'Chứng thư cá nhân bệnh viện mua cho cán bộ — cán bộ được báo'],
						] as const
					).map(([k, t, dsc]) => (
						<button
							key={k}
							type='button'
							role='radio'
							aria-checked={kind === k}
							className={kind === k ? `${styles.kindOpt} ${styles.kindOn}` : styles.kindOpt}
							onClick={() => setKind(k)}
						>
							<span className={styles.kindTitle}>{t}</span>
							<span className={styles.kindDesc}>{dsc}</span>
						</button>
					))}
				</div>
			)}
			{!account && !isOrg && (
				<FormField
					label='Cán bộ sở hữu chứng thư'
					required
				>
					{owner ? (
						<div className={styles.owner}>
							<span>{owner.full_name}</span>
							<button
								type='button'
								className={styles.textAction}
								onClick={() => setOwner(null)}
							>
								Đổi
							</button>
						</div>
					) : (
						<UserSearch
							exclude={new Set()}
							onPick={(u) => {
								setOwner(u);
								if (!form.label.trim()) set('label', `Chứng thư cá nhân — ${u.full_name}`);
							}}
							placeholder='Gõ tên hoặc mã nhân viên'
						/>
					)}
				</FormField>
			)}
			<FormField
				label='Tên hiển thị'
				required
			>
				<input
					className={base.formInput}
					value={form.label}
					onChange={(e) => set('label', e.target.value)}
					placeholder='VD: Chứng thư Bệnh viện HNĐK Nghệ An'
					maxLength={200}
					autoFocus
				/>
			</FormField>
			<FormField
				label='Vùng máy chủ'
				hint='Phần sau "sign-" trong địa chỉ nhà cung cấp gửi, vd sign-hn10.vin-hsm.com → hn10'
			>
				<input
					className={`${base.formInput} ${styles.mono}`}
					value={form.region}
					onChange={(e) => set('region', e.target.value)}
					placeholder='hn10'
					maxLength={20}
				/>
			</FormField>
			<FormField
				label='API key'
				required={!account}
			>
				<input
					className={`${base.formInput} ${styles.mono}`}
					value={form.api_key}
					onChange={(e) => set('api_key', e.target.value)}
					placeholder={account ? `Để trống = giữ ${account.api_key}` : 'Chuỗi do VIN-HSM cấp'}
					autoComplete='off'
					spellCheck={false}
					maxLength={200}
				/>
			</FormField>
			<FormField
				label='Secret'
				required={!account}
				hint='Mã hóa trên máy chủ, không hiện lại sau khi lưu'
			>
				<PasswordInput
					className={base.formInput}
					value={form.secret}
					onChange={(v: string) => set('secret', v)}
					placeholder={account ? 'Để trống = giữ secret cũ' : 'Secret do VIN-HSM cấp'}
					autoComplete='new-password'
				/>
			</FormField>
			{isOrg && (
				<div className={styles.toggleRow}>
					<div>
						<div className={styles.toggleTitle}>Dùng ký giấy chứng nhận CME</div>
						<div className={styles.toggleDesc}>
							Giấy chứng nhận xuất có chọn "Ký số" sẽ ký bằng chứng thư này. Chỉ 1 tài khoản được chọn —
							bật ở đây sẽ bỏ chọn tài khoản khác.
						</div>
					</div>
					<Toggle
						on={form.use_for_certificates}
						onChange={() => set('use_for_certificates', !form.use_for_certificates)}
						label='Dùng ký giấy chứng nhận CME'
					/>
				</div>
			)}
		</Modal>
	);
}
