import { useState } from 'react';
import { BookOpenSvg, CheckSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import { DatePicker, Modal } from '@/shared/components';
import { updateSeminarAgenda } from '../api/seminarApi';
import type { Seminar, SeminarAgendaItem } from '../types/seminar.type';
import { parseAgenda } from '../utils/agenda';
import styles from '../pages/Seminar.module.css';

const blank = (): SeminarAgendaItem => ({ title: '' });
const isBlank = (a: SeminarAgendaItem) =>
	!a.title.trim() && !a.speaker?.trim() && !a.note?.trim() && !a.start_time && !a.end_time;

// Chương trình hội nghị: danh sách bài học / bài báo cáo (thời gian, báo cáo viên).
// Hội nghị nhiều ngày thì chọn thêm ngày cho từng bài.
export function SeminarAgendaModal({
	seminar,
	onClose,
	onSaved,
}: {
	seminar: Seminar;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [items, setItems] = useState<SeminarAgendaItem[]>(() => {
		const list = parseAgenda(seminar.agenda);
		return list.length ? list : [blank()];
	});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const multiDay = !!seminar.end_date && seminar.end_date.slice(0, 10) !== seminar.start_date?.slice(0, 10);

	const patch = (i: number, p: Partial<SeminarAgendaItem>) =>
		setItems((xs) => xs.map((x, k) => (k === i ? { ...x, ...p } : x)));

	const save = async () => {
		setError('');
		const list = items.filter((x) => !isBlank(x));
		const bad = list.findIndex((x) => !x.title.trim());
		if (bad >= 0) return setError(`Bài ${bad + 1}: chưa nhập tên bài.`);
		const badTime = list.findIndex((x) => x.start_time && x.end_time && x.end_time < x.start_time);
		if (badTime >= 0) return setError(`Bài ${badTime + 1}: giờ kết thúc phải sau giờ bắt đầu.`);
		setSaving(true);
		try {
			await updateSeminarAgenda(seminar.id, list.length ? list : null);
			onSaved();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<BookOpenSvg />}
			title='Chương trình — Bài học'
			subtitle='Danh sách bài học / bài báo cáo của hội nghị, theo thứ tự trình bày'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={saving}
					>
						Huỷ
					</button>
					<button
						className={styles.btnPrimary}
						onClick={() => void save()}
						disabled={saving}
					>
						{saving ? <span className={styles.spinner} /> : <CheckSvg />}
						Lưu
					</button>
				</>
			}
		>
			{error && <div className={`${styles.noticeBox} ${styles.noticeWarn}`}>{error}</div>}

			{items.map((a, i) => (
				<div
					key={i}
					className={styles.infoCard}
					style={{ marginBottom: 12 }}
				>
					<div className={styles.formGrid}>
						<div className={`${styles.formGroup} ${styles.full}`}>
							<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
								<label className={styles.formLabel}>
									Bài {i + 1} <span className={styles.required}>*</span>
								</label>
								<button
									type='button'
									className={`${styles.actionBtn} ${styles.danger}`}
									title='Xoá bài'
									onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))}
								>
									<TrashSvg />
								</button>
							</div>
							<input
								className={styles.formInput}
								value={a.title}
								onChange={(e) => patch(i, { title: e.target.value })}
								placeholder='Tên bài học / bài báo cáo'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Báo cáo viên</label>
							<input
								className={styles.formInput}
								value={a.speaker ?? ''}
								onChange={(e) => patch(i, { speaker: e.target.value })}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Thời gian</label>
							<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
								<input
									type='time'
									className={styles.formInput}
									value={a.start_time ?? ''}
									onChange={(e) => patch(i, { start_time: e.target.value })}
									title='Giờ bắt đầu'
								/>
								<span>–</span>
								<input
									type='time'
									className={styles.formInput}
									value={a.end_time ?? ''}
									onChange={(e) => patch(i, { end_time: e.target.value })}
									title='Giờ kết thúc'
								/>
							</div>
						</div>
						{(multiDay || a.date) && (
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Ngày</label>
								<DatePicker
									value={a.date ?? ''}
									onChange={(v) => patch(i, { date: v || undefined })}
									min={seminar.start_date?.slice(0, 10) || undefined}
									max={seminar.end_date?.slice(0, 10) || undefined}
								/>
							</div>
						)}
						<div className={`${styles.formGroup} ${multiDay || a.date ? '' : styles.full}`}>
							<label className={styles.formLabel}>Ghi chú</label>
							<input
								className={styles.formInput}
								value={a.note ?? ''}
								onChange={(e) => patch(i, { note: e.target.value })}
							/>
						</div>
					</div>
				</div>
			))}
			<button
				type='button'
				className={styles.btnGhost}
				onClick={() =>
					setItems((xs) => {
						// Bài mới nối tiếp: bắt đầu lúc bài trước kết thúc, cùng ngày
						const prev = xs[xs.length - 1];
						return [...xs, { ...blank(), date: prev?.date, start_time: prev?.end_time }];
					})
				}
			>
				<PlusSvg /> Thêm bài
			</button>
		</Modal>
	);
}
