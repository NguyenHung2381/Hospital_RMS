import { useState } from 'react';
import { BookOpenSvg, CalendarSvg, CheckSvg, EditSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import { formatDateOr, toIsoDate } from '@/shared/utils';
import type { SimpleItem } from '../hooks/useCourseDetail';
import type { CourseProgramLink, CourseProgramLinkFormData, CourseProgramStatus } from '../types/course.type';
import { VenueSelect } from '../../venue/components/VenueSelect';
import styles from './ProgramLinksTab.module.css';

type DateForm = { start_date: string; end_date: string; location: string };

const EMPTY_NEW = { program_id: '', start_date: '', end_date: '', location: '' };

const validateRange = (f: { start_date: string; end_date: string }) =>
	f.start_date && f.end_date && f.end_date < f.start_date ? 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.' : '';

export function ProgramLinksTab({
	programs,
	programLinks,
	busy,
	onAdd,
	onUpdate,
	onRemove,
}: {
	programs: SimpleItem[];
	programLinks: CourseProgramLink[];
	busy: boolean;
	onAdd: (data: CourseProgramLinkFormData) => Promise<boolean>;
	onUpdate: (linkId: string, data: Partial<CourseProgramLinkFormData>) => Promise<boolean>;
	onRemove: (linkId: string) => void;
}) {
	const [newLink, setNewLink] = useState(EMPTY_NEW);
	const [addError, setAddError] = useState('');
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState<DateForm>({ start_date: '', end_date: '', location: '' });
	const [editError, setEditError] = useState('');

	const available = programs.filter((p) => !programLinks.some((l) => l.program_id === p.id));

	const submitNew = async () => {
		if (!newLink.program_id) return setAddError('Vui lòng chọn chương trình đào tạo.');
		const err = validateRange(newLink);
		if (err) return setAddError(err);
		setAddError('');
		const ok = await onAdd({
			...newLink,
			lecturer_id: '',
			external_lecturer_name: '',
			status: 'active',
		});
		if (ok) setNewLink(EMPTY_NEW);
	};

	const startEdit = (link: CourseProgramLink) => {
		setEditingId(link.id);
		setEditError('');
		setEditForm({
			start_date: toIsoDate(link.start_date),
			end_date: toIsoDate(link.end_date),
			location: link.location ?? '',
		});
	};

	const saveEdit = async (linkId: string) => {
		const err = validateRange(editForm);
		if (err) return setEditError(err);
		const ok = await onUpdate(linkId, {
			start_date: editForm.start_date,
			end_date: editForm.end_date,
			location: editForm.location.trim(),
		});
		if (ok) setEditingId(null);
	};

	return (
		<>
			<div className={styles.addCard}>
				<div className={styles.addGrid}>
					<label className={`${styles.field} ${styles.fieldWide}`}>
						<span className={styles.label}>Chương trình đào tạo</span>
						<select
							className={styles.input}
							value={newLink.program_id}
							onChange={(e) => {
								setNewLink((f) => ({ ...f, program_id: e.target.value }));
								setAddError('');
							}}
						>
							<option value=''>
								{available.length ? '-- Chọn chương trình --' : 'Đã gán hết chương trình'}
							</option>
							{available.map((p) => (
								<option key={p.id} value={p.id}>
									{p.name}
								</option>
							))}
						</select>
					</label>
					<label className={styles.field}>
						<span className={styles.label}>Từ ngày</span>
						<input
							type='date'
							className={styles.input}
							value={newLink.start_date}
							onChange={(e) => setNewLink((f) => ({ ...f, start_date: e.target.value }))}
						/>
					</label>
					<label className={styles.field}>
						<span className={styles.label}>Đến ngày</span>
						<input
							type='date'
							className={styles.input}
							min={newLink.start_date || undefined}
							value={newLink.end_date}
							onChange={(e) => setNewLink((f) => ({ ...f, end_date: e.target.value }))}
						/>
					</label>
					<label className={`${styles.field} ${styles.addLocation}`}>
						<span className={styles.label}>Địa điểm</span>
						<VenueSelect
							scope='training'
							className={styles.input}
							value={newLink.location}
							onChange={(location) => setNewLink((f) => ({ ...f, location }))}
						/>
					</label>
					<button
						type='button'
						className={`${styles.primaryBtn} ${styles.addBtn}`}
						disabled={busy}
						onClick={submitNew}
					>
						<PlusSvg /> Gán chương trình
					</button>
				</div>
				{addError && <div className={styles.formError}>{addError}</div>}
			</div>

			{programLinks.length === 0 ? (
				<div className={styles.empty}>Khóa học chưa áp dụng chương trình đào tạo nào.</div>
			) : (
				<div className={styles.list}>
					{programLinks.map((link) => {
						const editing = editingId === link.id;
						const hasDates = link.start_date || link.end_date;
						return (
							<div key={link.id} className={`${styles.row} ${editing ? styles.rowEditing : ''}`}>
								<div className={styles.rowTop}>
									<div className={styles.rowIcon}>
										<BookOpenSvg />
									</div>
									<div className={styles.rowMain}>
										<div className={styles.rowTitle}>{link.program_name}</div>
										{!editing && (
											<div className={styles.rowMeta}>
												<span className={hasDates ? styles.metaItem : styles.metaMissing}>
													<CalendarSvg />
													{hasDates
														? `${formatDateOr(link.start_date, '?')} → ${formatDateOr(link.end_date, '?')}`
														: 'Chưa đặt thời gian'}
												</span>
												{link.location && <span className={styles.metaItem}>· {link.location}</span>}
												{link.lecturer_name && <span className={styles.metaItem}>· GV: {link.lecturer_name}</span>}
											</div>
										)}
									</div>
									<button
										type='button'
										role='switch'
										aria-checked={link.status === 'active'}
										className={`${styles.statusToggle} ${link.status === 'active' ? styles.statusOn : ''}`}
										title={link.status === 'active' ? 'Bấm để ngừng áp dụng' : 'Bấm để áp dụng lại'}
										disabled={busy}
										onClick={() =>
											onUpdate(link.id, {
												status: (link.status === 'active' ? 'inactive' : 'active') as CourseProgramStatus,
											})
										}
									>
										<span className={styles.switchTrack}>
											<span className={styles.switchThumb} />
										</span>
										{link.status === 'active' ? 'Đang áp dụng' : 'Ngừng áp dụng'}
									</button>
									{!editing && (
										<button
											type='button'
											className={styles.iconBtn}
											title='Sửa thời gian & địa điểm'
											disabled={busy}
											onClick={() => startEdit(link)}
										>
											<EditSvg />
										</button>
									)}
									<button
										type='button'
										className={styles.iconBtn}
										title='Gỡ chương trình'
										disabled={busy}
										onClick={() => onRemove(link.id)}
									>
										<TrashSvg />
									</button>
								</div>

								{editing && (
									<div className={styles.editBox}>
										<label className={styles.field}>
											<span className={styles.label}>Từ ngày</span>
											<input
												type='date'
												className={styles.input}
												value={editForm.start_date}
												onChange={(e) => {
													setEditForm((f) => ({ ...f, start_date: e.target.value }));
													setEditError('');
												}}
											/>
										</label>
										<label className={styles.field}>
											<span className={styles.label}>Đến ngày</span>
											<input
												type='date'
												className={styles.input}
												min={editForm.start_date || undefined}
												value={editForm.end_date}
												onChange={(e) => {
													setEditForm((f) => ({ ...f, end_date: e.target.value }));
													setEditError('');
												}}
											/>
										</label>
										<label className={`${styles.field} ${styles.fieldWide}`}>
											<span className={styles.label}>Địa điểm</span>
											<VenueSelect
												scope='training'
												className={styles.input}
												value={editForm.location}
												onChange={(location) => setEditForm((f) => ({ ...f, location }))}
											/>
										</label>
										<div className={styles.editActions}>
											<button
												type='button'
												className={styles.ghostBtn}
												onClick={() => setEditingId(null)}
											>
												<XSvg /> Huỷ
											</button>
											<button
												type='button'
												className={styles.primaryBtn}
												disabled={busy}
												onClick={() => saveEdit(link.id)}
											>
												<CheckSvg /> Lưu
											</button>
										</div>
										{editError && <div className={`${styles.formError} ${styles.fullRow}`}>{editError}</div>}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</>
	);
}
