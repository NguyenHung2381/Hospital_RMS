import { useState } from 'react';
import { CheckSvg, XSvg } from '@/assets/icons';
import { QrScanner } from '@/shared/components/QrScanner';
import UserLayout from '../../../layouts/UserLayout';
import { checkInAttendance } from '../../course/api/courseApi';
import { checkInSeminar } from '../../seminar/api/seminarApi';

type Mode = 'course' | 'seminar';

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
			<div style={{ maxWidth: 420, margin: '0 auto' }}>
				<div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
					<button
						type='button'
						onClick={() => setMode('course')}
						style={{
							flex: 1,
							padding: '10px 12px',
							borderRadius: 10,
							border: mode === 'course' ? '2px solid var(--color-primary)' : '1.5px solid var(--color-gray-200)',
							background: mode === 'course' ? 'rgba(10,155,74,0.08)' : 'var(--color-white)',
							fontWeight: 600,
							fontSize: 13,
							cursor: 'pointer',
						}}
					>
						Buổi học (khóa đào tạo)
					</button>
					<button
						type='button'
						onClick={() => setMode('seminar')}
						style={{
							flex: 1,
							padding: '10px 12px',
							borderRadius: 10,
							border: mode === 'seminar' ? '2px solid var(--color-primary)' : '1.5px solid var(--color-gray-200)',
							background: mode === 'seminar' ? 'rgba(10,155,74,0.08)' : 'var(--color-white)',
							fontWeight: 600,
							fontSize: 13,
							cursor: 'pointer',
						}}
					>
						Hội thảo / Hội nghị
					</button>
				</div>

				{result && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 8,
							padding: '10px 14px',
							borderRadius: 10,
							marginBottom: 12,
							fontSize: 13,
							fontWeight: 600,
							background: result.type === 'success' ? '#e1f5ea' : '#fcebeb',
							color: result.type === 'success' ? '#085028' : '#791f1f',
						}}
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
