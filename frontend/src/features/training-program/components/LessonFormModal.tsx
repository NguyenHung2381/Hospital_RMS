import { FormField } from '@/shared/components/Input/FormField';
import m from '@/shared/components/Modal/Modal.module.css';
import { CfgField, CustomFields, useFormConfig, type CustomValues } from '@/shared/formConfig';
import { allowedOptions } from '@/shared/formConfig/allowedOptions';
import { Modal, ModalActions } from '@/shared/components';
import { notify } from '../../../shared/utils/feedback';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevDSvg, ListSvg, XSvg } from '@/assets/icons';
import { removeDiacritics } from '@/shared/utils/helper';
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

/** Tìm không phân biệt hoa thường / dấu: "dieu duong" khớp "Điều dưỡng". */
const fold = (s: string) => removeDiacritics(s).toLowerCase();

const MENU_GAP = 4;
const MENU_MAX_H = 280;

// Ô chọn nhiều có gợi ý (gõ để tìm, bấm × để bỏ) — dùng cho chương trình áp dụng
// và khoa được chọn của vòng thực hành. Menu render qua portal (position: fixed)
// để không bị modal (overflow cuộn) cắt mất, tự lật lên trên khi phía dưới thiếu chỗ.
export function TagPicker<T extends { id: string }>({
	items,
	selectedIds,
	label,
	code,
	placeholder,
	emptyText,
	onAdd,
	onRemove,
}: {
	items: T[];
	selectedIds: string[];
	label: (item: T) => string;
	/** Mã (nếu có) — hiện tách riêng trước tên, cũng dùng để tìm. */
	code?: (item: T) => string | null | undefined;
	placeholder: string;
	emptyText: string;
	onAdd: (id: string) => void;
	onRemove: (id: string) => void;
}) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);
	// Dòng đang tô bằng phím ↑/↓ (Enter để chọn)
	const [active, setActive] = useState(0);
	const [pos, setPos] = useState<{
		left: number;
		width: number;
		maxHeight: number;
		top?: number;
		bottom?: number;
	} | null>(null);
	const boxRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const selected = selectedIds.map((id) => items.find((x) => x.id === id)).filter((x): x is T => !!x);
	const suggestions = useMemo(() => {
		const q = fold(query.trim());
		const rest = items.filter((x) => !selectedIds.includes(x.id));
		// Chưa gõ gì → hiện toàn bộ để chọn như select (menu có cuộn)
		return q ? rest.filter((x) => fold(`${code?.(x) ?? ''} ${label(x)}`).includes(q)) : rest;
	}, [query, items, selectedIds, label, code]);
	const activeIdx = Math.min(active, suggestions.length - 1);

	const place = useCallback(() => {
		const r = boxRef.current?.getBoundingClientRect();
		if (!r) return;
		const below = window.innerHeight - r.bottom - MENU_GAP - 8;
		const above = r.top - MENU_GAP - 8;
		const up = below < MENU_MAX_H && above > below;
		setPos({
			left: r.left,
			width: r.width,
			maxHeight: Math.max(120, Math.min(MENU_MAX_H, up ? above : below)),
			...(up ? { bottom: window.innerHeight - r.top + MENU_GAP } : { top: r.bottom + MENU_GAP }),
		});
	}, []);

	// Thêm / bỏ chip làm ô cao lên / thấp xuống → đặt lại vị trí menu
	useLayoutEffect(() => {
		if (open) place();
	}, [open, place, selectedIds.length]);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			const t = e.target as Node;
			if (boxRef.current?.contains(t) || menuRef.current?.contains(t)) return;
			setOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		window.addEventListener('scroll', place, true);
		window.addEventListener('resize', place);
		return () => {
			document.removeEventListener('mousedown', onDown);
			window.removeEventListener('scroll', place, true);
			window.removeEventListener('resize', place);
		};
	}, [open, place]);

	// Dòng đang tô luôn nằm trong vùng nhìn thấy khi di bằng phím
	useEffect(() => {
		menuRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' });
	}, [activeIdx, pos]);

	const add = (x: T) => {
		onAdd(x.id);
		setQuery('');
		inputRef.current?.focus();
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			if (!open) return setOpen(true);
			const n = suggestions.length;
			if (n) setActive((activeIdx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
		} else if (e.key === 'Enter') {
			// Không để Enter submit form / đóng modal
			e.preventDefault();
			if (open && suggestions[activeIdx]) add(suggestions[activeIdx]);
		} else if (e.key === 'Escape' && open) {
			e.stopPropagation();
			setOpen(false);
		} else if (e.key === 'Backspace' && !query && selected.length) {
			onRemove(selected[selected.length - 1].id);
		} else if (e.key === 'Tab') setOpen(false);
	};

	return (
		<div
			ref={boxRef}
			className={`${styles.tagBox} ${open ? styles.tagBoxOpen : ''}`}
			onMouseDown={(e) => {
				// Bấm vào khoảng trống trong ô → focus ô gõ + mở menu
				if (e.target === e.currentTarget) {
					e.preventDefault();
					inputRef.current?.focus();
					setOpen(true);
				}
			}}
		>
			{selected.map((x) => {
				const c = code?.(x);
				const full = c ? `${c} - ${label(x)}` : label(x);
				return (
					<span
						key={x.id}
						className={styles.tagChip}
						title={full}
					>
						<span className={styles.tagChipText}>
							{c && <b className={styles.tagChipCode}>{c}</b>}
							{label(x)}
						</span>
						<button
							type='button'
							className={styles.tagRemove}
							aria-label={`Bỏ ${full}`}
							onClick={() => onRemove(x.id)}
						>
							<XSvg style={{ width: 10, height: 10 }} />
						</button>
					</span>
				);
			})}
			<input
				ref={inputRef}
				className={styles.tagInput}
				placeholder={selected.length ? 'Thêm...' : placeholder}
				value={query}
				role='combobox'
				aria-expanded={open}
				onChange={(e) => {
					setQuery(e.target.value);
					setActive(0);
					setOpen(true);
				}}
				onFocus={() => setOpen(true)}
				onClick={() => setOpen(true)}
				onKeyDown={onKeyDown}
			/>
			<ChevDSvg
				className={styles.tagChevron}
				aria-hidden
				onMouseDown={(e) => {
					e.preventDefault();
					inputRef.current?.focus();
					setOpen((o) => !o);
				}}
			/>
			{open &&
				pos &&
				createPortal(
					<div
						ref={menuRef}
						className={styles.tagMenu}
						role='listbox'
						style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
						// giữ focus ở ô gõ để chọn liên tiếp nhiều mục
						onMouseDown={(e) => e.preventDefault()}
					>
						{suggestions.length === 0 ? (
							<div className={styles.tagMenuEmpty}>
								{items.length && items.length === selected.length ? 'Đã chọn hết' : emptyText}
							</div>
						) : (
							suggestions.map((x, i) => {
								const c = code?.(x);
								return (
									<div
										key={x.id}
										data-idx={i}
										role='option'
										aria-selected={i === activeIdx}
										className={`${styles.tagOption} ${i === activeIdx ? styles.tagOptionActive : ''}`}
										onMouseEnter={() => setActive(i)}
										onClick={() => add(x)}
									>
										{c && <span className={styles.tagOptionCode}>{c}</span>}
										<span className={styles.tagOptionName}>{label(x)}</span>
									</div>
								);
							})
						)}
					</div>,
					document.body,
				)}
		</div>
	);
}

