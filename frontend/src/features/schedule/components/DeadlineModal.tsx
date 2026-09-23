import { useState } from 'react';
import { XSvg } from '@/assets/icons';
import { deleteDeadline, upsertDeadline } from '../../round/api/roundApi';
import {
	DEADLINE_TYPE_LABELS,
	SUPPLEMENT_FIELDS,
	SUPPLEMENT_FIELD_LABELS,
	type DeadlineType,
	type SupplementField,
} from '../../round/types/round.type';
import { toInputDate } from '../../round/utils/roundHelpers';
import type { ModalState, RoundRow } from '../types/schedule.type';
import styles from './DeadlineModal.module.css';
import { DatePicker } from '../../../shared/components/Input/DatePicker';

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
	const [suppFields, setSuppFields]  = useState<SupplementField[]>(
		deadline?.supplement_fields && deadline.supplement_fields.length
			? deadline.supplement_fields
			: [...SUPPLEMENT_FIELDS],
	);
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
				supplement_fields: dlType === 'supplement' ? suppFields : null,
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
							<DatePicker
								value={startDate}
								onChange={setStartDate}
								rangeStart={startDate}
								rangeEnd={deadlineDate}
								placeholder='Chọn ngày bắt đầu'
							/>
						</div>
						<div className={styles.field}>
							<label className={styles.fieldLabel}>Ngày hạn *</label>
							<DatePicker
								value={deadlineDate}
								onChange={setDeadlineDate}
								rangeStart={startDate}
								rangeEnd={deadlineDate}
								placeholder='Chọn ngày hạn'
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
					{dlType === 'supplement' && (
						<div className={styles.field}>
							<label className={styles.fieldLabel}>
								Chủ nhiệm / thư ký được sửa những mục
							</label>
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
								{SUPPLEMENT_FIELDS.map((f) => (
									<label
										key={f}
										style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}
									>
										<input
											type='checkbox'
											checked={suppFields.includes(f)}
											onChange={(e) =>
												setSuppFields((prev) =>
													e.target.checked
														? [...prev, f]
														: prev.filter((x) => x !== f),
												)
											}
										/>
										{SUPPLEMENT_FIELD_LABELS[f]}
									</label>
								))}
							</div>
						</div>
					)}
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
