import { BookOpenSvg, CalendarSvg, ChevRSvg, LayersSvg } from '@/assets/icons';
import { Button } from '@/shared/components';
import type { CourseProgramLink } from '../types/course.type';
import { programClassStatus, programDates } from '../utils/programClass';
import styles from './CourseProgramList.module.css';

/** Số liệu của 1 chương trình trong khóa — CourseDetail tính sẵn từ dữ liệu khóa. */
export interface ProgramStats {
	approved: number;
	pending: number;
	lessons: number;
	sessions: number;
	issued: number;
}

/** Tầng đầu của trang chi tiết khóa nhiều chương trình: mỗi chương trình 1 dòng (điện thoại: 1 thẻ), bấm để vào
 *  làm việc (học viên, bài học, tài liệu, thi, kết quả) trong chương trình đó. */
export function CourseProgramList({
	links,
	statsOf,
	unassigned,
	onOpen,
	onOpenAll,
	onOpenUnassigned,
}: {
	links: CourseProgramLink[];
	statsOf: (programId: string) => ProgramStats;
	/** Học viên chưa chọn chương trình (hoặc chương trình đã gỡ khỏi khóa). */
	unassigned: number;
	onOpen: (programId: string) => void;
	onOpenAll: () => void;
	onOpenUnassigned: () => void;
}) {
	return (
		<section aria-labelledby='course-programs-title'>
			<div className={styles.head}>
				<div>
					<h2
						id='course-programs-title'
						className={styles.title}
					>
						Chương trình trong khóa <span className={styles.count}>{links.length}</span>
					</h2>
					<p className={styles.hint}>Chọn một chương trình để quản lý học viên, bài học, tài liệu, thi và kết quả.</p>
				</div>
				<Button
					variant='secondary'
					size='sm'
					icon={<LayersSvg />}
					onClick={onOpenAll}
				>
					Xem toàn khóa
				</Button>
			</div>

			{unassigned > 0 && (
				<div className={styles.notice}>
					<span>
						<strong>{unassigned}</strong> học viên chưa chọn chương trình.
					</span>
					<button
						type='button'
						className={styles.noticeBtn}
						onClick={onOpenUnassigned}
					>
						Xem danh sách
					</button>
				</div>
			)}

			{/* Máy tính: bảng phẳng 1 dòng / chương trình. Điện thoại (≤ 768px): mỗi dòng thành 1 thẻ. */}
			<div className={styles.list}>
				<div
					className={styles.listHead}
					aria-hidden
				>
					<span className={styles.center}>STT</span>
					<span>Chương trình</span>
					<span className={styles.center}>Học viên</span>
					<span className={styles.center}>Bài học</span>
					<span>Tình trạng lớp</span>
					<span />
				</div>
				{links.map((l, i) => {
					const st = statsOf(l.program_id);
					const cls = programClassStatus(l);
					const dates = programDates(l);
					return (
						<button
							key={l.program_id}
							type='button'
							className={styles.row}
							onClick={() => onOpen(l.program_id)}
						>
							<span className={styles.cIdx}>{i + 1}</span>
							<span className={styles.cMain}>
								<span
									className={styles.icon}
									aria-hidden
								>
									<BookOpenSvg />
								</span>
								<span className={styles.text}>
									<span className={styles.name}>{l.program_name}</span>
									<span className={styles.meta}>
										{l.program_code && <span className={styles.code}>{l.program_code}</span>}
										{l.program_duration && <span>{l.program_duration}</span>}
										{dates && (
											<span className={styles.dates}>
												<CalendarSvg aria-hidden />
												{dates}
											</span>
										)}
									</span>
								</span>
							</span>
							<span className={styles.cEnrolled}>
								<span className={styles.stat}>
									<strong>{st.approved}</strong>
									<span className={styles.unit}>học viên</span>
								</span>
								{st.pending > 0 && <span className={styles.pending}>{st.pending} chờ duyệt</span>}
							</span>
							<span className={styles.cLessons}>
								<span className={styles.stat}>
									<strong>{st.lessons}</strong>
									<span className={styles.unit}>bài học</span>
								</span>
							</span>
							<span className={styles.cStatus}>
								{cls ? (
									<>
										<span className={`${styles.statusLabel} ${styles[`tone_${cls.tone}`]}`}>{cls.label}</span>
										<span className={styles.statusDetail}>{cls.detail}</span>
									</>
								) : (
									<span className={styles.statusDetail}>Không chia lớp</span>
								)}
							</span>
							<span
								className={styles.cGo}
								aria-hidden
							>
								<ChevRSvg />
							</span>
						</button>
					);
				})}
			</div>
		</section>
	);
}
