import { useCallback, useMemo, useState } from 'react';
import { CalendarSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { InlineLoading } from '@/shared/components';
import { YearPicker } from '../../schedule/components/YearPicker';
import { CAL_MODES, useCalendarNav } from '../../schedule/hooks/useCalendarNav';
import styles from '../../schedule/pages/Schedule.module.css';
import { getCourse } from '../../course/api/courseApi';
import { CourseDetailModal } from '../../course/components/CourseDetailModal';
import type { Course } from '../../course/types/course.type';
import { ClassCalendarView } from '../components/ClassCalendarView';
import { SessionListView } from '../components/SessionListView';
import { useClassSchedule } from '../hooks/useClassSchedule';
import { parseDate } from '../../../shared/utils/formatDate';

export default function ClassSchedule() {
	const {
		currentYear, minYear, maxYear,
		year, calMode, calStart, calWeekStart,
		handleCalMode, handleYearChange, handleSelectMonth,
		calPrev, calNext, calGoToday,
		calCanPrev, calCanNext, calShowsToday, todayTitle,
	} = useCalendarNav('month');

	const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
	const [filterCourseId, setFilterCourseId] = useState('');
	const [openCourse, setOpenCourse] = useState<Course | null>(null);
	const [openError, setOpenError] = useState<string | null>(null);

	const { sessions, courses, loading, error } = useClassSchedule(year);

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

	const handleOpenCourse = useCallback((courseId: string) => {
		setOpenError(null);
		getCourse(courseId)
			.then(setOpenCourse)
			.catch((e: Error) => setOpenError(e.message || 'Không thể mở khoá học'));
	}, []);

	return (
		<AdminLayout
			pageTitle='Lịch học'
			pageSubtitle='Lịch các buổi học của mọi khoá đào tạo theo tuần, tháng và năm'
		>
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
						<option value=''>Tất cả khoá học</option>
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

				{openError && (
					<div className={styles.emptyState}>
						<span className={styles.errorTxt}>{openError}</span>
					</div>
				)}

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
						courses={shownCourses}
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
						Mỗi khoá học một màu · Thanh mảnh là thời gian học của khoá · Nhấp vào buổi học để xem chi tiết · Lăn chuột để chuyển tuần/tháng
					</p>
				)}
			</div>

			{openCourse && (
				<CourseDetailModal
					course={openCourse}
					initialTab='sessions'
					onClose={() => setOpenCourse(null)}
				/>
			)}
		</AdminLayout>
	);
}
