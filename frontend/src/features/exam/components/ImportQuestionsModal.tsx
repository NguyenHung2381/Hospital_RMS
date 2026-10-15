import { useState } from 'react';
import { EditSvg, TrashSvg } from '@/assets/icons';
import {
	Badge,
	Button,
	FileDropzone,
	Modal,
	QuestionImageField,
	QuestionImageView,
	QuestionText,
} from '../../../shared/components';
import { notify } from '../../../shared/utils/feedback';
import { parseQuestions, type ParsedQuestion } from '../utils/parseQuestions';
import { dataUrlToFile, readQuestionFile } from '../utils/readQuestionFile';
import styles from '../pages/QuestionBank.module.css';

interface Row extends ParsedQuestion {
	include: boolean;
	editing?: boolean;
}

const blankRow = (): Row => ({
	number: null,
	question_text: '',
	question_type: 'single_choice',
	options: ['', '', '', ''],
	correctIndex: null,
	points: null,
	image: null,
	include: true,
	editing: true,
});

// Lỗi khiến câu chưa nhập được (null = hợp lệ) — cùng luật với form Thêm câu hỏi
function rowProblem(r: Row): string | null {
	if (!r.question_text.trim()) return 'Chưa có nội dung';
	if (r.points != null && !(r.points > 0)) return 'Điểm phải lớn hơn 0';
	if (r.question_type !== 'single_choice') return null;
	const opts = r.options.map((o) => o.trim());
	const filled = opts.filter(Boolean);
	if (filled.length < 2) return 'Cần ít nhất 2 phương án';
	if (new Set(filled).size !== filled.length) return 'Phương án trùng nhau';
	if (r.correctIndex == null || !opts[r.correctIndex]) return 'Chưa có đáp án';
	return null;
}