const programName = (p: TrainingProgram) => p.name;
const programCode = (p: TrainingProgram) => p.code;
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
	/** Trường tùy chỉnh (Cấu hình form 'lesson') */
	custom?: CustomValues;
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
	// Nhãn / bắt buộc / giới hạn / trường tùy chỉnh theo Cấu hình form
	const cfg = useFormConfig('lesson', 'admin');
	const [custom, setCustom] = useState<CustomValues>(lesson?.custom ?? {});
	const [errors, setErrors] = useState<Record<string, string>>({});
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
		const err: Record<string, string> = cfg.validate({ ...form }, custom, { mode: mode === 'add' ? 'create' : 'edit' });
		if (cfg.required('code', true) && !form.code.trim()) err.code ||= 'Vui lòng nhập mã bài học';
		if (!form.title.trim()) err.title ||= 'Vui lòng nhập tên bài học';
		if (form.duration_value.trim() && !(Number(form.duration_value) > 0))
			err.duration_value = 'Thời lượng phải là số dương';
		setErrors(err);
		return !Object.values(err).some(Boolean);
	};

	const handleSave = async () => {
		if (!validate()) return;
		setSaving(true);
		setError('');
		try {
			const data = { ...form, custom };
			const lessonId = mode === 'edit' && lesson ? lesson.lesson_id : (await createLesson(data)).id;
			if (mode === 'edit') await updateLesson(lessonId, data);
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
				<CfgField
					cfg={cfg}
					name='code'
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
				</CfgField>
				<CfgField cfg={cfg} name='lesson_kind' error={errors.lesson_kind} label='Loại'>
					<select
						className={styles.formInput}
						value={form.lesson_kind}
						onChange={(e) => setForm((f) => ({ ...f, lesson_kind: e.target.value as LessonKind }))}
					>
						{allowedOptions(
							cfg,
							'lesson_kind',
							Object.entries(LESSON_KIND_LABEL).map(([value, label]) => ({ value, label })),
						).map(({ value: v, label }) => (
							<option
								key={v}
								value={v}
							>
								{label}
							</option>
						))}
					</select>
				</CfgField>

				<CfgField
					cfg={cfg}
					name='title'
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
				</CfgField>

				<div
					className={styles.formGroup}
					style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}
				>
					<CfgField cfg={cfg} name='theory_hours' error={errors.theory_hours} label='Số tiết lý thuyết'>
						<input
							type='number'
							min={0}
							className={styles.formInput}
							value={form.theory_hours}
							onChange={(e) => setForm((f) => ({ ...f, theory_hours: e.target.value }))}
						/>
					</CfgField>
					<CfgField cfg={cfg} name='practice_hours' error={errors.practice_hours} label='Số tiết thực hành'>
						<input
							type='number'
							min={0}
							className={styles.formInput}
							value={form.practice_hours}
							onChange={(e) => setForm((f) => ({ ...f, practice_hours: e.target.value }))}
						/>
					</CfgField>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Tổng số tiết</label>
						<input
							className={styles.formInput}
							value={totalHours}
							disabled
							style={{ opacity: 0.7 }}
						/>
						<div className={styles.hint}>= Lý thuyết + thực hành</div>
					</div>
				</div>

				<CfgField cfg={cfg} name='credits' error={errors.credits} label='Số tín chỉ'>
					<input
						type='number'
						min={0}
						className={styles.formInput}
						value={form.credits}
						onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
					/>
				</CfgField>
				<CfgField
					cfg={cfg}
					name='duration_value'
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
				</CfgField>

				<FormField label='Trạng thái'>
					<select
						className={styles.formInput}
						value={form.is_active ? '1' : '0'}
						onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.value === '1' }))}
					>
						<option value='1'>Hoạt động</option>
						<option value='0'>Ngừng hoạt động</option>
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
					<label className={styles.formLabel}>
						Thuộc chương trình đào tạo
						{form.program_ids.length > 0 && <span className={styles.labelCount}>{form.program_ids.length}</span>}
					</label>
					<TagPicker
						items={programs}
						selectedIds={form.program_ids}
						label={programName}
						code={programCode}
						placeholder='Gõ mã hoặc tên chương trình...'
						emptyText='Không tìm thấy chương trình phù hợp'
						onAdd={(id) => toggleId('program_ids', id, true)}
						onRemove={(id) => toggleId('program_ids', id, false)}
					/>
					<div className={styles.hint}>
						{loadingPrograms
							? 'Đang tải danh sách chương trình đã gắn...'
							: 'Một bài học có thể thuộc nhiều chương trình. Dùng ↑ ↓ và Enter để chọn nhanh.'}
					</div>
				</div>

				<CfgField
					cfg={cfg}
					name='description'
					error={errors.description}
					label='Mô tả'
					style={{ gridColumn: '1 / -1' }}
				>
					<textarea
						className={styles.formTextarea}
						rows={3}
						value={form.description}
						onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
					/>
				</CfgField>
				<CustomFields
					cfg={cfg}
					value={custom}
					onChange={setCustom}
					errors={errors}
					sectionClassName={m.formSectionTitle}
					inputClassName={styles.formInput}
				/>
			</div>
		</Modal>
	);
}
