import { useSearchParams } from 'react-router-dom';
import { Card } from '@/shared/components';
import TraineeLayout from '../../../layouts/TraineeLayout';
import { TraineeAttendanceTab } from '../../trainee/components/TraineeAttendanceTab';
import { TraineeScheduleTab } from '../../trainee/components/TraineeScheduleTab';
import styles from './TraineePortal.module.css';

/** Lịch học (tuần / tháng / danh sách) + điểm danh từng khóa của chính học viên. */
export default function TraineeSchedule() {
	const [params, setParams] = useSearchParams();
	const tab = params.get('tab') === 'diem-danh' ? 'attendance' : 'schedule';
	return (
		<TraineeLayout
			pageTitle='Lịch học & điểm danh'
			pageSubtitle='Các buổi học của lớp bạn đã được duyệt và tình hình chuyên cần'
		>
			<div
				className={styles.segment}
				role='tablist'
			>
				{(
					[
						['schedule', 'Lịch học', {}],
						['attendance', 'Điểm danh', { tab: 'diem-danh' }],
					] as const
				).map(([key, label, q]) => (
					<button
						key={key}
						type='button'
						role='tab'
						aria-selected={tab === key}
						className={`${styles.segmentItem} ${tab === key ? styles.segmentActive : ''}`}
						onClick={() => setParams(q, { replace: true })}
					>
						{label}
					</button>
				))}
			</div>
			<Card>
				<Card.Body>{tab === 'schedule' ? <TraineeScheduleTab /> : <TraineeAttendanceTab />}</Card.Body>
			</Card>
		</TraineeLayout>
	);
}