// Hình thay mới trong lúc sửa: giữ dạng data URI như hình trích từ Word, tải lên khi bấm Nhập
const readAsDataUrl = (file: File) =>
	new Promise<{ url: string }>((resolve, reject) => {
		const fr = new FileReader();
		fr.onload = () => resolve({ url: fr.result as string });
		fr.onerror = () => reject(new Error('Không đọc được ảnh'));
		fr.readAsDataURL(file);
	});

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
	const remove = (i: number) => setRows((prev) => prev!.filter((_, j) => j !== i));

	const chosen = rows?.filter((r) => r.include) ?? [];
	const invalid = chosen.filter((r) => rowProblem(r)).length;
	const allChosen = !!rows && rows.filter(allowed).every((r) => r.include);
	const skipped = rows?.filter((r) => !allowed(r)).length ?? 0;
	const imageCount = chosen.filter((r) => r.image).length;

	const save = async () => {
		setSaving(true);
		try {
			await onImport(
				chosen.map((r, i) => {
					// Bỏ phương án trống, đáp án dời theo (rowProblem đã chặn trùng/trống ở đáp án)
					const opts = r.question_type === 'single_choice' ? r.options.map((o) => o.trim()) : [];
					const options = opts.filter(Boolean);
					return {
						question_type: r.question_type,
						question_text: r.question_text.trim(),
						options,
						correctIndex:
							r.correctIndex != null && opts[r.correctIndex] ? options.indexOf(opts[r.correctIndex]) : null,
						points: r.points ?? (Number(defaultPoints) || 1),
						image: r.image ? dataUrlToFile(r.image, `cau-${r.number ?? i + 1}`) : null,
					};
				}),
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
						disabled={!chosen.length || invalid > 0 || reading}
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
								{invalid > 0 && (
									<span className={styles.error}> · {invalid} câu chưa hợp lệ — sửa hoặc bỏ chọn câu</span>
								)}
								{' · '}
								<button
									type='button'
									className={styles.linkBtn}
									onClick={() => setRows((prev) => prev!.map((r) => ({ ...r, include: !allChosen && allowed(r) })))}
								>
									{allChosen ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
								</button>
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
							{rows.map((r, i) => {
								const problem = r.include ? rowProblem(r) : null;
								const opt = (oi: number) => String.fromCharCode(65 + oi);
								return (
									<div
										key={i}
										className={styles.importItem}
										style={{ opacity: r.include || r.editing ? 1 : 0.5 }}
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
											{problem && <Badge tone='red'>{problem}</Badge>}
											<span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
												<button
													type='button'
													className={styles.actionBtn}
													title={r.editing ? 'Xong' : 'Sửa câu này'}
													onClick={() => update(i, { editing: !r.editing })}
												>
													{r.editing ? '✓' : <EditSvg />}
												</button>
												<button
													type='button'
													className={styles.actionBtn}
													title='Xoá câu này khỏi danh sách'
													onClick={() => remove(i)}
												>
													<TrashSvg />
												</button>
											</span>
										</div>

										{r.editing ? (
											<div className={styles.form}>
												<div className={withPoints ? styles.row2 : undefined}>
													<label className={styles.field}>
														Loại câu hỏi
														<select
															className={styles.input}
															value={r.question_type}
															onChange={(e) => {
																const t = e.target.value as Row['question_type'];
																update(i, {
																	question_type: t,
																	include: t === 'single_choice' || !multipleChoiceOnly,
																	...(t === 'single_choice' && r.options.length < 2 && { options: ['', '', '', ''] }),
																});
															}}
														>
															<option value='single_choice'>Trắc nghiệm (1 đáp án đúng)</option>
															<option value='essay'>Tự luận</option>
														</select>
													</label>
													{withPoints && (
														<label className={styles.field}>
															Điểm
															<input
																className={styles.input}
																type='number'
																min={0.5}
																step={0.5}
																placeholder={`Mặc định (${defaultPoints || 1})`}
																value={r.points ?? ''}
																onChange={(e) => update(i, { points: e.target.value === '' ? null : Number(e.target.value) })}
															/>
														</label>
													)}
												</div>
												<label className={styles.field}>
													Nội dung câu hỏi
													<textarea
														className={styles.input}
														rows={3}
														value={r.question_text}
														onChange={(e) => update(i, { question_text: e.target.value })}
													/>
												</label>
												<QuestionImageField
													value={r.image}
													onChange={(image) => update(i, { image })}
													upload={readAsDataUrl}
												/>
												{r.question_type === 'single_choice' && (
													<div className={styles.field}>
														Phương án <span className={styles.hint}>(chọn ô tròn ở phương án đúng)</span>
														{r.options.map((o, oi) => (
															<div
																key={oi}
																className={styles.optionRow}
															>
																<input
																	type='radio'
																	name={`edit-ans-${i}`}
																	checked={r.correctIndex === oi}
																	onChange={() => update(i, { correctIndex: oi })}
																	aria-label={`Phương án ${opt(oi)} đúng`}
																/>
																<input
																	className={styles.input}
																	placeholder={`Phương án ${opt(oi)}`}
																	value={o}
																	onChange={(e) =>
																		update(i, { options: r.options.map((p, j) => (j === oi ? e.target.value : p)) })
																	}
																/>
																{r.options.length > 2 && (
																	<button
																		type='button'
																		className={styles.actionBtn}
																		title='Bỏ phương án'
																		onClick={() =>
																			update(i, {
																				options: r.options.filter((_, j) => j !== oi),
																				correctIndex:
																					r.correctIndex == null || r.correctIndex === oi
																						? null
																						: r.correctIndex - (r.correctIndex > oi ? 1 : 0),
																			})
																		}
																	>
																		<TrashSvg />
																	</button>
																)}
															</div>
														))}
														<button
															type='button'
															className={styles.linkBtn}
															onClick={() => update(i, { options: [...r.options, ''] })}
														>
															+ Thêm phương án
														</button>
													</div>
												)}
											</div>
										) : (
											<>
												<div className={styles.questionText}>
													{r.question_text ? <QuestionText text={r.question_text} /> : <em>(trống)</em>}
												</div>
												<QuestionImageView
													url={r.image}
													compact
												/>
												{r.question_type === 'single_choice' &&
													r.options.map((o, oi) => (
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
																{opt(oi)}. {o}
															</span>
														</label>
													))}
											</>
										)}
									</div>
								);
							})}
							<button
								type='button'
								className={styles.linkBtn}
								onClick={() => setRows((prev) => [...prev!, blankRow()])}
							>
								+ Thêm câu hỏi
							</button>
						</div>
					</>
				)}
			</div>
		</Modal>
	);
}
