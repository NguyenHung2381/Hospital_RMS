import { useEffect, useState } from 'react';
import { BadgeSvg, LayersSvg } from '@/assets/icons';
import { Badge, Card } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import TraineeLayout from '../../../layouts/TraineeLayout';
import { programLabel, traineeRecordApi, type TraineeCourseResult } from '../../trainee/api/traineeRecordApi';
import { TraineeResultsTab } from '../../trainee/components/TraineeResultsTab';
import styles from './TraineePortal.module.css';

/** Kết quả học tập (điểm LT/TH, chuyên cần, đạt/chưa đạt) + giấy chứng nhận đã cấp. */
export default function TraineeResults() {
	const [certs, setCerts] = useState<TraineeCourseResult[]>([]);
	useEffect(() => {
		traineeRecordApi
			.myGrades()
			.then((rows) => setCerts(rows.filter((r) => r.cert_no)))
			.catch(() => setCerts([]));
	}, []);

	return (
		<TraineeLayout
			pageTitle='Kết quả & chứng chỉ'
			pageSubtitle='Điểm, chuyên cần và giấy chứng nhận các khóa bạn đã học'
		>
			{certs.length > 0 && (
				<div className={styles.certGrid}>
					{certs.map((c) => {
						const revoked = c.certificate_status === 'revoked';
						return (
							<div
								key={c.enrollment_id}
								className={`${styles.certCard} ${revoked ? styles.certRevoked : ''}`}
							>
								<span className={styles.certIcon}>
									<BadgeSvg />
								</span>
								<div className={styles.certBody}>
									<div className={styles.certNo}>Số {c.cert_no}</div>
									<div className={styles.certName}>{c.course_name}</div>
									{programLabel(c) && <div className={styles.certMeta}>{programLabel(c)}</div>}
									<div className={styles.certMeta}>
										Cấp ngày {formatDateVN(c.issue_date)}
										{c.expiry_date ? ` · hạn ${formatDateVN(c.expiry_date)}` : ' · không thời hạn'}
									</div>
								</div>
								<Badge tone={revoked ? 'red' : 'green'}>{revoked ? 'Đã thu hồi' : 'Còn hiệu lực'}</Badge>
							</div>
						);
					})}
				</div>
			)}
			<Card>
				<Card.Header
					icon={<LayersSvg />}
					title='Kết quả học tập'
				/>
				<Card.Body>
					<TraineeResultsTab />
				</Card.Body>
			</Card>
		</TraineeLayout>
	);
}
