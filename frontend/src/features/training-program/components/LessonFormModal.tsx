import { notify } from '../../../shared/utils/feedback';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckSvg, ListSvg, XSvg } from '@/assets/icons';
import {
	createLesson,
	getLessonPrograms,
	setLessonPrograms,
	updateLesson,
} from '../api/trainingProgramApi';
import { EMPTY_LESSON_FORM, type LessonFormData, type TrainingProgram } from '../types/trainingProgram.type';
import styles from '../pages/TrainingPrograms.module.css';

// Chấp nhận cả ProgramLessonLink (1 lượt gắn, có lesson_id) lẫn Lesson thuần
// (đổi tên id -> lesson_id) — dùng chung cho form sửa mở từ trong 1 chương
// trình lẫn từ màn "Bài học" độc lập (ngoài phạm vi chương trình nào).
export type EditableLesson = {
	lesson_id: string;
	code: string;
	title: string;
	description: string | null;
	is_active: boolean;
	theory_hours: number;
	practice_hours: number;
	credits: number;
};

export function LessonFormModal({
	mode,
	lesson,
	programs,
	defaultProgramId,
	onClose,
	onSaved,
}: {
	mode: 'add' | 'edit';
	lesson?: EditableLesson;
	programs: TrainingProgram[];
	defaultProgramId?: string;
	onClose: () => void;
	onSaved: () => void;
}) {
	const [form, setForm] = useState<LessonFormData>(
		lesson
			? {
					code: lesson.code,
					title: lesson.title,
					description: lesson.description ?? '',
					is_active: lesson.is_active,
					theory_hours: String(lesson.theory_hours ?? 0),
					practice_hours: String(lesson.practice_hours ?? 0),
					credits: String(lesson.credits ?? 0),
					program_ids: [],
				}
			: { ...EMPTY_LESSON_FORM, program_ids: defaultProgramId ? [defaultProgramId] : [] },
	);
	const [loadingPrograms, setLoadingPrograms] = useState(mode === 'edit');
	const [errors, setErrors] = useState<Partial<Record<'code' | 'title', string>>>({});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [query, setQuery] = useState('');
	const [showSuggestions, setShowSuggestions] = useState(false);
	const boxRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (mode !== 'edit' || !lesson) return;
		let alive = true;
		getLessonPrograms(lesson.lesson_id)
			.then((ids) => alive && setForm((f) => ({ ...f, program_ids: ids })))
			.finally(() => alive && setLoadingPrograms(false));
		return () => {
			alive = false;
		};
	}, [mode, lesson]);

	const totalHours = (Number(form.theory_hours) || 0) + (Number(form.practice_hours) || 0);

	const selectedPrograms = useMemo(
		() => form.program_ids.map((id) => programs.find((p) => p.id === id)).filter((p): p is TrainingProgram => !!p),
		[form.program_ids, programs],
	);

	const suggestions = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return programs
			.filter((p) => !form.program_ids.includes(p.id))
			.filter((p) => p.name.toLowerCase().includes(q) || (p.code ?? '').toLowerCase().includes(q))
			.slice(0, 20);
	}, [query, programs, form.program_ids]);

	const addProgram = (id: string) => {
		setForm((f) => ({ ...f, program_ids: [...f.program_ids, id] }));
		setQuery('');
		setShowSuggestions(false);
	};

	const removeProgram = (id: string) => {
		setForm((f) => ({ ...f, program_ids: f.program_ids.filter((x) => x !== id) }));
	};

	const validate = () => {
		const err: Partial<Record<'code' | 'title', string>> = {};
		if (!form.code.trim()) err.code = 'Vui lòng nhập mã bài học';
		if (!form.title.trim()) err.title = 'Vui lòng nhập tên bài học';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	const handleSave = async () => {
		if (!validate()) return;
		setSaving(true);
		setError('');
		try {
			const lessonId = mode === 'edit' && lesson ? lesson.lesson_id : (await createLesson(form)).id;
			if (mode === 'edit') await updateLesson(lessonId, form);
			await setLessonPrograms(lessonId, form.program_ids);
			notify.success(mode === 'edit' ? 'Đã cập nhật bài học' : 'Đã thêm bài học');
			onSaved();
			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Lưu bài học thất bại');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalWide}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIcon}>
						<ListSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>{mode === 'add' ? 'Thêm bài học' : 'Sửa bài học'}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					{error && <div className={styles.errorBanner}>{error}</div>}

					<div className={styles.formGrid2}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Mã bài học <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.code ? styles.inputError : ''}`}
								value={form.code}
								onChange={(e) => {
									setForm((f) => ({ ...f, code: e.target.value }));
									setErrors((er) => ({ ...er, code: '' }));
								}}
								placeholder='VD: TH_BS_RHM'
							/>
							{errors.code && <div className={styles.fieldError}>{errors.code}</div>}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trạng thái</label>
							<select
								className={styles.formInput}
								value={form.is_active ? '1' : '0'}
								onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}
							>
								<option value='1'>Hoạt động</option>
								<option value='0'>Ngưng hoạt động</option>
							</select>
						</div>

						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>
								Tên bài học <span className={styles.required}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${errors.title ? styles.inputError : ''}`}
								value={form.title}
								onChange={(e) => {
									setForm((f) => ({ ...f, title: e.target.value }));
									setErrors((er) => ({ ...er, title: '' }));
								}}
								placeholder='VD: Thực hành vòng Răng hàm mặt'
							/>
							{errors.title && <div className={styles.fieldError}>{errors.title}</div>}
						</div>

						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}
						>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Số tiết lý thuyết</label>
								<input
									type='number'
									min={0}
									className={styles.formInput}
									value={form.theory_hours}
									onChange={(e) => setForm((f) => ({ ...f, theory_hours: e.target.value }))}
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Số tiết thực hành</label>
								<input
									type='number'
									min={0}
									className={styles.formInput}
									value={form.practice_hours}
									onChange={(e) => setForm((f) => ({ ...f, practice_hours: e.target.value }))}
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Tổng số tiết</label>
								<input
									className={styles.formInput}
									value={totalHours}
									disabled
									style={{ opacity: 0.7 }}
								/>
								<div className={styles.hint}>Tự tính từ lý thuyết + thực hành</div>
							</div>
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Số tín chỉ</label>
							<input
								type='number'
								min={0}
								className={styles.formInput}
								value={form.credits}
								onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
							/>
						</div>

						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Thuộc chương trình đào tạo (gõ để tìm, 1 bài có thể thuộc nhiều CTĐT)</label>
							<div
								className={styles.tagBox}
								ref={boxRef}
							>
								{selectedPrograms.map((p) => (
									<span
										key={p.id}
										className={styles.tagPill}
									>
										{p.code ? `${p.code} - ${p.name}` : p.name}
										<button
											type='button'
											className={styles.tagRemove}
											onClick={() => removeProgram(p.id)}
										>
											<XSvg style={{ width: 10, height: 10 }} />
										</button>
									</span>
								))}
								<input
									className={styles.tagInput}
									placeholder='Gõ mã hoặc tên chương trình...'
									value={query}
									onChange={(e) => {
										setQuery(e.target.value);
										setShowSuggestions(true);
									}}
									onFocus={() => setShowSuggestions(true)}
									onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
								/>
								{showSuggestions && query.trim() && (
									<div className={styles.tagSuggestions}>
										{suggestions.length === 0 ? (
											<div className={styles.tagSuggestionEmpty}>Không tìm thấy chương trình phù hợp</div>
										) : (
											suggestions.map((p) => (
												<div
													key={p.id}
													className={styles.tagSuggestionItem}
													onMouseDown={() => addProgram(p.id)}
												>
													{p.code ? `${p.code} - ${p.name}` : p.name}
												</div>
											))
										)}
									</div>
								)}
							</div>
							<div className={styles.hint}>
								{loadingPrograms
									? 'Đang tải danh sách chương trình đã gắn...'
									: 'Gõ vào ô trên rồi chọn chương trình từ danh sách gợi ý. Bấm × để bỏ.'}
							</div>
						</div>

						<div
							className={styles.formGroup}
							style={{ gridColumn: '1 / -1' }}
						>
							<label className={styles.formLabel}>Mô tả</label>
							<textarea
								className={styles.formTextarea}
								rows={3}
								value={form.description}
								onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
							/>
						</div>
					</div>
				</div>

				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={saving}
					>
						Huỷ
					</button>
					<button
						className={styles.btnConfirm}
						onClick={handleSave}
						disabled={saving}
					>
						{saving ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm bài học' : 'Lưu thay đổi'}
					</button>
				</div>
			</div>
		</div>
	);
}
