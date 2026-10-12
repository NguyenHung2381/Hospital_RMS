import { Modal, ModalActions } from '@/shared/components';
import { formatDateVN } from '../../../shared/utils/formatDate';
import { notify } from '../../../shared/utils/feedback';
import { useEffect, useState } from 'react';
import { ClipboardCheckSvg } from '@/assets/icons';
import { getAttendance, saveAttendance } from '../api/courseApi';
import type { AttendanceRow, AttendanceStatus, ClassSession } from '../types/course.type';
import { AttendanceQrDisplay } from './AttendanceQrDisplay';
import styles from '../pages/Courses.module.css';

const ATT_OPTIONS: { value: AttendanceStatus; label: string; cls: string }[] = [
	{ value: 'present', label: 'Có mặt', cls: 'attRadioActivePresent' },
	{ value: 'late', label: 'Muộn', cls: 'attRadioActiveLate' },
	{ value: 'absent', label: 'Vắng', cls: 'attRadioActiveAbsent' },
];

export function AttendanceModal({ session, onClose }: { session: ClassSession; onClose: () => void }) {
	const [rows, setRows] = useState<AttendanceRow[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [showQr, setShowQr] = useState(false);

	useEffect(() => {
		let alive = true;
		getAttendance(session.id)
			.then((r) => alive && setRows(r.map((row) => ({ ...row, status: row.status ?? 'present' }))))
			.catch((err) => alive && setError(err instanceof Error ? err.message : 'Không thể tải điểm danh'))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [session.id]);

	const setStatus = (enrollmentId: string, status: AttendanceStatus) =>
		setRows((prev) => prev.map((r) => (r.enrollment_id === enrollmentId ? { ...r, status } : r)));

	// Trong lúc hiện QR, học viên có thể tự quét bất kỳ lúc nào — tải lại danh
	// sách định kỳ để giảng viên thấy cập nhật gần như trực tiếp.
	useEffect(() => {
		if (!showQr) return;
		const poll = setInterval(() => {
			getAttendance(session.id)
				.then((r) => setRows((prev) => r.map((row) => ({ ...row, status: row.status ?? prev.find((p) => p.enrollment_id === row.enrollment_id)?.status ?? 'present' }))))
				.catch(() => {});
		}, 5000);
		return () => clearInterval(poll);
	}, [showQr, session.id]);

	const handleSave = async () => {
		setSaving(true);
		setError('');
		try {
			await saveAttendance(
				session.id,
				rows.map((r) => ({ enrollment_id: r.enrollment_id, status: r.status ?? 'present' })),
			);
			notify.success('Đã lưu điểm danh');
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu điểm danh thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<ClipboardCheckSvg />}
			title='Điểm danh buổi học'
			subtitle={<>{formatDateVN(session.session_date)} {session.start_time ? ` · ${session.start_time}-${session.end_time ?? ''}` : ''} {session.room ? ` · ${session.room}` : ''}</>}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={handleSave}
					loading={saving}
					disabled={loading || rows.length === 0}
					confirmLabel='Lưu điểm danh'
				/>
			}
		>
			<button
				type='button'
				onClick={() => setShowQr((v) => !v)}
				style={{
					alignSelf: 'flex-start',
					background: 'transparent',
					border: '1.5px solid var(--color-gray-200)',
					borderRadius: 8,
					padding: '6px 12px',
					fontSize: 13,
					fontWeight: 600,
					cursor: 'pointer',
					marginBottom: 8,
				}}
			>
				{showQr ? 'Ẩn mã QR điểm danh' : 'Hiện mã QR điểm danh'}
			</button>
			{showQr && <AttendanceQrDisplay sessionId={session.id} />}

			{error && <div className={styles.errorBanner}>{error}</div>}
			{loading ? (
				<div className={styles.subEmpty}>Đang tải...</div>
			) : rows.length === 0 ? (
				<div className={styles.subEmpty}>
					Chưa có học viên nào được duyệt tham gia khóa học này.
				</div>
			) : (
				<div className={styles.subList}>
					{rows.map((r) => (
						<div
							key={r.enrollment_id}
							className={styles.subRow}
						>
							<div className={styles.subRowMain}>
								<div className={styles.subRowName}>{r.trainee_name}</div>
							</div>
							<div className={styles.attGrid}>
								{ATT_OPTIONS.map((opt) => (
									<label
										key={opt.value}
										className={`${styles.attRadio} ${r.status === opt.value ? styles[opt.cls as keyof typeof styles] : ''}`}
									>
										<input
											type='radio'
											name={`att-${r.enrollment_id}`}
											checked={r.status === opt.value}
											onChange={() => setStatus(r.enrollment_id, opt.value)}
										/>
										{opt.label}
									</label>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</Modal>
	);
}
