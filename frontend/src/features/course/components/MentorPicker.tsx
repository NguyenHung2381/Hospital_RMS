import { useEffect, useRef, useState } from 'react';
import { searchMentors } from '../api/courseApi';
import type { EnrollmentRotation, MentorOption } from '../types/course.type';
import { formatDateVi } from '../utils/rotationDates';
import styles from '../pages/Courses.module.css';

// Chọn người hướng dẫn (NHD): gõ tên / MNV / số CCHN → danh sách nhân sự có CCHN
// (ưu tiên khoa của vòng). Hiển thị BẢN CHỤP đã lưu ở vòng (không phải hồ sơ hiện tại).
export function MentorPicker({
	rotation,
	disabled,
	onSelect,
	onRefresh,
	onSalutation,
}: {
	rotation: EnrollmentRotation;
	disabled?: boolean;
	onSelect: (userId: string | null) => void;
	onRefresh: () => void;
	onSalutation: (v: string) => void;
}) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const [options, setOptions] = useState<MentorOption[]>([]);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

	useEffect(() => {
		if (!open) return;
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			searchMentors(query.trim(), query.trim() ? undefined : (rotation.department_id ?? undefined))
				.then(setOptions)
				.catch(() => setOptions([]));
		}, 250);
		return () => clearTimeout(timer.current);
	}, [query, open, rotation.department_id]);

	const r = rotation;
	return (
		<div style={{ position: 'relative' }}>
			{r.mentor_user_id ? (
				<div className={styles.subRowMeta}>
					<div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
						<select
							className={styles.subSelect}
							style={{ width: 70, flex: '0 0 auto', padding: '2px 4px' }}
							value={r.mentor_salutation ?? ''}
							disabled={disabled}
							onChange={(e) => onSalutation(e.target.value)}
							title='Cách xưng hô in trên giấy tờ'
						>
							<option value=''>—</option>
							<option value='ông'>ông</option>
							<option value='bà'>bà</option>
						</select>
						<b>{r.mentor_name}</b>
						{r.mentor_staff_no && <span>MNV {r.mentor_staff_no}</span>}
						<button
							type='button'
							className={styles.btnSmall}
							disabled={disabled}
							onClick={onRefresh}
							title='Chụp lại thông tin hiện tại của người hướng dẫn (sau khi CCHN được cập nhật)'
						>
							Làm mới
						</button>
						<button
							type='button'
							className={styles.btnSmall}
							disabled={disabled}
							onClick={() => onSelect(null)}
						>
							Bỏ chọn
						</button>
					</div>
					<div>
						{r.mentor_qualification ?? '—'} · CCHN {r.mentor_license_no ?? 'chưa có'}
						{r.mentor_license_date ? ` (${formatDateVi(r.mentor_license_date)})` : ''}
						{r.mentor_dob ? ` · Sinh ${formatDateVi(r.mentor_dob)}` : ''}
					</div>
					{r.mentor_scope && <div title={r.mentor_scope}>Phạm vi: {r.mentor_scope}</div>}
				</div>
			) : (
				<>
					<input
						className={styles.formInput}
						placeholder='Người hướng dẫn: gõ tên, MNV hoặc số CCHN…'
						value={query}
						disabled={disabled}
						onChange={(e) => {
							setQuery(e.target.value);
							setOpen(true);
						}}
						onFocus={() => setOpen(true)}
						onBlur={() => setTimeout(() => setOpen(false), 150)}
					/>
					{open && (
						<div
							style={{
								position: 'absolute',
								zIndex: 20,
								left: 0,
								right: 0,
								top: '100%',
								maxHeight: 240,
								overflow: 'auto',
								background: 'var(--color-white)',
								border: '1px solid var(--color-gray-200)',
								borderRadius: 'var(--radius-lg)',
								boxShadow: '0 8px 24px rgba(0,0,0,.12)',
							}}
						>
							{options.length === 0 ? (
								<div
									className={styles.subRowMeta}
									style={{ padding: 8 }}
								>
									{query.trim() ? 'Không tìm thấy nhân sự phù hợp' : 'Gõ để tìm (đang gợi ý nhân sự của khoa)'}
								</div>
							) : (
								options.map((o) => (
									<div
										key={o.user_id}
										style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--color-gray-100)' }}
										onMouseDown={() => {
											onSelect(o.user_id);
											setQuery('');
											setOpen(false);
										}}
									>
										<div className={styles.subRowName}>
											{o.full_name}
											{o.staff_number != null ? ` · MNV ${o.staff_number}` : ''}
										</div>
										<div className={styles.subRowMeta}>
											{o.department_name ?? '—'} · {o.license_no ? `CCHN ${o.license_no}` : 'chưa có CCHN'}
										</div>
									</div>
								))
							)}
						</div>
					)}
				</>
			)}
		</div>
	);
}
