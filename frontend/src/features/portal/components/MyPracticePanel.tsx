import { CalendarSvg, DeptSvg, PhoneSvg, UserSvg } from '@/assets/icons';
import { Badge, EmptyState } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { PROGRESS_LABEL } from '../../course/types/course.type';
import type { MyCourseDetail, MyRotation } from '../api/meApi';
import self from '../pages/SelfService.module.css';
import styles from './MyPracticePanel.module.css';

const PHASE: Record<MyRotation['phase'], { label: string; tone: 'gray' | 'blue' | 'amber' | 'green' | 'red' }> = {
	unscheduled: { label: 'Chưa xếp lịch', tone: 'gray' },
	upcoming: { label: 'Sắp tới', tone: 'gray' },
	current: { label: 'Đang thực hành', tone: 'blue' },
	awaiting: { label: 'Chờ đánh giá', tone: 'amber' },
	done: { label: '', tone: 'green' },
};

const badgeOf = (r: MyRotation) =>
	r.phase === 'done'
		? { label: r.result === 'pass' ? 'Đạt' : 'Không đạt', tone: r.result === 'pass' ? 'green' : 'red' } as const
		: PHASE[r.phase];

const mentorOf = (r: MyRotation) =>
	[r.mentor_qualification, r.mentor_salutation && r.mentor_name ? `${r.mentor_salutation === 'bà' ? 'Bà' : 'Ông'} ${r.mentor_name}` : r.mentor_name]
		.filter(Boolean)
		.join(' ');

/**
 * Thực hành GPHN của học viên (cổng học viên, GĐ3): thông tin hồ sơ + lịch từng vòng
 * (khoa, ngày, người hướng dẫn, kết quả và nhận xét). Chỉ xem — Phòng Đào tạo xếp lịch.
 */
export function MyPracticePanel({ data }: { data: MyCourseDetail }) {
	const rows = data.rotations;
	const info: [string, string | null][] = [
		['Mã thực hành', data.practice_code],
		['Chương trình', data.program_name],
		['Lĩnh vực chuyên môn', data.professional_field],
		['Hình thức hành nghề', data.practice_form],
		['Đơn vị cử đi', data.sending_unit],
		[
			'Thời gian',
			data.practice_start
				? `${formatDateVN(data.practice_start)} – ${formatDateVN(data.practice_end)}${data.total_duration ? ` (${data.total_duration})` : ''}`
				: null,
		],
		['Tình trạng', data.progress_status ? PROGRESS_LABEL[data.progress_status] : null],
	];

	return (
		<div className={self.stack}>
			<dl className={styles.info}>
				{info
					.filter(([, v]) => v)
					.map(([k, v]) => (
						<div key={k}>
							<dt>{k}</dt>
							<dd>{v}</dd>
						</div>
					))}
			</dl>

			{rows.length === 0 ? (
				<EmptyState
					title='Chưa xếp lịch thực hành'
					desc='Phòng Đào tạo sẽ xếp khoa, thời gian và người hướng dẫn cho từng vòng — lịch sẽ hiện ở đây.'
				/>
			) : (
				<ol className={styles.timeline}>
					{rows.map((r, i) => {
						const b = badgeOf(r);
						const mentor = mentorOf(r);
						return (
							<li key={r.id} className={`${styles.step} ${styles[r.phase] ?? ''}`}>
								<span className={styles.dot} aria-hidden='true'>
									{i + 1}
								</span>
								<div className={styles.body}>
									<div className={self.itemHead}>
										<div className={self.itemTitle}>
											{r.round_title || `Vòng ${r.seq}`}
											{r.attempt_no > 1 && <span className={styles.attempt}> · học lại lần {r.attempt_no - 1}</span>}
										</div>
										{b.label && <Badge tone={b.tone}>{b.label}</Badge>}
									</div>
									<div className={styles.facts}>
										{r.start_date && (
											<span>
												<CalendarSvg />
												{formatDateVN(r.start_date)} – {formatDateVN(r.end_date)}
												{r.duration_text && ` (${r.duration_text})`}
											</span>
										)}
										{r.department_name && (
											<span>
												<DeptSvg />
												{r.department_name}
											</span>
										)}
										{mentor && (
											<span>
												<UserSvg />
												{mentor}
											</span>
										)}
										{r.mentor_phone && (
											<a href={`tel:${r.mentor_phone}`} className={styles.phone}>
												<PhoneSvg />
												{r.mentor_phone}
											</a>
										)}
									</div>
									{r.result_comment && r.phase === 'done' && (
										<p className={styles.comment}>
											Nhận xét: “{r.result_comment}”
										</p>
									)}
								</div>
							</li>
						);
					})}
				</ol>
			)}
		</div>
	);
}
