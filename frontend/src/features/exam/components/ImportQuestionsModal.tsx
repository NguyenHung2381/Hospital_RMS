import { useState } from 'react';
import { Badge, Button, FileDropzone, Modal, QuestionImageView, QuestionText } from '../../../shared/components';
import { notify } from '../../../shared/utils/feedback';
import { parseQuestions, type ParsedQuestion } from '../utils/parseQuestions';
import { dataUrlToFile, readQuestionFile } from '../utils/readQuestionFile';
import styles from '../pages/QuestionBank.module.css';

interface Row extends ParsedQuestion {
	include: boolean;
}

/** Câu đã chọn để nhập — image là File (hình trích từ Word), người gọi tự tải lên. */
export interface ImportedQuestion {
	question_type: ParsedQuestion['question_type'];
	question_text: string;
	options: string[];
	correctIndex: number | null;
	points: number;
	image: File | null;
}

const FORMAT_HINT = `Câu 1: Nội dung câu hỏi (2 điểm)
[hình minh hoạ — chèn ngay dưới câu hỏi, tuỳ chọn]
A. Phương án    B. Phương án
C. Phương án    D. Phương án
Đáp án: B

Câu 2: Câu tự luận (không có A/B/C/D)`;

/**
 * Đọc câu hỏi từ file Word/PDF ngay trên trình duyệt, cho xem lại / chọn đáp án,
 * rồi trả danh sách câu đã chọn cho onImport (ném lỗi = giữ modal mở).
 * Dùng cho ngân hàng câu hỏi Đào tạo và bài test cuối buổi Hội nghị.
 */
