import { useState } from 'react';
import { Badge, Button, FileDropzone, Modal } from '../../../shared/components';
import { notify } from '../../../shared/utils/feedback';
import { examApi } from '../api/examApi';
import { parseQuestions, type ParsedQuestion } from '../utils/parseQuestions';
import { readQuestionFile } from '../utils/readQuestionFile';
import styles from '../pages/QuestionBank.module.css';

interface Row extends ParsedQuestion {
	include: boolean;
}

const FORMAT_HINT = `Câu 1: Nội dung câu hỏi (2 điểm)
A. Phương án    B. Phương án
C. Phương án    D. Phương án
Đáp án: B

Câu 2: Câu tự luận (không có A/B/C/D)`;

export function ImportQuestionsModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
	const [file, setFile] = useState<File | null>(null);
	const [rows, setRows] = useState<Row[] | null>(null);
	const [reading, setReading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [defaultPoints, setDefaultPoints] = useState('1');

	const pick = async (f: File | null) => {
		setFile(f);
		setRows(null);
		if (!f) return;
		setReading(true);
		try {
			const parsed = parseQuestions(await readQuestionFile(f));
			if (!parsed.length) notify.error('Không tìm thấy câu hỏi nào — kiểm tra lại định dạng "Câu 1: ..." trong file');
			setRows(parsed.map((q) => ({ ...q, include: !!q.question_text })));
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

	const save = async () => {
		setSaving(true);
		try {
			const res = await examApi.createQuestionsBulk(
				chosen.map((r) => ({
					question_type: r.question_type,
					question_text: r.question_text,
					options: r.options,
					correct_option: r.correctIndex != null ? r.options[r.correctIndex] : null,
					points: r.points ?? (Number(defaultPoints) || 1),
				})),
			);
			notify.success(`Đã nhập ${res.created} câu hỏi`);
			onImported();
		} catch (e) {
			notify.error((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title='Nhập câu hỏi từ file Word / PDF'
			size='xl'
			closeOnBackdrop={false}
			footer={
				<>
					<Button
						variant='secondary'
						onClick={onClose}
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
					hint='File .docx hoặc .pdf, tối đa 20MB — file được đọc ngay trên máy, không tải lên server'
					maxSizeMB={20}
				/>
				{!rows && !reading && (
					<details>
						<summary className={styles.hint}>Định dạng file được hỗ trợ</summary>
						<pre className={styles.hint}>{FORMAT_HINT}</pre>
						<div className={styles.hint}>
							Đáp án đúng có thể ghi bằng dòng "Đáp án: B", dấu * trước phương án (*B.), bảng "ĐÁP ÁN" cuối file
							(1-A 2-C ...), hoặc in đậm/gạch chân phương án đúng trong Word. Đánh số câu/phương án phải gõ tay (không
							dùng numbering tự động của Word). PDF dạng ảnh scan không đọc được.
						</div>
					</details>
				)}
				{reading && <div className={styles.hint}>Đang đọc file...</div>}

				{rows && rows.length > 0 && (
					<>
						<div className={styles.row2}>
							<div className={styles.hint}>
								Tìm thấy {rows.length} câu · đã chọn {chosen.length}
								{missingAnswer > 0 && (
									<span className={styles.error}> · {missingAnswer} câu trắc nghiệm chưa có đáp án — chọn đáp án hoặc bỏ chọn câu</span>
								)}
							</div>
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
											onChange={(e) => update(i, { include: e.target.checked })}
											aria-label='Chọn nhập câu này'
										/>
										<strong>Câu {r.number ?? i + 1}</strong>
										<Badge tone={r.question_type === 'essay' ? 'purple' : 'blue'}>
											{r.question_type === 'essay' ? 'Tự luận' : 'Trắc nghiệm'}
										</Badge>
										{r.points != null && <span className={styles.muted}>{r.points} điểm</span>}
										{r.include && r.question_type === 'single_choice' && r.correctIndex == null && (
											<Badge tone='red'>Chưa có đáp án</Badge>
										)}
									</div>
									<div className={styles.questionText}>{r.question_text || <em>(trống)</em>}</div>
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
