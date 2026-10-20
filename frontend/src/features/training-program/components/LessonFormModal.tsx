import { FormField } from '@/shared/components/Input/FormField';
import { Modal, ModalActions } from '@/shared/components';
import { notify } from '../../../shared/utils/feedback';
import { useEffect, useMemo, useState } from 'react';
import { ListSvg, XSvg } from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import {
	createLesson,
	getLessonPrograms,
	setLessonPrograms,
	updateLesson,
} from '../api/trainingProgramApi';
import {
	DURATION_UNIT_LABEL,
	EMPTY_LESSON_FORM,
	LESSON_KIND_LABEL,
	type DurationUnit,
	type LessonFormData,
	type LessonKind,
	type TrainingProgram,
} from '../types/trainingProgram.type';
import styles from '../pages/TrainingPrograms.module.css';

interface Department {
	id: string;
	name: string;
}

// Ô chọn nhiều có gợi ý (gõ để tìm, bấm × để bỏ) — dùng cho chương trình áp dụng
// và khoa được chọn của vòng thực hành.
export function TagPicker<T extends { id: string }>({
	items,
	selectedIds,
	label,
	placeholder,
	emptyText,
	onAdd,
	onRemove,
}: {
	items: T[];
	selectedIds: string[];
	label: (item: T) => string;
	placeholder: string;
	emptyText: string;
	onAdd: (id: string) => void;
	onRemove: (id: string) => void;
}) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	const selected = selectedIds.map((id) => items.find((x) => x.id === id)).filter((x): x is T => !!x);
	const suggestions = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return [];
		return items
			.filter((x) => !selectedIds.includes(x.id) && label(x).toLowerCase().includes(q))
			.slice(0, 20);
	}, [query, items, selectedIds, label]);

	return (
		<div className={styles.tagBox}>
			{selected.map((x) => (
				<span
					key={x.id}
					className={styles.tagPill}
				>
					{label(x)}
					<button
						type='button'
						className={styles.tagRemove}
						onClick={() => onRemove(x.id)}
					>
						<XSvg style={{ width: 10, height: 10 }} />
					</button>
				</span>
			))}
			<input
				className={styles.tagInput}
				placeholder={placeholder}
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onBlur={() => setTimeout(() => setOpen(false), 150)}
			/>
			{open && query.trim() && (
				<div className={styles.tagSuggestions}>
					{suggestions.length === 0 ? (
						<div className={styles.tagSuggestionEmpty}>{emptyText}</div>
					) : (
						suggestions.map((x) => (
							<div
								key={x.id}
								className={styles.tagSuggestionItem}
								onMouseDown={() => {
									onAdd(x.id);
									setQuery('');
									setOpen(false);
								}}
							>
								{label(x)}
							</div>
						))
					)}
				</div>
			)}
		</div>
	);
}

