import { useMemo } from 'react';
import { AlertSvg, BookOpenSvg, ChevRSvg } from '@/assets/icons';
import { SearchInput } from '@/shared/components';
import { removeDiacritics } from '@/shared/utils/helper';
import { formatDateOr } from '../../../../shared/utils/formatDate';
import type { PublicCourse } from '../../api/publicApi';
import { CourseProgramPicker } from '../CourseProgramPicker';
import styles from '../../pages/PublicPortal.module.css';
import s from '../../pages/CourseRegisterPublic.module.css';

// Nhiều khóa thì mới cần ô tìm
const SEARCH_FROM = 6;
const searchKey = (v: string) => removeDiacritics(v).toLowerCase();

// Số ngày còn lại tới hạn đăng ký (null = không giới hạn)
function daysLeft(date: string | null) {
	if (!date) return null;
	const end = new Date(date);
	if (Number.isNaN(end.getTime())) return null;
	end.setHours(0, 0, 0, 0);
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

function DeadlineTag({ date }: { date: string | null }) {
	const left = daysLeft(date);
	if (left == null || left < 0) return null;
	const soon = left <= 7;
	return (
		<span className={`${s.tag} ${soon ? s.tagWarn : ''}`}>
			{left === 0 ? 'Hết hạn hôm nay' : soon ? `Còn ${left} ngày` : `Hạn ĐK ${formatDateOr(date)}`}
		</span>
	);
}

interface Props {
	courses: PublicCourse[];
	loading: boolean;
	loadError: string;
	/** Link ?khoa=… trỏ tới khóa không còn mở đăng ký */
	linkMissing: boolean;
	course: PublicCourse | undefined;
	programId: string;
	query: string;
	onQuery: (q: string) => void;
	onPickCourse: (c: PublicCourse | null) => void;
	onPickProgram: (id: string) => void;
	error?: string;
}

// Bước 1: chọn khóa học, rồi chương trình trong khóa
export function StepCourse({
	courses,
	loading,
	loadError,
	linkMissing,
	course,
	programId,
	query,
	onQuery,
	onPickCourse,
	onPickProgram,
	error,
}: Props) {
	const visibleCourses = useMemo(() => {
		const q = searchKey(query.trim());
		if (!q) return courses;
		return courses.filter((c) =>
			searchKey(`${c.name} ${c.program_name ?? ''} ${c.programs.map((p) => p.name).join(' ')}`).includes(q),
		);
	}, [courses, query]);

	return (
		<div id='f-course'>
			{linkMissing && !course && !loading && (
				<div
					className={s.linkNotice}
					role='status'
				>
					<AlertSvg />
					<span>
						Khóa học trong link bạn mở đã hết hạn hoặc không còn nhận đăng ký.
						{courses.length > 0 && ' Bạn có thể chọn một khóa khác đang mở bên dưới.'}
					</span>
				</div>
			)}
			{course ? (
				<CourseProgramPicker
					course={course}
					value={programId}
					onChange={onPickProgram}
					onBack={() => onPickCourse(null)}
					backLabel={courses.length > 1 ? 'Chọn khóa khác' : 'Xem danh sách khóa'}
					external
				/>
			) : loading ? (
				<div className={styles.emptyNotice}>Đang tải danh sách khóa học...</div>
			) : loadError ? (
				<div className={styles.emptyNotice}>{loadError}</div>
			) : courses.length === 0 ? (
				<div className={styles.emptyNotice}>Hiện chưa có khóa học nào đang mở đăng ký.</div>
			) : (
				<>
					{courses.length >= SEARCH_FROM && (
						<div className={s.courseToolbar}>
							<SearchInput
								value={query}
								onChange={onQuery}
								placeholder='Tìm khóa học, chương trình...'
							/>
						</div>
					)}
					<div
						className={s.courseGrid}
						role='group'
						aria-label='Danh sách khóa học'
					>
						{visibleCourses.map((c) => (
							<button
								type='button'
								key={c.id}
								className={s.courseItem}
								onClick={() => onPickCourse(c)}
							>
								<span className={s.courseIcon}>
									<BookOpenSvg />
								</span>
								<span className={s.courseBody}>
									<span className={s.courseTitle}>{c.name}</span>
									<span className={s.courseSub}>
										{c.programs.length > 1
											? `${c.programs.length} chương trình để chọn`
											: (c.programs[0]?.name ?? c.program_name ?? 'Chương trình chưa xác định')}
									</span>
									<span className={s.courseTags}>
										{c.start_date && <span className={s.tag}>Khai giảng {formatDateOr(c.start_date)}</span>}
										<DeadlineTag date={c.enrollment_end_date} />
									</span>
								</span>
								<span className={s.courseArrow}>
									<ChevRSvg />
								</span>
							</button>
						))}
					</div>
					{visibleCourses.length === 0 && <div className={styles.emptyNotice}>Không có khóa học khớp "{query}".</div>}
				</>
			)}
			{error && (
				<div
					className={`${s.fieldError} ${s.blockError}`}
					role='alert'
				>
					{error}
				</div>
			)}
		</div>
	);
}
