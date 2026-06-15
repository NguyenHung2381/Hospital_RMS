import styles from '../pages/TopicDetail.module.css';
import type { MemberFormState } from '../types/topicDetail.type';

type Props = {
	form: MemberFormState;
	setForm: React.Dispatch<React.SetStateAction<MemberFormState>>;
	onSave: () => void;
	onCancel: () => void;
	saving: boolean;
	err: string;
	saveLabel?: string;
};

export default function MemberFormFields({
	form,
	setForm,
	onSave,
	onCancel,
	saving,
	err,
	saveLabel = 'Lưu',
}: Props) {
	const set =
		(k: keyof MemberFormState) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
			setForm((f) => ({ ...f, [k]: e.target.value }));

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
			<div style={{ display: 'flex', gap: 8 }}>
				<input
					className={styles.formInput}
					placeholder='Họ tên *'
					value={form.ho_ten}
					onChange={set('ho_ten')}
					style={{ flex: 2 }}
				/>
				<select
					className={styles.formInput}
					value={form.role}
					onChange={set('role')}
					style={{ flex: 1 }}
				>
					<option value='leader'>Chủ nhiệm</option>
					<option value='secretary'>Thư ký</option>
					<option value='member'>Thành viên</option>
				</select>
			</div>
			<div style={{ display: 'flex', gap: 8 }}>
				<input
					className={styles.formInput}
					placeholder='Email'
					value={form.email}
					onChange={set('email')}
					style={{ flex: 1 }}
				/>
				<input
					className={styles.formInput}
					placeholder='Điện thoại'
					value={form.so_dien_thoai}
					onChange={set('so_dien_thoai')}
					style={{ flex: 1 }}
				/>
			</div>
			<div style={{ display: 'flex', gap: 8 }}>
				<input
					className={styles.formInput}
					placeholder='Chức vụ'
					value={form.chuc_vu}
					onChange={set('chuc_vu')}
					style={{ flex: 1 }}
				/>
				<input
					className={styles.formInput}
					placeholder='Mã NV'
					value={form.staff_number}
					onChange={set('staff_number')}
					style={{ flex: 1 }}
				/>
			</div>
			{err && (
				<p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{err}</p>
			)}
			<div style={{ display: 'flex', gap: 8 }}>
				<button
					className={styles.btnPrimary}
					onClick={onSave}
					disabled={saving}
					style={{ fontSize: 13 }}
				>
					{saving ? 'Đang lưu...' : saveLabel}
				</button>
				<button
					className={styles.btnSecondary}
					onClick={onCancel}
					disabled={saving}
					style={{ fontSize: 13 }}
				>
					Huỷ
				</button>
			</div>
		</div>
	);
}
