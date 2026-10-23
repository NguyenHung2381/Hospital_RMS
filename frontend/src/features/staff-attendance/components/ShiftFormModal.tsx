import { useState } from 'react';
import { ClockSvg } from '@/assets/icons';
import { Badge, Modal, ModalActions, type BadgeTone } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import m from '@/shared/components/Modal/Modal.module.css';
import { cx } from '@/shared/utils/cx';
import { SHIFT_COLORS, type ShiftInput, type WorkShift } from '../api/shiftApi';
import styles from '../pages/Shifts.module.css';

const EMPTY: ShiftInput = {
	name: '',
	code: '',
	color: 'blue',
	start_time: '07:00',
	end_time: '17:00',
	checkin_before_min: 30,
	checkout_after_min: 120,
	grace_min: 5,
	is_active: true,
};

// Mẫu nhanh cho các kiểu ca hay gặp ở bệnh viện
const PRESETS: { label: string; v: Partial<ShiftInput> }[] = [
	{ label: 'Hành chính', v: { name: 'Hành chính', code: 'HC', start_time: '07:00', end_time: '17:00', color: 'blue' } },
	{ label: 'Ca sáng', v: { name: 'Ca sáng', code: 'S', start_time: '06:00', end_time: '14:00', color: 'green' } },
	{ label: 'Ca chiều', v: { name: 'Ca chiều', code: 'C', start_time: '14:00', end_time: '22:00', color: 'amber' } },
	{ label: 'Ca đêm', v: { name: 'Ca đêm', code: 'Đ', start_time: '22:00', end_time: '06:00', color: 'purple' } },
	{ label: 'Trực 24h', v: { name: 'Trực 24 giờ', code: 'T24', start_time: '07:00', end_time: '07:00', color: 'red' } },
];

export function ShiftFormModal({
	shift,
	onClose,
	onSave,
}: {
	/** null = thêm mới */
	shift: WorkShift | null;
	onClose: () => void;
	onSave: (data: ShiftInput) => Promise<void>;
}) {
	const [f, setF] = useState<ShiftInput>(shift ? { ...shift } : EMPTY);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const set = <K extends keyof ShiftInput>(k: K, v: ShiftInput[K]) => setF((x) => ({ ...x, [k]: v }));
	const num = (k: 'checkin_before_min' | 'checkout_after_min' | 'grace_min') => ({
		type: 'number',
		min: 0,
		max: k === 'grace_min' ? 240 : 720,
		className: m.formInput,
		value: Number.isNaN(f[k]) ? '' : f[k],
		onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value === '' ? NaN : Number(e.target.value)),
	});

	const submit = async () => {
		if (!f.name.trim()) return setError('Vui lòng nhập tên ca');
		if (!f.code.trim()) return setError('Vui lòng nhập ký hiệu ca');
		if (!f.start_time || !f.end_time) return setError('Vui lòng nhập giờ vào và giờ ra');
		if ([f.checkin_before_min, f.checkout_after_min, f.grace_min].some((n) => !Number.isInteger(n) || n < 0))
			return setError('Số phút phải là số nguyên không âm');
		setError('');
		setSaving(true);
		try {
			await onSave({ ...f, name: f.name.trim(), code: f.code.trim() });
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
			icon={<ClockSvg />}
			title={shift ? 'Sửa ca làm' : 'Thêm ca làm'}
			subtitle={shift ? `${shift.code} — ${shift.name}` : 'Giờ vào/ra và khoảng thời gian được điểm danh'}
			size='lg'
			bodyClassName={m.stack}
			footer={<ModalActions onCancel={onClose} onConfirm={submit} loading={saving} confirmLabel={shift ? 'Lưu thay đổi' : 'Thêm ca'} />}
		>
			{!shift && (
				<FormField label='Mẫu nhanh'>
					<div className={styles.chips}>
						{PRESETS.map((p) => (
							<button key={p.label} type='button' className={styles.pick} onClick={() => setF((x) => ({ ...x, ...p.v }))}>
								{p.label}
							</button>
						))}
					</div>
				</FormField>
			)}

			<div className={styles.formGrid}>
				<FormField label='Tên ca' required>
					<input className={m.formInput} value={f.name} maxLength={100} onChange={(e) => set('name', e.target.value)} placeholder='VD: Ca sáng' />
				</FormField>
				<FormField label='Ký hiệu' required>
					<input className={m.formInput} value={f.code} maxLength={10} onChange={(e) => set('code', e.target.value)} placeholder='VD: S' />
				</FormField>
				<FormField label='Giờ vào' required>
					<input type='time' className={m.formInput} value={f.start_time} onChange={(e) => set('start_time', e.target.value)} />
				</FormField>
				<FormField
					label='Giờ ra'
					required
				>
					<input type='time' className={m.formInput} value={f.end_time} onChange={(e) => set('end_time', e.target.value)} />
				</FormField>
				<FormField label='Được điểm danh vào sớm (phút)'>
					<input {...num('checkin_before_min')} />
				</FormField>
				<FormField label='Được điểm danh ra muộn (phút)'>
					<input {...num('checkout_after_min')} />
				</FormField>
				<FormField label='Du di đi muộn / về sớm (phút)'>
					<input {...num('grace_min')} />
				</FormField>
				<FormField label='Màu'>
					<div className={styles.colors}>
						{SHIFT_COLORS.map((c) => (
							<button
								key={c}
								type='button'
								className={cx(styles.colorBtn, f.color === c && styles.colorOn)}
								onClick={() => set('color', c)}
								aria-label={`Màu ${c}`}
								aria-pressed={f.color === c}
							>
								<Badge tone={c as BadgeTone}>{f.code || 'Ca'}</Badge>
							</button>
						))}
					</div>
				</FormField>
			</div>

			{shift && (
				<label className={styles.checkRow}>
					<input type='checkbox' checked={!f.is_active} onChange={(e) => set('is_active', !e.target.checked)} />
					<span>
						<b>Ngừng dùng</b>
						<div className={m.formHint}>Ca không còn hiệu lực trong mẫu tuần và bảng phân ca, không xếp thêm được; lịch sử điểm danh giữ nguyên.</div>
					</span>
				</label>
			)}

			{error && <div className={m.fieldError}>{error}</div>}
		</Modal>
	);
}