const programLabel = (p: TrainingProgram) => (p.code ? `${p.code} - ${p.name}` : p.name);
const deptLabel = (d: Department) => d.name;

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
	lesson_kind: LessonKind;
	duration_value: number | null;
	duration_unit: DurationUnit | null;
	allow_split: boolean;
	department_ids: string | null;
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
					lesson_kind: lesson.lesson_kind ?? 'theory',
					duration_value: lesson.duration_value != null ? String(Number(lesson.duration_value)) : '',
					duration_unit: lesson.duration_unit ?? 'month',
					allow_split: !!lesson.allow_split,
					department_ids: lesson.department_ids ? lesson.department_ids.split(',') : [],
					program_ids: [],
				}
			: { ...EMPTY_LESSON_FORM, program_ids: defaultProgramId ? [defaultProgramId] : [] },
	);
	const [loadingPrograms, setLoadingPrograms] = useState(mode === 'edit');
	const [errors, setErrors] = useState<Partial<Record<'code' | 'title' | 'duration_value', string>>>({});
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [departments, setDepartments] = useState<Department[]>([]);
	const isRotation = form.lesson_kind === 'rotation';

	useEffect(() => {
		apiClient
			.get<{ data: Department[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => {});
	}, []);

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

	const toggleId = (key: 'program_ids' | 'department_ids', id: string, on: boolean) =>
		setForm((f) => ({ ...f, [key]: on ? [...f[key], id] : f[key].filter((x) => x !== id) }));

	const validate = () => {
		const err: Partial<Record<'code' | 'title' | 'duration_value', string>> = {};
		if (!form.code.trim()) err.code = 'Vui lòng nhập mã bài học';
		if (!form.title.trim()) err.title = 'Vui lòng nhập tên bài học';
		if (form.duration_value.trim() && !(Number(form.duration_value) > 0))
			err.duration_value = 'Thời lượng phải là số dương';
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
		<Modal
			open
			onClose={onClose}
			icon={<ListSvg />}
			title={mode === 'add' ? 'Thêm bài học' : 'Sửa bài học'}
			className={`${styles.modal} ${styles.modalWide}`}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={handleSave}
					loading={saving}
					confirmLabel={mode === 'add' ? 'Thêm bài học' : 'Lưu thay đổi'}
				/>
			}
		>
			{error && <div className={styles.errorBanner}>{error}</div>}

			<div className={styles.formGrid2}>
				<FormField
					label='Mã bài học'
					required
					error={errors.code}
				>
					<input
						className={`${styles.formInput} ${errors.code ? styles.inputError : ''}`}
						value={form.code}
						onChange={(e) => {
							setForm((f) => ({ ...f, code: e.target.value }));
							setErrors((er) => ({ ...er, code: '' }));
						}}
						placeholder='VD: TH_BS_RHM'
					/>
				</FormField>
				<FormField label='Loại'>
					<select
						className={styles.formInput}
						value={form.lesson_kind}
						onChange={(e) => setForm((f) => ({ ...f, lesson_kind: e.target.value as LessonKind }))}
					>
						{Object.entries(LESSON_KIND_LABEL).map(([v, label]) => (
							<option
								key={v}
								value={v}
							>
								{label}
							</option>
						))}
					</select>
				</FormField>

				<FormField
					label='Tên bài học'
					required
					error={errors.title}
					style={{ gridColumn: '1 / -1' }}
				>
					<input
						className={`${styles.formInput} ${errors.title ? styles.inputError : ''}`}
						value={form.title}
						onChange={(e) => {
							setForm((f) => ({ ...f, title: e.target.value }));
							setErrors((er) => ({ ...er, title: '' }));
						}}
						placeholder='VD: Thực hành vòng Răng hàm mặt'
					/>
				</FormField>

				<div
					className={styles.formGroup}
					style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}
				>
					<FormField label='Số tiết lý thuyết'>
						<input
							type='number'
							min={0}
							className={styles.formInput}
							value={form.theory_hours}
							onChange={(e) => setForm((f) => ({ ...f, theory_hours: e.target.value }))}
						/>
					</FormField>
					<FormField label='Số tiết thực hành'>
						<input
							type='number'
							min={0}
							className={styles.formInput}
							value={form.practice_hours}
							onChange={(e) => setForm((f) => ({ ...f, practice_hours: e.target.value }))}
						/>
					</FormField>
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

				<FormField label='Số tín chỉ'>
					<input
						type='number'
						min={0}
						className={styles.formInput}
						value={form.credits}
						onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
					/>
				</FormField>
				<FormField
					label='Thời lượng'
					error={errors.duration_value}
				>
					<div style={{ display: 'flex', gap: 'var(--space-2)' }}>
						<input
							type='number'
							min={0}
							step='0.5'
							className={`${styles.formInput} ${errors.duration_value ? styles.inputError : ''}`}
							value={form.duration_value}
							onChange={(e) => {
								setForm((f) => ({ ...f, duration_value: e.target.value }));
								setErrors((er) => ({ ...er, duration_value: '' }));
							}}
							placeholder='VD: 3'
						/>
						<select
							className={styles.formInput}
							style={{ maxWidth: 110 }}
							value={form.duration_unit}
							onChange={(e) => setForm((f) => ({ ...f, duration_unit: e.target.value as DurationUnit }))}
						>
							{Object.entries(DURATION_UNIT_LABEL).map(([v, label]) => (
								<option
									key={v}
									value={v}
								>
									{label}
								</option>
							))}
						</select>
					</div>
				</FormField>

				<FormField label='Trạng thái'>
					<select
						className={styles.formInput}
						value={form.is_active ? '1' : '0'}
						onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}
					>
						<option value='1'>Hoạt động</option>
						<option value='0'>Ngưng hoạt động</option>
					</select>
				</FormField>

				{isRotation && (
					<div
						className={styles.formGroup}
						style={{ gridColumn: '1 / -1' }}
					>
						<label className={styles.formLabel}>Khoa được chọn cho vòng này</label>
						<TagPicker
							items={departments}
							selectedIds={form.department_ids}
							label={deptLabel}
							placeholder='Gõ tên khoa...'
							emptyText='Không tìm thấy khoa phù hợp'
							onAdd={(id) => toggleId('department_ids', id, true)}
							onRemove={(id) => toggleId('department_ids', id, false)}
						/>
						<label
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								marginTop: 'var(--space-2)',
								cursor: 'pointer',
							}}
						>
							<input
								type='checkbox'
								checked={form.allow_split}
								onChange={(e) => setForm((f) => ({ ...f, allow_split: e.target.checked }))}
							/>
							Chia thời gian vòng cho nhiều khoa (VD: vòng chuyên khoa lẻ — mỗi khoa 1–1,5 tuần)
						</label>
						<div className={styles.hint}>
							{form.allow_split
								? 'Học viên đi lần lượt nhiều khoa trong danh sách, tổng thời gian bằng thời lượng vòng.'
								: 'Học viên chọn 1 khoa trong danh sách cho cả vòng.'}
						</div>
					</div>
				)}

				<div
					className={styles.formGroup}
					style={{ gridColumn: '1 / -1' }}
				>
					<label className={styles.formLabel}>Thuộc chương trình đào tạo (gõ để tìm, 1 bài có thể thuộc nhiều CTĐT)</label>
					<TagPicker
						items={programs}
						selectedIds={form.program_ids}
						label={programLabel}
						placeholder='Gõ mã hoặc tên chương trình...'
						emptyText='Không tìm thấy chương trình phù hợp'
						onAdd={(id) => toggleId('program_ids', id, true)}
						onRemove={(id) => toggleId('program_ids', id, false)}
					/>
					<div className={styles.hint}>
						{loadingPrograms
							? 'Đang tải danh sách chương trình đã gắn...'
							: 'Gõ vào ô trên rồi chọn chương trình từ danh sách gợi ý. Bấm × để bỏ.'}
					</div>
				</div>

				<FormField
					label='Mô tả'
					style={{ gridColumn: '1 / -1' }}
				>
					<textarea
						className={styles.formTextarea}
						rows={3}
						value={form.description}
						onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
					/>
				</FormField>
			</div>
		</Modal>
	);
}
