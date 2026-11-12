import { useState } from 'react';
import { TrashSvg } from '@/assets/icons';
import { Button, Modal, QuestionImageField } from '../../../shared/components';
import { examApi, type QuestionPayload } from '../api/examApi';
import type { ExamQuestion, QuestionType } from '../types/exam.type';
import styles from '../pages/QuestionBank.module.css';

/** Form thêm / sửa 1 câu hỏi — dùng ở Ngân hàng câu hỏi và trang soạn đề.
 *  `onlyType`: khóa loại câu (đề trắc nghiệm / tự luận chỉ nhận câu cùng loại). */
export function QuestionFormModal({
	question,
	busy,
	onlyType,
	title,
	onClose,
	onSave,
}: {
	question: ExamQuestion | null;
	busy: boolean;
	onlyType?: QuestionType;
	/** Tiêu đề hộp thoại — mặc định "Thêm câu hỏi" / "Sửa câu hỏi" */
	title?: string;
	onClose: () => void;
	onSave: (p: QuestionPayload) => void;
}) {
	const [type, setType] = useState<QuestionType>(question?.question_type ?? onlyType ?? 'single_choice');
	const [text, setText] = useState(question?.question_text ?? '');
	const [points, setPoints] = useState(String(question?.points ?? 1));
	const [options, setOptions] = useState<string[]>(question?.options.length ? question.options : ['', '', '', '']);
	const [correct, setCorrect] = useState(
		question ? Math.max(0, question.options.indexOf(question.correct_option ?? '')) : 0,
	);
	const [image, setImage] = useState<string | null>(question?.image_url ?? null);
	const [error, setError] = useState('');

	const submit = () => {
		if (!text.trim()) return setError('Vui lòng nhập nội dung câu hỏi');
		if (!(Number(points) > 0)) return setError('Điểm phải lớn hơn 0');
		if (type === 'single_choice') {
			const filled = options.map((o) => o.trim());
			if (filled.filter(Boolean).length < 2) return setError('Cần ít nhất 2 phương án');
			if (!filled[correct]) return setError('Phương án đúng không được để trống');
			if (new Set(filled.filter(Boolean)).size !== filled.filter(Boolean).length)
				return setError('Các phương án không được trùng nhau');
		}
		setError('');
		const opts = options.map((o) => o.trim());
		onSave({
			question_type: type,
			question_text: text.trim(),
			points: Number(points),
			options: type === 'single_choice' ? opts.filter(Boolean) : [],
			correct_option: type === 'single_choice' ? opts[correct] : null,
			image_url: image,
		});
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={title ?? (question ? 'Sửa câu hỏi' : 'Thêm câu hỏi')}
			size='lg'
			closeOnBackdrop={false}
			footer={
				<>
					<Button
						variant='secondary'
						onClick={onClose}
					>
						Hủy
					</Button>
					<Button
						loading={busy}
						onClick={submit}
					>
						Lưu
					</Button>
				</>
			}
		>
			<div className={styles.form}>
				<div className={styles.row2}>
					<label className={styles.field}>
						Loại câu hỏi
						<select
							className={styles.input}
							value={type}
							disabled={!!onlyType}
							onChange={(e) => setType(e.target.value as QuestionType)}
						>
							<option value='single_choice'>Trắc nghiệm (1 đáp án đúng)</option>
							<option value='essay'>Tự luận</option>
						</select>
					</label>
					<label className={styles.field}>
						Điểm
						<input
							className={styles.input}
							type='number'
							min={0.5}
							step={0.5}
							value={points}
							onChange={(e) => setPoints(e.target.value)}
						/>
					</label>
				</div>
				<label className={styles.field}>
					Nội dung câu hỏi
					<textarea
						className={styles.input}
						rows={4}
						value={text}
						onChange={(e) => setText(e.target.value)}
					/>
				</label>
				<div className={styles.field}>
					Hình minh họa <span className={styles.hint}>(không bắt buộc)</span>
					<QuestionImageField
						value={image}
						onChange={setImage}
						upload={examApi.uploadQuestionImage}
						disabled={busy}
					/>
				</div>
				{type === 'single_choice' ? (
					<div className={styles.field}>
						Phương án <span className={styles.hint}>(chọn ô tròn ở phương án đúng)</span>
						{options.map((o, i) => (
							<div
								key={i}
								className={styles.optionRow}
							>
								<input
									type='radio'
									name='correct'
									checked={correct === i}
									onChange={() => setCorrect(i)}
									aria-label={`Phương án ${String.fromCharCode(65 + i)} đúng`}
								/>
								<input
									className={styles.input}
									placeholder={`Phương án ${String.fromCharCode(65 + i)}`}
									value={o}
									onChange={(e) => setOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
								/>
								{options.length > 2 && (
									<div
										className={styles.actionBtn}
										title='Bỏ phương án'
										onClick={() => {
											setOptions((prev) => prev.filter((_, j) => j !== i));
											setCorrect((c) => (c === i ? 0 : c > i ? c - 1 : c));
										}}
									>
										<TrashSvg />
									</div>
								)}
							</div>
						))}
						<button
							type='button'
							className={styles.linkBtn}
							onClick={() => setOptions((prev) => [...prev, ''])}
						>
							+ Thêm phương án
						</button>
					</div>
				) : (
					<div className={styles.hint}>Câu tự luận được giảng viên chấm tay sau khi học viên nộp bài.</div>
				)}
				{error && <div className={styles.error}>{error}</div>}
			</div>
		</Modal>
	);
}
