import { useState } from 'react';
import { CheckSvg, XSvg } from '@/assets/icons';
import { QrScanner } from '@/shared/components/QrScanner';
import UserLayout from '../../../layouts/UserLayout';
import { checkInAttendance } from '../../course/api/courseApi';
import { checkInSeminar } from '../../seminar/api/seminarApi';
import styles from './AttendanceCheckIn.module.css';

type Mode = 'course' | 'seminar';

/** `short` dùng trên điện thoại hẹp để nhãn tab không bị xuống dòng. */
const MODES: { key: Mode; label: string; short: string }[] = [
	{ key: 'course', label: 'Buổi học (khóa đào tạo)', short: 'Buổi học' },
	{ key: 'seminar', label: 'Hội thảo / Hội nghị', short: 'Hội thảo' },
];

export default function AttendanceCheckIn() {
	const [mode, setMode] = useState<Mode>('course');
	const [processing, setProcessing] = useState(false);
	const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

	const handleScan = async (token: string) => {
		if (processing) return;
		setProcessing(true);
		setResult(null);
		try {
			if (mode === 'course') await checkInAttendance(token);
			else await checkInSeminar(token);
			setResult({ type: 'success', msg: 'Điểm danh thành công!' });
		} catch (err) {
			setResult({ type: 'error', msg: err instanceof Error ? err.message : 'Điểm danh thất bại' });
		} finally {
			setProcessing(false);
			setTimeout(() => setResult(null), 4000);
		}
	};

	return (
		<UserLayout
			pageTitle='Điểm danh QR'
			pageSubtitle='Quét mã QR hiển thị trên màn hình lớp học / hội trường để điểm danh'
		>
			<div className={styles.page}>
				<div
					className={styles.modes}
					role='tablist'
					aria-label='Loại điểm danh'
				>
					{MODES.map((m) => (
						<button
							key={m.key}
							type='button'
							role='tab'
							aria-selected={mode === m.key}
							className={`${styles.mode} ${mode === m.key ? styles.modeActive : ''}`}
							onClick={() => setMode(m.key)}
						>
							<span className={styles.modeFull}>{m.label}</span>
							<span className={styles.modeShort}>{m.short}</span>
						</button>
					))}
				</div>

				{result && (
					<div
						className={`${styles.result} ${result.type === 'success' ? styles.resultSuccess : styles.resultError}`}
						role='status'
					>
						{result.type === 'success' ? <CheckSvg /> : <XSvg />}
						{result.msg}
					</div>
				)}

				<QrScanner
					onScan={handleScan}
					paused={processing}
				/>
			</div>
		</UserLayout>
	);
}
