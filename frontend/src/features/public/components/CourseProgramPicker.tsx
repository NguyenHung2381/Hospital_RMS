import { useState } from 'react';
import { ChevDSvg } from '@/assets/icons';
import { SearchInput } from '@/shared/components';
import { formatDateOr } from '@/shared/utils/formatDate';
import { removeDiacritics } from '@/shared/utils/helper';
import type { PublicCourse, PublicProgram } from '../api/publicApi';
import styles from './CourseProgramPicker.module.css';

const SEARCH_FROM = 6; // ít chương trình thì không cần ô tìm

const key = (s: string) => removeDiacritics(s).toLowerCase();

const hours = (lt?: number | null, th?: number | null) =>
	[lt ? `${lt} giờ lý thuyết` : null, th ? `${th} giờ thực hành` : null].filter(Boolean).join(' · ');

const LESSON_PREVIEW = 5; // số nội dung hiện sẵn, còn lại bấm "Xem thêm"

// Khóa ĐTLT / CTCV: nhãn ngắn báo đăng ký sẽ vào lớp hay vào danh sách chờ khóa sau.
// Lớp đầy: nội viện vào danh sách chờ đợt sau; ngoại viện (cổng công khai) không đăng ký được.
const classBadge = (p: PublicProgram, external: boolean): { text: string; full: boolean } | null => {
	if (!p.class_rule) return null;
	if (p.class_max != null && p.class_approved >= p.class_max)
		return { text: external ? 'Lớp đã đủ sĩ số' : 'Lớp đã đủ · vào danh sách chờ', full: true };
	if (p.class_approved < p.class_min) return { text: `Đang gom lớp ${p.class_approved}/${p.class_min}`, full: false };
	return p.class_max != null ? { text: `Còn ${p.class_max - p.class_approved} chỗ`, full: false } : null;
};

// Chi tiết 1 chương trình: số giờ, học phí, mô tả + danh sách nội dung rút gọn
function ProgramDetail({ p }: { p: PublicProgram }) {
	const [showAll, setShowAll] = useState(false);
	const facts = [
		hours(p.theory_hours, p.practice_hours),
		p.tuition_fee ? `Học phí ${Number(p.tuition_fee).toLocaleString('vi-VN')} đ` : null,
	].filter(Boolean);
	const lessons = showAll ? p.lessons : p.lessons.slice(0, LESSON_PREVIEW);
	const hidden = p.lessons.length - LESSON_PREVIEW;
	return (
		<div className={styles.detail}>
			{facts.length > 0 && <div className={styles.facts}>{facts.join(' · ')}</div>}
			{p.description && <p className={styles.desc}>{p.description}</p>}
			{p.lessons.length === 0 ? (
				<p className={styles.empty}>Chưa cập nhật nội dung.</p>
			) : (
				<>
					<ol className={styles.lessons}>
						{lessons.map((l, i) => (
							<li key={i}>{l.title}</li>
						))}
					</ol>
					{hidden > 0 && (
						<button
							type='button'
							className={styles.more}
							onClick={() => setShowAll((v) => !v)}
						>
							{showAll ? 'Ẩn bớt' : `Xem thêm ${hidden} nội dung`}
						</button>
					)}
				</>
			)}
		</div>
	);
}

/**
 * Chi tiết 1 khóa đang mở đăng ký + chọn 1 chương trình — dùng chung cho cổng
 * công khai (/dang-ky-khoa-hoc) và cổng cá nhân (Khóa học của tôi).
 */
export function CourseProgramPicker({
	course,
	value,
	onChange,
	onBack,
	backLabel = 'Quay lại',
	footer,
	external = false,
}: {
	course: PublicCourse;
	value: string;
	onChange: (programId: string) => void;
	onBack: () => void;
	backLabel?: string;
	footer?: React.ReactNode;
	/** Cổng công khai (ngoại viện): chương trình đã đủ sĩ số thì không chọn được. */
	external?: boolean;
}) {
	const [q, setQ] = useState('');
	// Mặc định thu gọn — cần xem nội dung thì bấm "Chi tiết"
	const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
	const toggle = (id: string) =>
		setOpenIds((s) => {
			const n = new Set(s);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});
	const programs = course.programs.filter(
		(p) => !q.trim() || key(`${p.name} ${p.code ?? ''}`).includes(key(q.trim())),
	);
	const time =
		course.start_date || course.end_date
			? `${formatDateOr(course.start_date, '…')} – ${formatDateOr(course.end_date, '…')}`
			: 'Chưa xếp lịch';

	return (
		<div className={styles.wrap}>
			<button
				type='button'
				className={styles.back}
				onClick={onBack}
			>
				← {backLabel}
			</button>

			<div className={styles.head}>
				<h3 className={styles.title}>{course.name}</h3>
				<div className={styles.meta}>
					<span>
						Thời gian: <b>{time}</b>
					</span>
				</div>
				{course.description && <p className={styles.desc}>{course.description}</p>}
			</div>

			{course.programs.length === 0 ? (
				<p className={styles.empty}>Khóa học chưa chia chương trình — gửi đăng ký để phòng Đào tạo xét duyệt.</p>
			) : (
				<div className={styles.section}>
					<div className={styles.sectionHead}>
						<span className={styles.sectionTitle}>
							Chọn chương trình <span className={styles.count}>({course.programs.length})</span>
						</span>
						{course.programs.length >= SEARCH_FROM && (
							<SearchInput
								value={q}
								onChange={setQ}
								placeholder='Tìm chương trình...'
							/>
						)}
					</div>
					<div
						className={styles.list}
						role='radiogroup'
						aria-label='Chương trình học'
					>
						{programs.map((p) => {
							const expanded = openIds.has(p.id);
							const badge = classBadge(p, external);
							const blocked = external && !!badge?.full;
							return (
								<div
									key={p.id}
									className={`${styles.option} ${value === p.id ? styles.optionActive : ''}`}
								>
									<div className={styles.optionRow}>
										<label className={styles.optionLabel}>
											<input
												type='radio'
												name={`program-${course.id}`}
												className={styles.radio}
												checked={value === p.id}
												disabled={blocked}
												onChange={() => onChange(p.id)}
											/>
											<span className={styles.optionBody}>
												<span className={styles.optionName}>{p.name}</span>
												<span className={styles.optionMeta}>
													{[p.duration, p.target_audience || p.trainee_type_name].filter(Boolean).join(' · ')}
													{badge && (
														<span className={`${styles.badge} ${badge.full ? styles.badgeFull : ''}`}>{badge.text}</span>
													)}
												</span>
											</span>
										</label>
										<button
											type='button'
											className={`${styles.toggle} ${expanded ? styles.toggleOpen : ''}`}
											aria-expanded={expanded}
											onClick={() => toggle(p.id)}
										>
											{expanded ? 'Thu gọn' : 'Chi tiết'} <ChevDSvg />
										</button>
									</div>
									{expanded && <ProgramDetail p={p} />}
								</div>
							);
						})}
						{programs.length === 0 && <p className={styles.empty}>Không có chương trình khớp "{q}".</p>}
					</div>
				</div>
			)}

			{footer && <div className={styles.footer}>{footer}</div>}
		</div>
	);
}
