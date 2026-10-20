import { useState } from 'react';
import { CalendarSvg } from '@/assets/icons';
import { Modal, ModalActions } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import m from '@/shared/components/Modal/Modal.module.css';
import { cx } from '@/shared/utils/cx';
import { WEEKDAYS, type PatternDays, type PatternInput, type ShiftPattern, type Weekday, type WorkShift } from '../api/shiftApi';
import styles from '../pages/Shifts.module.css';

const emptyDays = (): PatternDays => ({ 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] });

export function PatternFormModal({
	pattern,
	shifts,
	onClose,
	onSave,
}: {
	/** null = thêm mới */
	pattern: ShiftPattern | null;
	shifts: WorkShift[];
	onClose: () => void;
	onSave: (data: PatternInput) => Promise<void>;
}) {
	const [name, setName] = useState(pattern?.name ?? '');
	const [isDefault, setIsDefault] = useState(pattern?.is_default ?? false);
	const [days, setDays] = useState<PatternDays>(pattern?.days ?? emptyDays());
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	// Ca ngừng dùng chỉ hiện nếu mẫu đang có (để bỏ ra)
	const used = new Set(Object.values(days).flat());
	const options = shifts.filter((s) => s.is_active || used.has(s.id));

	const toggle = (d: Weekday, id: number) =>
		setDays((x) => ({ ...x, [d]: x[d].includes(id) ? x[d].filter((i) => i !== id) : [...x[d], id] }));
	const copyMonday = () => setDays((x) => ({ ...x, 2: [...x[1]], 3: [...x[1]], 4: [...x[1]], 5: [...x[1]] }));

	const submit = async () => {
		if (!name.trim()) return setError('Vui lòng nhập tên mẫu');
		setError('');
		setSaving(true);
		try {
			await onSave({ name: name.trim(), days, is_default: isDefault });
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
			icon={<CalendarSvg />}
			title={pattern ? 'Sửa mẫu ca tuần' : 'Thêm mẫu ca tuần'}
			subtitle='Ca làm cố định theo từng thứ — bảng phân ca theo ngày sẽ ghi đè khi cần'
			size='lg'
			bodyClassName={m.stack}
			footer={<ModalActions onCancel={onClose} onConfirm={submit} loading={saving} confirmLabel={pattern ? 'Lưu thay đổi' : 'Thêm mẫu'} />}
		>
			<FormField label='Tên mẫu' required>
				<input
					className={m.formInput}
					value={name}
					maxLength={100}
					onChange={(e) => setName(e.target.value)}
					placeholder='VD: Hành chính, Ca xoay 3 ca, Chỉ theo bảng phân ca...'
				/>
			</FormField>

			<FormField
				label='Ca theo ngày trong tuần'
			>
				{options.length === 0 ? (
					<div className={m.formHint}>Chưa có ca làm nào — thêm ở tab "Ca làm" trước.</div>
				) : (
					<div>
						{WEEKDAYS.map((d) => (
							<div key={d.value} className={styles.dayRow}>
								<b>{d.long}</b>
								<div className={styles.chips}>
									{options.map((s) => (
										<button
											key={s.id}
											type='button'
											className={cx(styles.pick, days[d.value].includes(s.id) && styles.pickOn)}
											aria-pressed={days[d.value].includes(s.id)}
											onClick={() => toggle(d.value, s.id)}
											title={`${s.name} ${s.start_time}–${s.end_time}`}
										>
											{s.code} <span className={styles.mono}>{s.start_time}–{s.end_time}</span>
										</button>
									))}
									{d.value === 1 && days[1].length > 0 && (
										<button type='button' className={styles.linkBtn} onClick={copyMonday}>
											Chép sang T3–T6
										</button>
									)}
								</div>
							</div>
						))}
					</div>
				)}
			</FormField>

			<label className={styles.checkRow}>
				<input type='checkbox' checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
				<span>
					<b>Mẫu mặc định</b>
					<div className={m.formHint}>Áp dụng cho mọi người chưa được gán mẫu riêng. Chỉ có 1 mẫu mặc định.</div>
				</span>
			</label>

			{error && <div className={m.fieldError}>{error}</div>}
		</Modal>
	);
}
