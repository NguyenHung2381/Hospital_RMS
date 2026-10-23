import { useState } from 'react';
import { CheckSvg, XSvg } from '@/assets/icons';
import { QrScanner } from '@/shared/components/QrScanner';
import UserLayout from '../../../layouts/UserLayout';
import { checkInAttendance } from '../../course/api/courseApi';
import { checkInSeminar } from '../../seminar/api/seminarApi';
import styles from './AttendanceCheckIn.module.css';

type Kind = 'course' | 'seminar';

/**
 * Mã QR điểm danh là JWT do backend ký — buổi học mang session_id, hội thảo mang
 * seminar_id (courseAttendanceService / seminarParticipantService). Chỉ đọc phần
 * payload để biết gửi đến API nào; chữ ký và hạn dùng vẫn do backend kiểm tra.
 */
const kindOf = (token: string): Kind | null => {
	try {
		const part = token.trim().split('.')[1];
		if (!part) return null;
		const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
		const payload = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
		if (payload?.session_id) return 'course';
		if (payload?.seminar_id) return 'seminar';
	} catch {
		/* không phải JWT */
	}
	return null;
};

const SUCCESS: Record<Kind, string> = {
	course: 'Điểm danh buổi học thành công!',
	seminar: 'Điểm danh hội thảo / hội nghị thành công!',
};

export default function AttendanceCheckIn() {
	const [processing, setProcessing] = useState(false);
	const [result, setResult] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

	const handleScan = async (token: string) => {
		if (processing) return;
		setProcessing(true);
		setResult(null);
		try {
			const kind = kindOf(token);
			if (!kind) throw new Error('Mã QR không phải mã điểm danh buổi học hoặc hội thảo.');
			if (kind === 'course') await checkInAttendance(token);
			else await checkInSeminar(token);
			setResult({ type: 'success', msg: SUCCESS[kind] });
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
			pageSubtitle='Quét mã QR trên màn hình lớp học hoặc hội trường — hệ thống tự nhận biết buổi học hay hội thảo'
		>
			<div className={styles.page}>
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
