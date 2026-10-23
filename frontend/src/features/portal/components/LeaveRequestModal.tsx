import { useState } from 'react';
import { Button, Modal } from '@/shared/components';
import { toIsoDate } from '@/shared/utils/formatDate';
import { createLeaveRequest, type LeavePolicy, type LeaveType, type MyAttendance } from '../api/meApi';
import styles from '../pages/SelfService.module.css';
import own from '../pages/MyAttendance.module.css';

interface Props {
	/** Lịch ca 7 ngày tới — để chọn ca khi xin phép trong 1 ngày. */
	week: MyAttendance['week'];
	/** Giới hạn ngày theo Cấu hình hệ thống (backend kiểm tra lại khi gửi). */
	policy?: LeavePolicy;
	onClose: () => void;
	onSaved: () => void;
}

const TYPES: { value: LeaveType; label: string; hint: string }[] = [
	{
		value: 'absent',
		label: 'Xin nghỉ',
		hint: 'Không thể tham gia cả ngày hoặc 1 ca',
	},
	{
		value: 'late',
		label: 'Xin đi muộn',
		hint: 'Vẫn tham gia nhưng đến muộn hơn giờ vào ca',
	},
];

// Khớp mặc định backend utils/leavePolicy.js
const DEFAULT_POLICY: LeavePolicy = { enabled: true, backdate_days: 3, ahead_days: 90, max_span_days: 31 };

const addDays = (iso: string, n: number) => {
	const d = new Date(`${iso}T00:00:00`);
	d.setDate(d.getDate() + n);
	return toIsoDate(d);
};
const minIso = (a: string, b: string) => (a < b ? a : b);

/** Học viên gửi đơn xin nghỉ / xin đi muộn khi có việc đột xuất — chờ phòng Đào tạo / khoa duyệt. */
export default function LeaveRequestModal({ week, policy = DEFAULT_POLICY, onClose, onSaved }: Props) {
	const today = toIsoDate(new Date());
	const minDate = addDays(today, -policy.backdate_days);
	const maxDate = addDays(today, policy.ahead_days);
	const [type, setType] = useState<LeaveType>('absent');
	const [fromDate, setFromDate] = useState(today);
	const [toDate, setToDate] = useState(today);
	const [shiftId, setShiftId] = useState('');
	const [arriveTime, setArriveTime] = useState('');
	const [reason, setReason] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const singleDay = type === 'late' || fromDate === toDate;
	// Ca của ngày đã chọn (chỉ biết trong 7 ngày tới); null = không có lịch ca
	const dayShifts = week.find((d) => d.date === fromDate)?.shifts ?? [];
	const pickedShift = dayShifts.find((s) => String(s.shift_id) === shiftId);
	const maxToDate = fromDate ? minIso(maxDate, addDays(fromDate, policy.max_span_days - 1)) : maxDate;

	const changeFrom = (v: string) => {
		setFromDate(v);
		setShiftId('');
		if (!toDate || toDate < v) setToDate(v);
	};

	const save = async () => {
		if (!fromDate) return setError('Chọn ngày xin phép');
		if (fromDate < minDate)
			return setError(
				policy.backdate_days
					? `Chỉ được nộp bổ sung đơn cho ngày đã qua tối đa ${policy.backdate_days} ngày`
					: 'Không được nộp đơn cho ngày đã qua',
			);
		if (type === 'absent' && toDate < fromDate) return setError('"Đến ngày" phải sau hoặc bằng "Từ ngày"');
		if ((type === 'late' ? fromDate : toDate) > maxDate) return setError(`Chỉ được xin phép trước tối đa ${policy.ahead_days} ngày`);
		if (type === 'absent' && toDate > maxToDate)
			return setError(`Một đơn xin nghỉ tối đa ${policy.max_span_days} ngày`);
		if (type === 'late' && !arriveTime) return setError('Nhập giờ dự kiến có mặt');
		if (reason.trim().length < 5) return setError('Lý do tối thiểu 5 ký tự');
		setBusy(true);
		setError('');
		try {
			await createLeaveRequest({
				type,
				from_date: fromDate,
				to_date: type === 'late' ? fromDate : toDate,
				shift_id: singleDay && shiftId ? Number(shiftId) : null,
				arrive_time: type === 'late' ? arriveTime : null,
				reason: reason.trim(),
			});
			onSaved();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Gửi đơn thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title='Đơn xin phép'
			subtitle='Gửi khi có việc đột xuất không thể tham gia hoặc phải đến muộn — đơn được duyệt sẽ ghi nhận có phép'
			size='md'
			footer={
				<>
					<Button variant='secondary' onClick={onClose} disabled={busy}>
						Huỷ
					</Button>
					<Button onClick={save} loading={busy}>
						Gửi đơn
					</Button>
				</>
			}
		>
			{error && <div className={styles.formError}>{error}</div>}
			<div className={own.typePicker} role='radiogroup' aria-label='Loại đơn'>
				{TYPES.map((t) => (
					<button
						key={t.value}
						type='button'
						role='radio'
						aria-checked={type === t.value}
						className={`${own.typeOption} ${type === t.value ? own.typeOptionActive : ''}`}
						onClick={() => setType(t.value)}
					>
						<b>{t.label}</b>
						<span>{t.hint}</span>
					</button>
				))}
			</div>
			<div className={styles.formGrid}>
				<label>
					{type === 'late' ? 'Ngày *' : 'Từ ngày *'}
					<input type='date' value={fromDate} min={minDate} max={maxDate} onChange={(e) => changeFrom(e.target.value)} />
				</label>
				{type === 'absent' ? (
					<label>
						Đến ngày *
						<input type='date' value={toDate} min={fromDate} max={maxToDate} onChange={(e) => setToDate(e.target.value)} />
					</label>
				) : (
					<label>
						Giờ dự kiến có mặt *
						<input type='time' value={arriveTime} onChange={(e) => setArriveTime(e.target.value)} />
					</label>
				)}
				{singleDay && (
					<label className={styles.formFull}>
						Ca
						<select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
							<option value=''>{type === 'late' ? 'Ca đầu tiên trong ngày / không theo ca' : 'Cả ngày'}</option>
							{dayShifts.map((s) => (
								<option key={s.shift_id} value={s.shift_id ?? ''}>
									{s.name} ({s.start_time}–{s.end_time})
								</option>
							))}
						</select>
						{pickedShift && type === 'late' && <span className={own.fieldHint}>Giờ vào ca: {pickedShift.start_time}</span>}
					</label>
				)}
				<label className={styles.formFull}>
					Lý do *
					<textarea
						className={own.reason}
						rows={4}
						maxLength={1000}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						placeholder='VD: Bị sốt cao, đã khám tại phòng khám X…'
					/>
				</label>
			</div>
			<p className={own.note}>
				{policy.backdate_days
					? `Đơn cho ngày đã qua chỉ nộp bổ sung được trong ${policy.backdate_days} ngày.`
					: 'Không nộp đơn cho ngày đã qua.'}{' '}
				Xin phép trước tối đa {policy.ahead_days} ngày, mỗi đơn xin nghỉ tối đa {policy.max_span_days} ngày. Đơn chờ duyệt có thể huỷ trong danh sách đơn.
			</p>
		</Modal>
	);
}