export function ImportQuestionsModal({
	onClose,
	onImport,
	multipleChoiceOnly = false,
	withPoints = true,
}: {
	onClose: () => void;
	onImport: (questions: ImportedQuestion[]) => Promise<void>;
	/** Chỉ nhận câu trắc nghiệm (bài test hội nghị) — câu tự luận trong file bị bỏ qua */
	multipleChoiceOnly?: boolean;
	/** Có điểm từng câu không (bài test hội nghị chỉ đếm số câu đúng) */
	withPoints?: boolean;
}) {
	const [file, setFile] = useState<File | null>(null);
	const [rows, setRows] = useState<Row[] | null>(null);
	const [reading, setReading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [defaultPoints, setDefaultPoints] = useState('1');

	const allowed = (q: ParsedQuestion) => !multipleChoiceOnly || q.question_type === 'single_choice';

	const pick = async (f: File | null) => {
		setFile(f);
		setRows(null);
		if (!f) return;
		setReading(true);
		try {
			const parsed = parseQuestions(await readQuestionFile(f));
			if (!parsed.length) notify.error('Không tìm thấy câu hỏi nào — kiểm tra lại định dạng "Câu 1: ..." trong file');
			setRows(parsed.map((q) => ({ ...q, include: !!q.question_text && allowed(q) })));
		} catch (e) {
			notify.error((e as Error).message || 'Không đọc được file');
		} finally {
			setReading(false);
		}
	};

	const update = (i: number, patch: Partial<Row>) =>
		setRows((prev) => prev!.map((r, j) => (j === i ? { ...r, ...patch } : r)));

	const chosen = rows?.filter((r) => r.include) ?? [];
	const missingAnswer = chosen.filter((r) => r.question_type === 'single_choice' && r.correctIndex == null).length;
	const skipped = rows?.filter((r) => !allowed(r)).length ?? 0;
	const imageCount = chosen.filter((r) => r.image).length;

	const save = async () => {
		setSaving(true);
		try {
			await onImport(
				chosen.map((r, i) => ({
					question_type: r.question_type,
					question_text: r.question_text,
					options: r.options,
					correctIndex: r.correctIndex,
					points: r.points ?? (Number(defaultPoints) || 1),
					image: r.image ? dataUrlToFile(r.image, `cau-${r.number ?? i + 1}`) : null,
				})),
			);
		} catch (e) {
			notify.error((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={saving ? () => {} : onClose}
			title='Nhập câu hỏi từ file Word / PDF'
			size='xl'
			closeOnBackdrop={false}
			footer={
				<>
					<Button
						variant='secondary'
						onClick={onClose}
						disabled={saving}
					>
						Huỷ
					</Button>
					<Button
						loading={saving}
						disabled={!chosen.length || missingAnswer > 0}
						onClick={() => void save()}
					>
						Nhập {chosen.length} câu
					</Button>
				</>
			}
		>
			<div className={styles.form}>
				<FileDropzone
					value={file}
					onChange={(f) => void pick(f)}
					accept='.docx,.pdf'
					hint='File .docx hoặc .pdf, tối đa 20MB — file được đọc ngay trên máy, chỉ hình minh hoạ được tải lên khi bấm Nhập'
					maxSizeMB={20}
				/>
				{!rows && !reading && (
					<details>
						<summary className={styles.hint}>Định dạng file được hỗ trợ</summary>
						<pre className={styles.hint}>
							{multipleChoiceOnly ? FORMAT_HINT.split('\n\nCâu 2')[0] : FORMAT_HINT}
						</pre>
						<div className={styles.hint}>
							Đáp án đúng có thể ghi bằng dòng "Đáp án: B", dấu * trước phương án (*B.), bảng "ĐÁP ÁN" cuối file
							(1-A 2-C ...), hoặc in đậm/gạch chân phương án đúng trong Word. Đánh số câu/phương án phải gõ tay (không
							dùng numbering tự động của Word). Hình chèn trong Word (PNG/JPEG/GIF) được lấy làm hình minh hoạ của câu
							chứa nó — PDF không lấy được hình. PDF dạng ảnh scan không đọc được.
							{multipleChoiceOnly && ' Bài test chỉ nhận câu trắc nghiệm — câu tự luận trong file sẽ bị bỏ qua.'}
						</div>
					</details>
				)}
				{reading && <div className={styles.hint}>Đang đọc file...</div>}

				{rows && rows.length > 0 && (
					<>
						<div className={withPoints ? styles.row2 : undefined}>
							<div className={styles.hint}>
								Tìm thấy {rows.length} câu · đã chọn {chosen.length}
								{imageCount > 0 && ` · ${imageCount} câu có hình`}
								{skipped > 0 && ` · bỏ qua ${skipped} câu tự luận`}
								{missingAnswer > 0 && (
									<span className={styles.error}> · {missingAnswer} câu trắc nghiệm chưa có đáp án — chọn đáp án hoặc bỏ chọn câu</span>
								)}
							</div>
							{withPoints && (
								<label className={styles.field}>
									Điểm mặc định (câu không ghi điểm)
									<input
										className={styles.input}
										type='number'
										min={0.5}
										step={0.5}
										value={defaultPoints}
										onChange={(e) => setDefaultPoints(e.target.value)}
									/>
								</label>
							)}
						</div>
						<div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
							{rows.map((r, i) => (
								<div
									key={i}
									className={styles.importItem}
									style={{ opacity: r.include ? 1 : 0.5 }}
								>
									<div className={styles.optionRow}>
										<input
											type='checkbox'
											checked={r.include}
											disabled={!allowed(r)}
											onChange={(e) => update(i, { include: e.target.checked })}
											aria-label='Chọn nhập câu này'
										/>
										<strong>Câu {r.number ?? i + 1}</strong>
										<Badge tone={r.question_type === 'essay' ? 'purple' : 'blue'}>
											{r.question_type === 'essay' ? 'Tự luận' : 'Trắc nghiệm'}
										</Badge>
										{withPoints && r.points != null && <span className={styles.muted}>{r.points} điểm</span>}
										{!allowed(r) && <Badge tone='gray'>Bỏ qua — bài test chỉ nhận trắc nghiệm</Badge>}
										{r.include && r.question_type === 'single_choice' && r.correctIndex == null && (
											<Badge tone='red'>Chưa có đáp án</Badge>
										)}
									</div>
									<div className={styles.questionText}>{r.question_text ? <QuestionText text={r.question_text} /> : <em>(trống)</em>}</div>
									{r.image && (
										<div className={styles.optionRow}>
											<QuestionImageView
												url={r.image}
												compact
											/>
											{r.include && (
												<button
													type='button'
													className={styles.linkBtn}
													onClick={() => update(i, { image: null })}
												>
													Bỏ hình
												</button>
											)}
										</div>
									)}
									{r.options.map((o, oi) => (
										<label
											key={oi}
											className={styles.optionRow}
										>
											<input
												type='radio'
												name={`ans-${i}`}
												checked={r.correctIndex === oi}
												onChange={() => update(i, { correctIndex: oi })}
											/>
											<span className={r.correctIndex === oi ? styles.optionCorrect : styles.muted}>
												{String.fromCharCode(65 + oi)}. {o}
											</span>
										</label>
									))}
								</div>
							))}
						</div>
					</>
				)}
			</div>
		</Modal>
	);
}
