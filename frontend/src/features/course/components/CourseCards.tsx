import { ArrowRSvg, CalendarSvg, EditSvg, TrashSvg } from '@/assets/icons';
import { EmptyState } from '@/shared/components';
import { formatDateOr } from '@/shared/utils';
import { DISPLAY_STATUS_CFG, type Course } from '../types/course.type';
import ProgramTags from './ProgramTags';
import styles from './CourseCards.module.css';

const range = (a: string | null, b: string | null) =>
	a || b ? `${formatDateOr(a, '?')} → ${formatDateOr(b, '?')}` : null;

/** Lưới thẻ khóa học — mỗi thẻ là 1 khóa, bấm để vào trang làm việc của khóa. */
export function CourseCards({
	items,
	onOpen,
	onEdit,
	onDelete,
	emptyDesc,
}: {
	items: Course[];
	onOpen: (c: Course) => void;
	onEdit: (c: Course) => void;
	onDelete: (c: Course) => void;
	emptyDesc: string;
}) {
	if (!items.length)
		return (
			<EmptyState
				title='Không tìm thấy khóa học'
				desc={emptyDesc}
			/>
		);
	return (
		<div className={styles.grid}>
			{items.map((c) => {
				const cfg = DISPLAY_STATUS_CFG[c.display_status];
				return (
					<article
						key={c.id}
						className={styles.card}
						style={{ ['--accent' as string]: cfg.color }}
					>
						<button
							type='button'
							className={styles.open}
							onClick={() => onOpen(c)}
							aria-label={`Mở khóa ${c.name}`}
						/>
						<div className={styles.top}>
							<span
								className={styles.status}
								style={{ background: cfg.bg, color: cfg.color }}
							>
								{cfg.label}
							</span>
							{c.training_type_name && <span className={styles.type}>{c.training_type_name}</span>}
							<span className={styles.tools}>
								<button
									type='button'
									title='Sửa thông tin'
									onClick={() => onEdit(c)}
								>
									<EditSvg />
								</button>
								<button
									type='button'
									title='Xoá khóa học'
									className={styles.danger}
									onClick={() => onDelete(c)}
								>
									<TrashSvg />
								</button>
							</span>
						</div>
						<h3 className={styles.name}>{c.name}</h3>
						<div className={styles.date}>
							<CalendarSvg />
							{c.is_rolling ? 'Mở liên tục — mỗi học viên có lịch riêng' : (range(c.start_date, c.end_date) ?? 'Chưa đặt ngày học')}
						</div>
						<div className={styles.programs}>
							<ProgramTags names={c.program_names} />
						</div>
						<div className={styles.stats}>
							<span>
								<strong>{c.approved_count}</strong> học viên
							</span>
							<span className={c.pending_count ? styles.warn : undefined}>
								<strong>{c.pending_count}</strong> chờ duyệt
							</span>
							{c.waitlisted_count > 0 && (
								<span>
									<strong>{c.waitlisted_count}</strong> danh sách chờ
								</span>
							)}
						</div>
						<div className={styles.foot}>
							<span className={c.enrollment_open ? styles.open1 : styles.closed}>
								{c.enrollment_open ? 'Đang nhận đăng ký' : 'Đã đóng đăng ký'}
								{c.is_public_registration ? ' · công khai' : ''}
							</span>
							<span className={styles.cta}>
								Mở khóa học <ArrowRSvg />
							</span>
						</div>
					</article>
				);
			})}
		</div>
	);
}
