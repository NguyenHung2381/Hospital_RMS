import type { NavigateFunction } from 'react-router-dom';
import { ChevRSvg, HelpSvg } from '@/assets/icons';
import type { MyTopic } from '../types/topicregister.type';
import {
	BADGE_CLS,
	fmtDate,
	GUIDE_STEPS,
	STATUS_CFG,
} from '../utils/topicRegisterHelpers';
import styles from '../pages/TopicRegister.module.css';

interface RegisterSidePanelProps {
	myTopics: MyTopic[];
	navigate: NavigateFunction;
}

export function RegisterSidePanel({ myTopics, navigate }: RegisterSidePanelProps) {
	return (
		<div className={styles.sidePanel}>
			<div className={styles.sideCard}>
				<div className={styles.sideCardHeader}>
					<span>Hướng dẫn đăng ký</span>
					<HelpSvg
						width={15}
						height={15}
					/>
				</div>
				<div className={styles.sideCardBody}>
					{GUIDE_STEPS.map((s, i) => (
						<div
							key={i}
							className={styles.guideStep}
						>
							<div className={styles.guideNum}>{i + 1}</div>
							<div className={styles.guideText}>
								<span className={styles.guideTextBold}>{s.title}.</span>{' '}
								{s.desc}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className={styles.sideCard}>
				<div className={styles.sideCardHeader}>
					<span>Đề tài của tôi</span>
					<button
						type='button'
						style={{
							background: 'none',
							border: 'none',
							cursor: 'pointer',
							color: '#1a6abd',
							fontSize: 12,
							fontWeight: 600,
							display: 'inline-flex',
							alignItems: 'center',
							gap: 3,
						}}
						onClick={() => navigate('/user/my-topics')}
					>
						Xem tất cả{' '}
						<ChevRSvg
							width={12}
							height={12}
						/>
					</button>
				</div>
				<div className={styles.sideCardBody}>
					{myTopics.length === 0 ? (
						<div
							style={{
								textAlign: 'center',
								padding: '24px 0',
								color: 'var(--color-gray-400)',
								fontSize: 13,
							}}
						>
							Bạn chưa có đề tài nào
						</div>
					) : (
						myTopics.slice(0, 5).map((t) => (
							<div
								key={t.id}
								className={styles.myTopicItem}
								onClick={() => navigate('/user/my-topics')}
							>
								<div className={styles.myTopicTitle}>{t.title}</div>
								<div className={styles.myTopicMeta}>
									<span>{fmtDate(t.created_at)}</span>
									<span
										className={`${styles.badge} ${styles[BADGE_CLS[t.status] as keyof typeof styles]}`}
									>
										<span
											className={styles.badgeDot}
											style={{ background: STATUS_CFG[t.status].dot }}
										/>
										{STATUS_CFG[t.status].label}
									</span>
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
}
