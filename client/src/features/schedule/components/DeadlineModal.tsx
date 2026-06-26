import { useState } from 'react';
import { XSvg } from '@/assets/icons';
import { deleteDeadline, upsertDeadline } from '../../round/api/roundApi';
import {
	DEADLINE_TYPE_LABELS,
	type DeadlineType,
} from '../../round/types/round.type';
import { toInputDate } from '../../round/utils/roundHelpers';
import type { ModalState, RoundRow } from '../types/schedule.type';
import styles from './DeadlineModal.module.css';

interface Props {
	state: ModalState;
	onClose: () => void;
	onSaved: (updated: RoundRow) => void;
}

export function DeadlineModal({ state, onClose, onSaved }: Props) {
	const { round, deadline } = state;
	const isEdit = Boolean(deadline);

	const [name, setName]               = useState(deadline?.name ?? '');
	const [deadlineDate, setDeadlineDate] = useState(toInputDate(deadline?.deadline_date ?? ''));
	const [startDate, setStartDate]     = useState(toInputDate(deadline?.start_date ?? ''));
	const [dlType, setDlType]           = useState<DeadlineType | ''>(deadline?.deadline_type ?? '');
	const [saving, setSaving]           = useState(false);
	const [deleting, setDeleting]       = useState(false);
	const [err, setErr]                 = useState('');

	const save = async () => {
		if (!name.trim()) { setErr('Vui lòng nhập tên mốc thời gian'); return; }
		if (!deadlineDate) { setErr('Vui lòng chọn ngày hạn'); return; }
		setSaving(true);
		setErr('');
		try {
			const phase =
				deadline?.phase ?? Math.max(0, ...round.deadlines.map((d) => d.phase)) + 1;
			const saved = await upsertDeadline(round.id, phase, {
				name:          name.trim(),
				deadline_date: deadlineDate,
				start_date:    startDate || null,
				deadline_type: dlType || null,
			});
			onSaved({
				...round,
				deadlines: isEdit
					? round.deadlines.map((d) => (d.phase === phase ? saved : d))
					: [...round.deadlines, saved],
			});
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Lỗi không xác định');
			setSaving(false);
		}
	};

	const del = async () => {
		if (!deadline) return;
		setDeleting(true);
		setErr('');
		try {
			await deleteDeadline(round.id, deadline.phase);
			onSaved({
				...round,
				deadlines: round.deadlines.filter((d) => d.phase !== deadline.phase),
			});
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Lỗi không xác định');
			setDeleting(false);
		}
	};

	return (
		<div className={styles.overlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<div className={styles.modalHead}>
					<h3 className={styles.modalTitle}>
						{isEdit ? 'Chỉnh sửa mốc thời gian' : 'Thêm mốc thời gian'}
					</h3>
					<button className={styles.closeBtn} onClick={onClose} aria-label='Đóng'>
						<XSvg style={{ width: 16, height: 16 }} />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.field}>
						<label className={styles.fieldLabel}>Đợt nghiên cứu</label>
						<span className={styles.fieldStatic}>{round.id} — {round.name}</span>
					</div>
					<div className={styles.field}>
						<label className={styles.fieldLabel}>Tên mốc *</label>
						<input
							className={styles.input}
							type='text'
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder='VD: Hạn nộp báo cáo đề cương'
							autoFocus
						/>
					</div>
					<div className={styles.fieldRow}>
						<div className={styles.field}>
							<label className={styles.fieldLabel}>Ngày bắt đầu</label>
							<input
								className={styles.input}
								type='date'
								value={startDate}
								onChange={(e) => setStartDate(e.target.value)}
							/>
						</div>
						<div className={styles.field}>
							<label className={styles.fieldLabel}>Ngày hạn *</label>
							<input
								className={styles.input}
								type='date'
								value={deadlineDate}
								onChange={(e) => setDeadlineDate(e.target.value)}
							/>
						</div>
					</div>
					<div className={styles.field}>
						<label className={styles.fieldLabel}>Loại mốc</label>
						<select
							className={styles.input}
							value={dlType}
							onChange={(e) => setDlType(e.target.value as DeadlineType | '')}
						>
							<option value=''>— Không phân loại —</option>
							{Object.entries(DEADLINE_TYPE_LABELS).map(([k, v]) => (
								<option key={k} value={k}>{v}</option>
							))}
						</select>
					</div>
					{err && <p className={styles.formErr}>{err}</p>}
				</div>

				<div className={styles.modalFoot}>
					{isEdit && (
						<button className={styles.btnDanger} onClick={del} disabled={deleting || saving}>
							{deleting ? 'Đang xóa...' : 'Xóa mốc'}
						</button>
					)}
					<div className={styles.modalFootRight}>
						<button className={styles.btnSecondary} onClick={onClose}>Hủy</button>
						<button className={styles.btnPrimary} onClick={save} disabled={saving}>
							{saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm mốc'}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
