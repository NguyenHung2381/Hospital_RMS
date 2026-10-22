import { useCallback, useMemo, useState } from 'react';
import { CalendarSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import { YearPicker } from '../../schedule/components/YearPicker';
import { CAL_MODES, useCalendarNav } from '../../schedule/hooks/useCalendarNav';
import styles from '../../schedule/pages/Schedule.module.css';
import { ClassCalendarView } from './ClassCalendarView';
import { SessionListView } from './SessionListView';
import { useClassSchedule } from '../hooks/useClassSchedule';
import { getClassCalendar } from '../api/classScheduleApi';
import type { ClassCalendarResponse } from '../types/classSchedule.type';
import { parseDate } from '../../../shared/utils/formatDate';

/**
 * Lịch học tuần / tháng / năm + danh sách buổi — dùng cho lịch toàn hệ thống lẫn lịch
 * riêng của 1 học viên (hồ sơ học viên, cổng /me). `load` phải ổn định (useCallback /
 * hàm ngoài component) vì đổi `load` là tải lại.
 */
export function ClassScheduleBoard({
	load = getClassCalendar,
	onOpenCourse,
	courseFilterLabel = 'Tất cả khoá học',
}: {
	load?: (from: string, to: string) => Promise<ClassCalendarResponse>;
	/** Không truyền = không mở được khoá (vd cổng học viên). */
	onOpenCourse?: (courseId: string) => void;
	courseFilterLabel?: string;
}) {
	const {
		currentYear, minYear, maxYear,
		year, calMode, calStart, calWeekStart,
		handleCalMode, handleYearChange, handleSelectMonth,
		calPrev, calNext, calGoToday,
		calCanPrev, calCanNext, calShowsToday, todayTitle,
	} = useCalendarNav('month');

	const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
	const [filterCourseId, setFilterCourseId] = useState('');
	const { sessions, courses, loading, error } = useClassSchedule(year, load);

	// Ô lọc: mọi khoá có buổi học hoặc có thời gian học trong khoảng đang tải
	const courseOptions = useMemo(() => {
		const map = new Map<string, string>();
		courses.forEach((c) => map.set(c.id, c.name));
		sessions.forEach((s) => map.set(s.course_id, s.course_name));
		return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
	}, [courses, sessions]);

	const shownSessions = useMemo(
		() => (filterCourseId ? sessions.filter((s) => s.course_id === filterCourseId) : sessions),
		[sessions, filterCourseId],
	);
	const shownCourses = useMemo(
		() => (filterCourseId ? courses.filter((c) => c.id === filterCourseId) : courses),
		[courses, filterCourseId],
	);
	const yearSessionCount = useMemo(
		() => shownSessions.filter((s) => parseDate(s.session_date)?.getFullYear() === year).length,
		[shownSessions, year],
	);

	const handleOpenCourse = useCallback((courseId: string) => onOpenCourse?.(courseId), [onOpenCourse]);

	return (
			<div className={styles.page}>
				<div className={styles.toolbar}>
					<div className={styles.viewSwitcher}>
						<button
							className={`${styles.viewBtn}${viewMode === 'calendar' ? ` ${styles.viewBtnActive}` : ''}`}
							onClick={() => setViewMode('calendar')}
						>
							🗓 Lịch
						</button>
						<button
							className={`${styles.viewBtn}${viewMode === 'list' ? ` ${styles.viewBtnActive}` : ''}`}
							onClick={() => setViewMode('list')}
						>
							📋 Danh sách buổi học
						</button>
					</div>
					<YearPicker
						value={year}
						onChange={handleYearChange}
						min={minYear}
						max={maxYear}
						currentYear={currentYear}
					/>
					<select
						className={styles.roundFilter}
						value={filterCourseId}
						onChange={(e) => setFilterCourseId(e.target.value)}
						disabled={loading}
					>
						<option value=''>{courseFilterLabel}</option>
						{courseOptions.map(([id, name]) => (
							<option key={id} value={id}>{id} — {name}</option>
						))}
					</select>
					{viewMode === 'calendar' && (
						<div className={styles.actionGroup}>
							<div className={styles.calViewGroup} role='tablist' aria-label='Chế độ xem lịch'>
								{CAL_MODES.map(({ key, label }) => (
									<button
										key={key}
										role='tab'
										aria-selected={calMode === key}
										className={`${styles.calViewBtn}${calMode === key ? ` ${styles.calViewBtnActive}` : ''}`}
										onClick={() => handleCalMode(key)}
									>
										{label}
									</button>
								))}
							</div>
							{!calShowsToday && (
								<button className={styles.todayBtn} onClick={calGoToday} title={todayTitle}>
									<span className={styles.todayDot} />
									Hôm nay
								</button>
							)}
						</div>
					)}
				</div>

				{loading ? (
					<InlineLoading label='Đang tải lịch học…' />
				) : error ? (
					<div className={styles.emptyState}>
						<span className={styles.errorTxt}>{error}</span>
					</div>
				) : viewMode === 'list' && yearSessionCount === 0 ? (
					<div className={styles.emptyState}>
						<CalendarSvg className={styles.emptyIcon} />
						<p className={styles.emptyTxt}>Không có buổi học nào trong năm {year}</p>
					</div>
				) : viewMode === 'list' ? (
					<SessionListView
						sessions={shownSessions}
						courses={shownCourses}
						year={year}
						onOpenCourse={handleOpenCourse}
					/>
				) : (
					<ClassCalendarView
						sessions={shownSessions}
						year={year}
						mode={calMode}
						startMonth={calMode === 'year' ? 0 : calStart}
						weekStart={calWeekStart}
						onPrev={calPrev}
						onNext={calNext}
						canPrev={calCanPrev}
						canNext={calCanNext}
						onSelectMonth={handleSelectMonth}
						onOpenCourse={handleOpenCourse}
					/>
				)}

				{viewMode === 'calendar' && !loading && !error && (
					<p className={styles.hint}>
						Mỗi khoá học một màu · Thanh nhạt màu là thời gian học của khoá · Nhấp vào buổi học để xem chi tiết · Lăn chuột để chuyển tuần/tháng
					</p>
				)}
			</div>
	);
}
