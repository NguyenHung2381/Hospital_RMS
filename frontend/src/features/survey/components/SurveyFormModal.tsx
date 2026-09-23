import { useState } from 'react';
import { CheckSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import type { SimpleRole } from '../api/surveyApi';
import type {
	QuestionFormData,
	QuestionType,
	Survey,
	SurveyFormData,
	SurveyStatus,
} from '../types/survey.type';
import { EMPTY_FORM } from '../hooks/useSurvey';
import styles from '../pages/Survey.module.css';

const STATUS_OPTIONS: { value: SurveyStatus; label: string }[] = [
	{ value: 'draft', label: 'Nháp' },
	{ value: 'active', label: 'Đang mở' },
	{ value: 'closed', label: 'Đã đóng' },
];

const QUESTION_TYPE_OPTIONS: { value: QuestionType; label: string }[] = [
	{ value: 'single_choice', label: 'Chọn 1 đáp án' },
	{ value: 'multi_choice', label: 'Chọn nhiều đáp án' },
	{ value: 'text', label: 'Tự luận ngắn' },
];

let tempSeq = 0;
const nextTempId = () => `new-${Date.now()}-${tempSeq++}`;

function toForm(item?: Survey): SurveyFormData {
	if (!item) return EMPTY_FORM;
	return {
		title: item.title,
		description: item.description ?? '',
		status: item.status,
		target_role: item.target_role ?? '',
		questions: (item.questions ?? []).map((q) => ({
			tempId: q.id,
			question_text: q.question_text,
			question_type: q.question_type,
			options: q.options && q.options.length ? q.options : [''],
		})),
	};
}

export function SurveyFormModal({
	mode,
	item,
	roles,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	item?: Survey;
	roles: SimpleRole[];
	onClose: () => void;
	onSave: (d: SurveyFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<SurveyFormData>(toForm(item));
	const [errors, setErrors] = useState<Partial<Record<'title', string>>>({});

	const setField = <K extends keyof SurveyFormData>(k: K, val: SurveyFormData[K]) => {
		setForm((f) => ({ ...f, [k]: val }));
		setErrors((er) => ({ ...er, [k as string]: '' }));
	};

	const addQuestion = () =>
		setForm((f) => ({
			...f,
			questions: [
				...f.questions,
				{ tempId: nextTempId(), question_text: '', question_type: 'single_choice', options: [''] },
			],
		}));

	const removeQuestion = (tempId: string) =>
		setForm((f) => ({ ...f, questions: f.questions.filter((q) => q.tempId !== tempId) }));

	const updateQuestion = (tempId: string, patch: Partial<QuestionFormData>) =>
		setForm((f) => ({
			...f,
			questions: f.questions.map((q) => (q.tempId === tempId ? { ...q, ...patch } : q)),
		}));

	const addOption = (tempId: string) =>
		updateQuestion(tempId, {
			options: [...(form.questions.find((q) => q.tempId === tempId)?.options ?? []), ''],
		});

	const setOption = (tempId: string, idx: number, val: string) => {
		const q = form.questions.find((x) => x.tempId === tempId);
		if (!q) return;
		const options = [...q.options];
		options[idx] = val;
		updateQuestion(tempId, { options });
	};

	const removeOption = (tempId: string, idx: number) => {
		const q = form.questions.find((x) => x.tempId === tempId);
		if (!q) return;
		updateQuestion(tempId, { options: q.options.filter((_, i) => i !== idx) });
	};

	const validate = () => {
		const err: Partial<Record<'title', string>> = {};
		if (!form.title.trim()) err.title = 'Vui lòng nhập tên khảo sát';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	const handleSave = () => {
		if (!validate()) return;
		onSave(form);
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalLg}`}>
				<div className={styles.modalHeader}>
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Tạo khảo sát mới' : 'Chỉnh sửa khảo sát'}
						</div>
						<div className={styles.modalSub}>
							{mode === 'add' ? 'Thiết lập câu hỏi khảo sát' : `Cập nhật — ${item?.title}`}
						</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>
							Tên khảo sát <span className={styles.required}>*</span>
						</label>
						<input
							className={`${styles.formInput} ${errors.title ? styles.inputError : ''}`}
							value={form.title}
							onChange={(e) => setField('title', e.target.value)}
							placeholder='VD: Khảo sát mức độ hài lòng khóa đào tạo'
						/>
						{errors.title && <div className={styles.fieldError}>{errors.title}</div>}
					</div>

					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trạng thái</label>
							<select
								className={styles.formInput}
								value={form.status}
								onChange={(e) => setField('status', e.target.value as SurveyStatus)}
							>
								{STATUS_OPTIONS.map((s) => (
									<option
										key={s.value}
										value={s.value}
									>
										{s.label}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Đối tượng (vai trò)</label>
							<select
								className={styles.formInput}
								value={form.target_role}
								onChange={(e) => setField('target_role', e.target.value)}
							>
								<option value=''>— Tất cả mọi người —</option>
								{roles.map((r) => (
									<option
										key={r.id}
										value={r.id}
									>
										{r.name}
									</option>
								))}
							</select>
						</div>
					</div>

					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Mô tả</label>
						<textarea
							className={styles.formTextarea}
							value={form.description}
							onChange={(e) => setField('description', e.target.value)}
							rows={2}
							placeholder='Mục đích, hướng dẫn thêm...'
						/>
					</div>

					<div className={styles.itemsSection}>
						<div className={styles.itemsSectionHeader}>
							<label className={styles.formLabel}>Câu hỏi</label>
						</div>
						{form.questions.length === 0 && (
							<div className={styles.emptyItems}>Chưa có câu hỏi nào</div>
						)}
						{form.questions.map((q, qi) => (
							<div
								key={q.tempId}
								className={styles.questionCard}
							>
								<div className={styles.questionHeadRow}>
									<input
										className={styles.formInput}
										placeholder={`Câu hỏi ${qi + 1}`}
										value={q.question_text}
										onChange={(e) => updateQuestion(q.tempId, { question_text: e.target.value })}
									/>
									<select
										className={styles.formInput}
										value={q.question_type}
										onChange={(e) =>
											updateQuestion(q.tempId, {
												question_type: e.target.value as QuestionType,
												options: e.target.value === 'text' ? [] : q.options.length ? q.options : [''],
											})
										}
									>
										{QUESTION_TYPE_OPTIONS.map((t) => (
											<option
												key={t.value}
												value={t.value}
											>
												{t.label}
											</option>
										))}
									</select>
									<button
										type='button'
										className={styles.itemRemoveBtn}
										onClick={() => removeQuestion(q.tempId)}
										title='Xoá câu hỏi'
									>
										<TrashSvg />
									</button>
								</div>

								{q.question_type !== 'text' && (
									<div className={styles.optionsList}>
										{q.options.map((opt, oi) => (
											<div
												key={oi}
												className={styles.optionRow}
											>
												<input
													className={styles.formInput}
													placeholder={`Lựa chọn ${oi + 1}`}
													value={opt}
													onChange={(e) => setOption(q.tempId, oi, e.target.value)}
												/>
												<button
													type='button'
													className={styles.itemRemoveBtn}
													onClick={() => removeOption(q.tempId, oi)}
													title='Xoá lựa chọn'
												>
													<TrashSvg />
												</button>
											</div>
										))}
										<button
											type='button'
											className={styles.addOptionBtn}
											onClick={() => addOption(q.tempId)}
										>
											+ Thêm lựa chọn
										</button>
									</div>
								)}
							</div>
						))}
						<button
							type='button'
							className={styles.addItemBtn}
							onClick={addQuestion}
						>
							<PlusSvg /> Thêm câu hỏi
						</button>
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirm}
						onClick={handleSave}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Tạo khảo sát' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
