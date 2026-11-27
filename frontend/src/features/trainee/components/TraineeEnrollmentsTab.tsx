import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate } from '../../../shared/utils/formatDate';
import { getTraineeEnrollments, getTraineeProgress } from '../api/traineeApi';
import type { EnrollmentStatus, TraineeEnrollment, TraineeProgress } from '../types/trainee.type';
import { TraineeProgressPanel } from './TraineeProgressPanel';
import styles from '../pages/Trainees.module.css';
import { ErrorState } from '@/shared/components';

const ENROLLMENT_STATUS_CFG: Record<EnrollmentStatus, { label: string; color: string; bg: string }> = {
	pending: { label: 'Chờ duyệt', color: 'var(--tone-amber-fg)', bg: 'var(--tone-amber-bg)' },
	approved: { label: 'Đã duyệt', color: 'var(--tone-green-fg)', bg: 'var(--tone-green-bg)' },
	rejected: { label: 'Từ chối', color: 'var(--tone-red-fg)', bg: 'var(--tone-red-bg)' },
	waitlisted: { label: 'Danh sách chờ đợt sau', color: 'var(--tone-blue-fg)', bg: 'var(--tone-blue-bg)' },
};

/** Tab "Khóa học / chương trình": các lượt ghi danh + tiến độ bài học / vòng thực hành. */
export function TraineeEnrollmentsTab({ traineeId }: { traineeId: string }) {
	const [enrollments, setEnrollments] = useState<TraineeEnrollment[] | null>(null);
	const [progress, setProgress] = useState<Record<string, TraineeProgress>>({});
	const [error, setError] = useState('');
	const [retry, setRetry] = useState(0);

	useEffect(() => {
		Promise.all([getTraineeEnrollments(traineeId), getTraineeProgress(traineeId)])
			.then(([enr, prog]) => {
				setEnrollments(enr);
				setProgress(Object.fromEntries(prog.map((p) => [p.enrollment_id, p])));
			})
			.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được khóa học'));
	}, [traineeId, retry]);

	if (error)
		return (
			<ErrorState
				desc={error}
				onRetry={() => {
					setError('');
					setRetry((n) => n + 1);
				}}
			/>
		);
	if (!enrollments) return <div className={styles.subEmpty}>Đang tải...</div>;
	if (!enrollments.length) return <div className={styles.subEmpty}>Học viên chưa đăng ký khóa học nào.</div>;

	return (
		<div className={styles.subList}>
			{enrollments.map((en) => {
				const cfg = ENROLLMENT_STATUS_CFG[en.status];
				return (
					<div
						key={en.id}
						className={`${styles.subRow} ${styles.subRowWrap}`}
					>
						<div className={styles.subRowMain}>
							<div className={styles.subRowName}>
								<Link
									className={styles.docLink}
									to={`/admin/courses/${en.course_id}`}
								>
									{en.course_name}
								</Link>
								{en.practice_code ? ` · Mã thực hành ${en.practice_code}` : ''}
							</div>
							<div className={styles.subRowMeta}>
								{en.program_name
									? `${en.program_code ? `${en.program_code} — ` : ''}${en.program_name}`
									: (en.program_names ?? 'Chưa gán chương trình đào tạo')}
								{en.training_type_name ? ` · ${en.training_type_name}` : ''} · Đăng ký {formatDate(en.registered_at)}
								{en.decided_at ? ` · Duyệt ${formatDate(en.decided_at)}` : ''}
								{en.practice_start_date
									? ` · Thực hành ${formatDate(en.practice_start_date)} – ${en.practice_end_date ? formatDate(en.practice_end_date) : '…'}`
									: ''}
								{en.progress_status === 'completed'
									? ' · Đã hoàn thành'
									: en.progress_status === 'dropped'
										? ' · Nghỉ học'
										: ''}
							</div>
						</div>
						<span
							className={styles.badge}
							style={{ background: cfg.bg, color: cfg.color }}
						>
							{cfg.label}
						</span>
						{progress[en.id] && (
							<div className={styles.subRowFull}>
								<TraineeProgressPanel progress={progress[en.id]} />
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
