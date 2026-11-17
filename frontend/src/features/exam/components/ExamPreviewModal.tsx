import { useState } from 'react';
import { ClockSvg } from '@/assets/icons';
import { Button, Modal, QuestionImageView, QuestionText } from '../../../shared/components';
import type { ExamQuestion } from '../types/exam.type';
import { fmtPoints, tally } from '../utils/examBuilder';
import styles from '../pages/ExamBuilder.module.css';

const LETTER = (i: number) => String.fromCharCode(65 + i);

/** Xem trước đề như học viên thấy khi làm bài (không lộ đáp án, trừ khi bật "Hiện đáp án"). */
export function ExamPreviewModal({
	title,
	durationMinutes,
	questions,
	note,
	onResample,
	onClose,
}: {
	title: string;
	durationMinutes: number;
	questions: ExamQuestion[];
	/** Chú thích trên đầu (vd "Đề mẫu bốc thử — mỗi học viên nhận bộ câu khác") */
	note?: string;
	/** Đề bốc ngẫu nhiên: bốc thử bộ câu khác */
	onResample?: () => void;
	onClose: () => void;
}) {
	const [showAnswers, setShowAnswers] = useState(false);
	const t = tally(questions);
	return (
		<Modal
			open
			onClose={onClose}
			title='Xem trước đề thi'
			size='xl'
			footer={
				<div className={styles.pickerFooter}>
					<label className={styles.checkLabel}>
						<input
							type='checkbox'
							checked={showAnswers}
							onChange={(e) => setShowAnswers(e.target.checked)}
						/>
						Hiện đáp án đúng
					</label>
					<div className={styles.row}>
						{onResample && (
							<Button
								variant='secondary'
								onClick={onResample}
							>
								Bốc thử bộ khác
							</Button>
						)}
						<Button onClick={onClose}>Đóng</Button>
					</div>
				</div>
			}
		>
			<div className={styles.previewPaper}>
				<div className={styles.previewHead}>
					<div className={styles.previewTitle}>{title || 'Đề thi chưa đặt tên'}</div>
					<div className={styles.previewMeta}>
						<span>
							<ClockSvg /> {durationMinutes} phút
						</span>
						<span>{t.count} câu</span>
						<span>{fmtPoints(t.points)} điểm (quy về thang 10)</span>
					</div>
					{note && <div className={styles.previewNote}>{note}</div>}
				</div>
				{questions.length === 0 ? (
					<div className={styles.emptyMini}>Đề chưa có câu hỏi nào.</div>
				) : (
					questions.map((q, i) => (
						<div
							key={`${q.id}-${i}`}
							className={styles.previewQuestion}
						>
							<div className={styles.previewLabel}>
								<strong>Câu {i + 1}.</strong> <QuestionText text={q.question_text} />{' '}
								<span className={styles.muted}>({fmtPoints(q.points)} điểm)</span>
							</div>
							{q.image_url && <QuestionImageView url={q.image_url} />}
							{q.question_type === 'essay' ? (
								<div className={styles.previewEssay}>Học viên nhập câu trả lời tự luận tại đây…</div>
							) : (
								<div className={styles.previewOptions}>
									{q.options.map((o, oi) => (
										<div
											key={oi}
											className={`${styles.previewOption} ${showAnswers && o === q.correct_option ? styles.previewOptionCorrect : ''}`}
										>
											<span className={styles.optionLetter}>{LETTER(oi)}</span>
											{o}
										</div>
									))}
								</div>
							)}
						</div>
					))
				)}
			</div>
		</Modal>
	);
}
