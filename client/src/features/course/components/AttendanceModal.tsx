import { useEffect, useState } from 'react';
import { CheckSvg, ClipboardCheckSvg, XSvg } from '@/assets/icons';
import { getAttendance, saveAttendance } from '../api/courseApi';
import type { AttendanceRow, AttendanceStatus, ClassSession } from '../types/course.type';
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

	const handleSave = async () => {
		setSaving(true);
		setError('');
		try {
			await saveAttendance(
				session.id,
				rows.map((r) => ({ enrollment_id: r.enrollment_id, status: r.status ?? 'present' })),
			);
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu điểm danh thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<ClipboardCheckSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>Điểm danh buổi học</div>
						<div className={styles.modalSub}>
							{session.session_date}
							{session.start_time ? ` · ${session.start_time}-${session.end_time ?? ''}` : ''}
							{session.room ? ` · ${session.room}` : ''}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
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
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={saving}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirm}
						onClick={handleSave}
						disabled={saving || loading || rows.length === 0}
					>
						{saving ? <span className={styles.spinner} /> : <CheckSvg />}
						Lưu điểm danh
					</button>
				</div>
			</div>
		</div>
	);
}
