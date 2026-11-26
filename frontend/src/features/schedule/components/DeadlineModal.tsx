import { notify } from '../../../shared/utils/feedback';
import { useId, useState } from 'react';
import { Modal } from '@/shared/components';
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

	const uid = useId();
	// Ảnh chụp ban đầu để biết còn thay đổi chưa lưu khi đóng (Esc, bấm nền, nút X).
	const [initial] = useState(() =>
		JSON.stringify([name, deadlineDate, startDate, dlType, suppFields]),
	);
	const dirty = JSON.stringify([name, deadlineDate, startDate, dlType, suppFields]) !== initial;

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
			notify.success(isEdit ? 'Đã cập nhật mốc thời gian' : 'Đã thêm mốc thời gian');
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
			notify.success('Đã xóa mốc thời gian');
		} catch (e: unknown) {
			setErr(e instanceof Error ? e.message : 'Lỗi không xác định');
			setDeleting(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={isEdit ? 'Chỉnh sửa mốc thời gian' : 'Thêm mốc thời gian'}
			dirty={dirty}
			bodyClassName={styles.modalBody}
			footer={
				<div className={styles.footRow}>
					{isEdit && (
						<button type='button' className={styles.btnDanger} onClick={del} disabled={deleting || saving}>
							{deleting ? 'Đang xóa...' : 'Xóa mốc'}
						</button>
					)}
					<div className={styles.modalFootRight}>
						<button type='button' className={styles.btnSecondary} onClick={onClose}>Hủy</button>
						<button type='button' className={styles.btnPrimary} onClick={save} disabled={saving}>
							{saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm mốc'}
						</button>
					</div>
				</div>
			}
		>
			<div className={styles.field}>
				<span className={styles.fieldLabel}>Đợt nghiên cứu</span>
				<span className={styles.fieldStatic}>{round.id} — {round.name}</span>
			</div>
			<div className={styles.field}>
				<label htmlFor={`${uid}-f1`} className={styles.fieldLabel}>Tên mốc *</label>
				<input
					id={`${uid}-f1`}
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
					<label htmlFor={`${uid}-f2`} className={styles.fieldLabel}>Ngày bắt đầu</label>
					<DatePicker
						id={`${uid}-f2`}
						value={startDate}
						onChange={setStartDate}
						rangeStart={startDate}
						rangeEnd={deadlineDate}
						placeholder='Chọn ngày bắt đầu'
					/>
				</div>
				<div className={styles.field}>
					<label htmlFor={`${uid}-f3`} className={styles.fieldLabel}>Ngày hạn *</label>
					<DatePicker
						id={`${uid}-f3`}
						value={deadlineDate}
						onChange={setDeadlineDate}
						rangeStart={startDate}
						rangeEnd={deadlineDate}
						placeholder='Chọn ngày hạn'
					/>
				</div>
			</div>
			<div className={styles.field}>
				<label htmlFor={`${uid}-f4`} className={styles.fieldLabel}>Loại mốc</label>
				<select
					id={`${uid}-f4`}
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
			{err && <p className={styles.formErr} role='alert'>{err}</p>}
		</Modal>
	);
}
