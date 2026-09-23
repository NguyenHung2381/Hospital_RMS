import { useEffect, useRef, useState } from 'react';
import { SearchSvg } from '@/assets/icons';
import { searchUsers, type UserSuggestion } from '../../topics/api/topicApi';
import { getInitials } from '../../../shared/utils/helper';
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

	// ── Tìm nhân viên đã có trong hệ thống ──
	// Chọn một người sẽ điền sẵn các ô bên dưới; nếu người này chưa có trong DB
	// thì cứ gõ tay trực tiếp vào các ô, không cần dùng ô tìm kiếm.
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<UserSuggestion[]>([]);
	const [searching, setSearching] = useState(false);
	const [open, setOpen] = useState(false);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const blurRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (query.trim().length < 2) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setSearching(true);
			searchUsers(query)
				.then((res) => {
					setResults(res.data);
					setOpen(true);
				})
				.catch(() => setResults([]))
				.finally(() => setSearching(false));
		}, 300);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [query]);

	useEffect(
		() => () => {
			if (blurRef.current) clearTimeout(blurRef.current);
		},
		[],
	);

	const pickUser = (u: UserSuggestion) => {
		setForm((f) => ({
			...f,
			ho_ten: u.full_name,
			email: u.email ?? '',
			staff_number: u.staff_number != null ? String(u.staff_number) : '',
		}));
		setQuery('');
		setResults([]);
		setOpen(false);
	};

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
			<div style={{ position: 'relative' }}>
				<SearchSvg
					style={{
						position: 'absolute',
						left: 10,
						top: '50%',
						transform: 'translateY(-50%)',
						width: 14,
						height: 14,
						color: 'var(--color-gray-400)',
						pointerEvents: 'none',
					}}
				/>
				<input
					className={styles.formInput}
					style={{ paddingLeft: 32, width: '100%' }}
					placeholder='Tìm nhân viên có sẵn theo tên, mã NV…'
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => results.length > 0 && setOpen(true)}
					onBlur={() => {
						blurRef.current = setTimeout(() => setOpen(false), 150);
					}}
				/>
				{open && query.trim().length >= 2 && (
					<div
						style={{
							position: 'absolute',
							top: 'calc(100% + 4px)',
							left: 0,
							right: 0,
							zIndex: 20,
							border: '1px solid var(--color-gray-200)',
							borderRadius: 8,
							maxHeight: 240,
							overflowY: 'auto',
							boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
							background: 'var(--color-white)',
						}}
					>
						{searching ? (
							<div
								style={{
									padding: '10px 14px',
									fontSize: 13,
									color: 'var(--color-gray-400)',
								}}
							>
								Đang tìm…
							</div>
						) : results.length === 0 ? (
							<div
								style={{
									padding: '12px 14px',
									fontSize: 13,
									color: 'var(--color-gray-500)',
								}}
							>
								Không tìm thấy — nhập trực tiếp bên dưới cho người chưa có trong
								hệ thống.
							</div>
						) : (
							results.map((u) => (
								<div
									key={u.id}
									onMouseDown={(e) => {
										e.preventDefault();
										pickUser(u);
									}}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 10,
										padding: '8px 14px',
										cursor: 'pointer',
										borderBottom: '1px solid var(--color-gray-100)',
									}}
									onMouseEnter={(e) => {
										(e.currentTarget as HTMLDivElement).style.background =
											'#f0fbf6';
									}}
									onMouseLeave={(e) => {
										(e.currentTarget as HTMLDivElement).style.background = '';
									}}
								>
									<div
										className={styles.memberAvatar}
										style={{ width: 32, height: 32, fontSize: 11 }}
									>
										{getInitials(u.full_name)}
									</div>
									<div style={{ flex: 1, minWidth: 0 }}>
										<div
											style={{
												fontWeight: 600,
												fontSize: 13,
												color: 'var(--color-gray-800)',
											}}
										>
											{u.full_name}
										</div>
										<div
											style={{ fontSize: 11, color: 'var(--color-gray-400)' }}
										>
											{u.username} · MNV: {u.staff_number ?? '—'}
										</div>
									</div>
									<span
										style={{
											fontSize: 12,
											color: 'var(--color-primary-dark)',
											fontWeight: 600,
										}}
									>
										+ Chọn
									</span>
								</div>
							))
						)}
					</div>
				)}
			</div>

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
