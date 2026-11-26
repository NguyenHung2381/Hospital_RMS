import { useState } from 'react';
import { ChevDSvg, FileSvg, LinkSvg } from '@/assets/icons';
import { Badge, EmptyState } from '@/shared/components';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';
import { formatDateVN } from '@/shared/utils/formatDate';
import { formatFileSize } from '../../topics/utils/topicHelpers';
import type { LessonProgressStatus, MyCourseGrade, MyLesson, MyLessonDocument } from '../api/meApi';
import styles from './CurriculumPanel.module.css';

const PROGRESS: Record<LessonProgressStatus, { label: string; tone: BadgeTone }> = {
	done: { label: 'Hoàn thành', tone: 'green' },
	in_progress: { label: 'Đang học', tone: 'amber' },
	not_started: { label: 'Chưa học', tone: 'gray' },
};

const FLAG_LABEL = { absent: 'Vắng thi', exempt: 'Miễn' } as const;

const fmtScore = (v: number | string | null) =>
	v == null || v === '' ? null : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 });

const partScore = (score: number | string | null, flag: MyCourseGrade['theory_flag']) =>
	flag ? FLAG_LABEL[flag] : (fmtScore(score) ?? '—');

const docMeta = (doc: MyLessonDocument) =>
	doc.source_type === 'link'
		? 'Liên kết ngoài'
		: `${doc.file_name ?? ''}${doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ''}`;

/** Trạng thái 1 bài: hoàn thành / đang học (kèm số buổi) / chưa học; vòng thực hành không theo dõi ở đây. */
function LessonStatus({ l }: { l: MyLesson }) {
	if (!l.progress_status) return <span className={styles.muted}>{l.lesson_kind === 'rotation' ? 'Vòng thực hành' : '—'}</span>;
	const cfg = PROGRESS[l.progress_status];
	return (
		<span className={styles.statusCell}>
			<Badge tone={cfg.tone}>{cfg.label}</Badge>
			{l.session_count > 0 && (
				<span className={styles.muted}>
					{l.attended_count}/{l.session_count} buổi
				</span>
			)}
		</span>
	);
}

interface Props {
	lessons: MyLesson[];
	grade: MyCourseGrade | null;
	onOpen: (doc: MyLessonDocument, kind: 'lesson') => void;
}

/**
 * Tab "Chương trình" của khóa đang học: khung bài theo chương trình đã ghi danh,
 * mỗi bài kèm tín chỉ, số tiết, trạng thái tính từ điểm danh; đầu tab là dải tổng
 * (bài xong, tín chỉ, tiết, kết quả cả khóa). Bấm 1 bài để xem mô tả + tài liệu.
 */
export function CurriculumPanel({ lessons, grade, onOpen }: Props) {
	const [open, setOpen] = useState<string | null>(null);
	if (lessons.length === 0) return <EmptyState title='Khóa học chưa có bài học nào' />;

	const done = lessons.filter((l) => l.progress_status === 'done');
	const credits = lessons.reduce((t, l) => t + (l.credits || 0), 0);
	const doneCredits = done.reduce((t, l) => t + (l.credits || 0), 0);
	const theory = lessons.reduce((t, l) => t + (l.theory_hours || 0), 0);
	const practice = lessons.reduce((t, l) => t + (l.practice_hours || 0), 0);
	const programs = [...new Set(lessons.map((l) => l.program_name))];
	const hasResult = !!grade && (grade.theory_score != null || grade.practice_score != null || !!grade.theory_flag || !!grade.practice_flag);

	return (
		<div className={styles.wrap}>
			{/* Số bài hoàn thành đã có ở thẻ tóm tắt khóa phía trên — không lặp lại ở đây */}
			<div className={styles.band}>
				{credits > 0 && (
					<div className={styles.metric}>
						<span>Tín chỉ đã xong</span>
						<strong>
							{doneCredits}/{credits}
						</strong>
					</div>
				)}
				<div className={styles.metric}>
					<span>Tiết lý thuyết · thực hành</span>
					<strong>
						{theory} · {practice}
					</strong>
				</div>
				<div className={styles.metric}>
					<span>{hasResult && !grade?.locked ? 'Kết quả khóa (chưa chốt)' : 'Kết quả khóa'}</span>
					{hasResult && grade ? (
						<strong className={styles.result}>
							LT {partScore(grade.theory_score, grade.theory_flag)} · TH {partScore(grade.practice_score, grade.practice_flag)}
							{grade.result && (
								<Badge tone={grade.result === 'pass' ? 'green' : 'red'}>{grade.result === 'pass' ? 'Đạt' : 'Chưa đạt'}</Badge>
							)}
						</strong>
					) : (
						<strong className={styles.muted}>Chưa có điểm</strong>
					)}
				</div>
			</div>

			{programs.map((pg) => {
				const rows = lessons.filter((l) => l.program_name === pg);
				return (
					<section
						key={pg}
						className={styles.group}
						aria-label={pg}
					>
						{programs.length > 1 && <h3 className={styles.groupTitle}>{pg}</h3>}
						<div className={styles.table}>
							<div
								className={`${styles.row} ${styles.head}`}
								aria-hidden='true'
							>
								<span>TT</span>
								<span>Mã</span>
								<span>Tên bài</span>
								<span className={styles.num}>TC</span>
								<span className={styles.num}>LT/TH</span>
								<span>Trạng thái</span>
								<span />
							</div>
							{rows.map((l, i) => {
								const key = `${l.program_id}-${l.id}`;
								const isOpen = open === key;
								return (
									<div
										key={key}
										className={styles.item}
									>
										<button
											type='button'
											className={styles.row}
											aria-expanded={isOpen}
											onClick={() => setOpen(isOpen ? null : key)}
										>
											<span className={styles.no}>{i + 1}</span>
											<span className={styles.code}>{l.code || '—'}</span>
											<span className={styles.title}>
												{l.title}
												{l.documents.length > 0 && <span className={styles.docCount}>{l.documents.length} tài liệu</span>}
											</span>
											<span className={`${styles.num} ${styles.tc}`}>
												<span className={styles.mLabel}>TC </span>
												{l.credits || '—'}
											</span>
											<span className={`${styles.num} ${styles.hours}`}>
												<span className={styles.mLabel}>LT/TH </span>
												{l.theory_hours}/{l.practice_hours}
											</span>
											<LessonStatus l={l} />
											<ChevDSvg className={`${styles.chev} ${isOpen ? styles.chevOpen : ''}`} />
										</button>
										{isOpen && (
											<div className={styles.body}>
												{l.progress_status === 'done' && l.completed_at && (
													<div className={styles.muted}>Hoàn thành ngày {formatDateVN(l.completed_at)}</div>
												)}
												{l.description && <p className={styles.desc}>{l.description}</p>}
												{l.documents.length === 0
													? !l.description && <div className={styles.muted}>Bài học chưa có tài liệu.</div>
													: l.documents.map((doc) => (
															<button
																key={doc.id}
																type='button'
																className={styles.docLink}
																onClick={() => onOpen(doc, 'lesson')}
															>
																{doc.source_type === 'link' ? <LinkSvg /> : <FileSvg />}
																<span>{doc.title}</span>
																<span className={styles.muted}>{docMeta(doc)}</span>
															</button>
														))}
											</div>
										)}
									</div>
								);
							})}
						</div>
					</section>
				);
			})}
			<p className={styles.note}>Trạng thái bài tính theo điểm danh: có mặt đủ các buổi của bài thì bài được tính hoàn thành.</p>
		</div>
	);
}
