import React, { useMemo } from 'react';
import styles from '../../schedule/components/ScheduleListView.module.css';
import { formatDateVN, parseDate } from '../../../shared/utils/formatDate';
import type { CalendarCourse, CalendarSession } from '../types/classSchedule.type';
import { courseColor, sessionTime, sessionTitle } from '../utils/classCalendar';

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

interface SessionListViewProps {
	sessions: CalendarSession[];
	courses: CalendarCourse[];
	year: number;
	onOpenCourse: (courseId: string) => void;
}

/** Danh sách buổi học trong năm, gom theo khoá học — cùng kiểu thẻ với "Danh sách mốc" NCKH. */
export function SessionListView({ sessions, courses, year, onOpenCourse }: SessionListViewProps) {
	const groups = useMemo(() => {
		const byCourse = new Map<string, { id: string; name: string; items: CalendarSession[] }>();
		sessions.forEach((s) => {
			if (parseDate(s.session_date)?.getFullYear() !== year) return;
			if (!byCourse.has(s.course_id)) byCourse.set(s.course_id, { id: s.course_id, name: s.course_name, items: [] });
			byCourse.get(s.course_id)!.items.push(s);
		});
		return [...byCourse.values()];
	}, [sessions, year]);

	const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	return (
		<div className={styles.container}>
			{groups.map((g) => {
				const color = courseColor(g.id);
				const course = courseById.get(g.id);
				const upcoming = g.items.filter((s) => (parseDate(s.session_date) ?? today) >= today).length;

				return (
					<div key={g.id} className={styles.roundCard}>
						<div className={styles.cardHeader}>
							<div className={styles.headerLeft}>
								<div className={styles.roundTitleRow}>
									<span className={styles.roundId}>{g.id}</span>
									<h3 className={styles.roundName}>{g.name}</h3>
									<span className={styles.statusBadge} style={{ '--status-color': color } as React.CSSProperties}>
										{g.items.length} buổi
									</span>
								</div>
								<div className={styles.metaRow}>
									{course && (
										<>
											<span>Khoá học: {formatDateVN(course.start_date)} ➔ {formatDateVN(course.end_date)}</span>
											<span>•</span>
										</>
									)}
									<span>{upcoming} buổi sắp tới</span>
								</div>
							</div>
							<button className={styles.addBtn} onClick={() => onOpenCourse(g.id)}>
								📋 Lịch học & điểm danh
							</button>
						</div>

						<div className={styles.timelineSection}>
							<div className={styles.verticalList}>
								{g.items.map((s) => {
									const d = parseDate(s.session_date);
									const past = d ? d < today : false;
									return (
										<div
											key={s.id}
											className={styles.deadlineItem}
											onClick={() => onOpenCourse(g.id)}
											title='Nhấp để mở lịch học của khoá'
											style={{ '--dl-color': color, opacity: past ? 0.6 : 1 } as React.CSSProperties}
										>
											<div className={styles.deadlineDot} />
											<div className={styles.deadlineInfo}>
												<span className={styles.deadlineName}>{sessionTitle(s)}</span>
												<div className={styles.deadlineMeta}>
													{sessionTime(s) && <span className={styles.phaseBadge}>{sessionTime(s)}</span>}
													<span>GV: {s.lecturer_name || '—'}</span>
													{s.room && <span>· Phòng: {s.room}</span>}
												</div>
											</div>
											<div className={styles.deadlineDateBadge}>
												{d ? `${WEEKDAY[d.getDay()]}, ` : ''}{formatDateVN(s.session_date)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
