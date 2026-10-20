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

// "4 vòng thực hành" / "6 bài học" / cả hai
const countText = (p: PublicProgram) => {
	const rounds = p.lessons.filter((l) => l.kind === 'rotation').length;
	const theory = p.lessons.length - rounds;
	return [rounds ? `${rounds} vòng thực hành` : null, theory ? `${theory} bài học` : null].filter(Boolean).join(', ') || null;
};

// Chi tiết 1 chương trình: thông tin chung + nội dung (bài học / vòng thực hành)
function ProgramDetail({ p }: { p: PublicProgram }) {
	const facts = [
		['Thời gian', p.duration],
		// Ghi chú đối tượng ("Bác sĩ đã có CCHN") rõ hơn tên danh mục — có thì ưu tiên.
		['Đối tượng', p.target_audience || p.trainee_type_name],
		['Số giờ', hours(p.theory_hours, p.practice_hours)],
		['Học phí', p.tuition_fee ? `${Number(p.tuition_fee).toLocaleString('vi-VN')} đ` : null],
	].filter(([, v]) => v);
	let round = 0;
	return (
		<div className={styles.detail}>
			{facts.length > 0 && (
				<dl className={styles.facts}>
					{facts.map(([k, v]) => (
						<div key={k}>
							<dt>{k}</dt>
							<dd>{v}</dd>
						</div>
					))}
				</dl>
			)}
			{p.description && <p className={styles.desc}>{p.description}</p>}
			<div className={styles.contentTitle}>Nội dung chương trình</div>
			{p.lessons.length === 0 ? (
				<p className={styles.empty}>Chưa cập nhật nội dung.</p>
			) : (
				<ol className={styles.lessons}>
					{p.lessons.map((l, i) => {
						const rotation = l.kind === 'rotation';
						if (rotation) round += 1;
						return (
							<li key={i}>
								<span className={rotation ? styles.stepRound : styles.stepLesson}>{rotation ? `V${round}` : i + 1}</span>
								<span className={styles.lessonBody}>
									<span className={styles.lessonTitle}>{l.title}</span>
									<span className={styles.optionMeta}>
										{(rotation
											? [l.departments, l.duration]
											: [hours(l.theory_hours, l.practice_hours) || null, l.duration]
										)
											.filter(Boolean)
											.join(' · ')}
									</span>
								</span>
							</li>
						);
					})}
				</ol>
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
}: {
	course: PublicCourse;
	value: string;
	onChange: (programId: string) => void;
	onBack: () => void;
	backLabel?: string;
	footer?: React.ReactNode;
}) {
	const [q, setQ] = useState('');
	const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(value ? [value] : []));
	const toggle = (id: string) =>
		setOpenIds((s) => {
			const n = new Set(s);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});
	const choose = (id: string) => {
		onChange(id);
		setOpenIds((s) => new Set(s).add(id));
	};
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
					{course.capacity != null && (
						<span>
							Chỉ tiêu: <b>{course.capacity}</b>
						</span>
					)}
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
												onChange={() => choose(p.id)}
											/>
											<span className={styles.optionBody}>
												<span className={styles.optionName}>{p.name}</span>
												<span className={styles.optionMeta}>
													{[
														p.code,
														p.duration,
														p.trainee_type_name,
														countText(p),
													]
														.filter(Boolean)
														.join(' · ')}
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
