import { FormField } from '@/shared/components/Input/FormField';
import React, { useEffect, useState } from 'react';
import { LayersSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import { DatePicker, Modal, ModalActions } from '@/shared/components';
import { Toggle } from '@/shared/components/Input/Toggle';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { apiClient } from '@/shared/api/axios';
import { EMPTY_FORM, TRAINING_TYPE, type Course, type CourseFormData } from '../types/course.type';

interface SimpleItem {
	id: string;
	name: string;
}

interface ProgramOption extends SimpleItem {
	code: string | null;
	training_type_id: string | null;
}

// Gợi ý tên khóa ĐTLT theo đợt: "ĐTLT Đợt 3/2026".
const dtltName = (batch: string) => `ĐTLT Đợt ${batch}/${new Date().getFullYear()}`;
import styles from '../pages/Courses.module.css';

// Loại khóa tuyển sinh theo đợt (đủ sĩ số thì lập đợt).
const BATCH_TYPES = new Set<string>([TRAINING_TYPE.DTLT, TRAINING_TYPE.CTCV]);

function ListEditor({
	label,
	items,
	onChange,
	placeholder,
	addLabel,
}: {
	label: string;
	items: string[];
	onChange: (items: string[]) => void;
	placeholder: string;
	addLabel: string;
}) {
	return (
		<div
			className={styles.formGroup}
			style={{ gridColumn: '1 / -1' }}
		>
			<label className={styles.formLabel}>{label}</label>
			{items.length === 0 && <div className={styles.hint}>Chưa có mục nào.</div>}
			{items.length > 0 && (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
					{items.map((item, idx) => (
						<div
							key={idx}
							style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
						>
							<span style={{ flexShrink: 0, fontSize: 'var(--font-size-sm)', color: 'var(--color-gray-500)', minWidth: 18 }}>
								{idx + 1}.
							</span>
							<input
								className={styles.formInput}
								value={item}
								onChange={(e) => {
									const next = [...items];
									next[idx] = e.target.value;
									onChange(next);
								}}
								placeholder={placeholder}
							/>
							<button
								type='button'
								className={`${styles.actionBtn} ${styles.danger}`}
								title='Xoá mục'
								onClick={() => onChange(items.filter((_, i) => i !== idx))}
							>
								<TrashSvg />
							</button>
						</div>
					))}
				</div>
			)}
			<button
				type='button'
				className={styles.btnGhost}
				style={{ alignSelf: 'flex-start', marginTop: 'var(--space-2)' }}
				onClick={() => onChange([...items, ''])}
			>
				<PlusSvg /> {addLabel}
			</button>
		</div>
	);
}

export function CourseFormModal({
	mode,
	course,
	initial,
	onClose,
	onSave,
	loading,
}: {
	mode: 'add' | 'edit';
	course?: Course;
	/** Giá trị điền sẵn khi thêm mới (vd tạo khóa từ hạng mục kế hoạch). */
	initial?: Partial<CourseFormData>;
	onClose: () => void;
	onSave: (d: CourseFormData) => void;
	loading: boolean;
}) {
	const [form, setForm] = useState<CourseFormData>(
		course
			? {
					name: course.name,
					program_ids: course.program_ids,
					training_form_id: course.training_form_id ?? '',
					training_type_id: course.training_type_id ?? '',
					batch_no: course.batch_no != null ? String(course.batch_no) : '',
					is_rolling: course.is_rolling,
					auto_batch: course.auto_batch,
					start_date: course.start_date ? course.start_date.slice(0, 10) : '',
					end_date: course.end_date ? course.end_date.slice(0, 10) : '',
					enrollment_start_date: course.enrollment_start_date ? course.enrollment_start_date.slice(0, 10) : '',
					enrollment_end_date: course.enrollment_end_date ? course.enrollment_end_date.slice(0, 10) : '',
					capacity: course.capacity != null ? String(course.capacity) : '',
					status: course.status,
					is_public_registration: course.is_public_registration,
					description: course.description ?? '',
					prerequisites: course.prerequisites,
					objectives: course.objectives,
				}
			: { ...EMPTY_FORM, ...initial },
	);
	const [forms, setForms] = useState<SimpleItem[]>([]);
	const [programs, setPrograms] = useState<ProgramOption[]>([]);
	const [types, setTypes] = useState<SimpleItem[]>([]);

	useEffect(() => {
		apiClient.get<{ data: SimpleItem[] }>('/training-forms?limit=0').then((r) => setForms(r.data)).catch(() => {});
		apiClient.get<{ data: ProgramOption[] }>('/training-programs?limit=0').then((r) => setPrograms(r.data)).catch(() => {});
		apiClient.get<{ data: SimpleItem[] }>('/training-types?limit=0').then((r) => setTypes(r.data)).catch(() => {});
	}, []);
	const [errors, setErrors] = useState<Partial<Record<keyof CourseFormData, string>>>({});

	// Chỉ cho chọn chương trình cùng loại với khóa; chương trình chưa gán loại thì luôn hiện,
	// chương trình đã chọn từ trước vẫn hiện để bỏ chọn được.
	const visiblePrograms = programs.filter(
		(p) =>
			!form.training_type_id ||
			!p.training_type_id ||
			p.training_type_id === form.training_type_id ||
			form.program_ids.includes(p.id),
	);
	const [programQ, setProgramQ] = useState('');
	const q = programQ.trim().toLowerCase();
	const filteredPrograms = q
		? visiblePrograms.filter((p) => `${p.code ?? ''} ${p.name}`.toLowerCase().includes(q))
		: visiblePrograms;

	const changeType =(typeId: string) =>
		setForm((f) => ({
			...f,
			training_type_id: typeId,
			// GPHN mặc định mở liên tục; ĐTLT/CTCV mặc định tuyển sinh theo đợt (đợt con thì không)
			is_rolling: typeId === TRAINING_TYPE.GPHN,
			auto_batch: !course?.parent_course_id && BATCH_TYPES.has(typeId),
			batch_no: typeId === TRAINING_TYPE.DTLT ? f.batch_no : '',
		}));

	const changeBatch = (batch: string) => {
		setForm((f) => {
			const autoName = !f.name.trim() || (!!f.batch_no && f.name === dtltName(f.batch_no));
			return { ...f, batch_no: batch, name: autoName && batch ? dtltName(batch) : f.name };
		});
		setErrors((er) => ({ ...er, batch_no: '' }));
	};

	// Khóa mở liên tục không dùng ngày khóa / cửa sổ đăng ký — xoá khi lưu cho khỏi lệch.
	const noDates = form.is_rolling || form.auto_batch;
	const submit = () =>
		onSave(
			noDates
				? {
						...form,
						start_date: '',
						end_date: '',
						enrollment_start_date: '',
						enrollment_end_date: '',
						batch_no: form.auto_batch ? '' : form.batch_no,
					}
				: form,
		);
	const canBatch = BATCH_TYPES.has(form.training_type_id) && !course?.parent_course_id;

	const set =
		(k: keyof CourseFormData) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
			setForm((f) => ({ ...f, [k]: e.target.value }));
			setErrors((er) => ({ ...er, [k]: '' }));
		};

	const full = { gridColumn: '1 / -1' };

	const validate = () => {
		const err: Partial<Record<keyof CourseFormData, string>> = {};
		if (!form.name.trim()) err.name = 'Vui lòng nhập tên khóa học';
		if (form.training_type_id === TRAINING_TYPE.DTLT && !form.auto_batch && !form.batch_no)
			err.batch_no = 'Khóa ĐTLT cần số đợt';
		if (form.batch_no && (!Number.isInteger(Number(form.batch_no)) || Number(form.batch_no) < 1))
			err.batch_no = 'Số đợt phải là số nguyên dương';
		if (form.capacity && (Number(form.capacity) < 1 || !Number.isFinite(Number(form.capacity))))
			err.capacity = 'Số lượng phải là số nguyên dương';
		setErrors(err);
		return Object.keys(err).length === 0;
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<LayersSvg />}
			title={mode === 'add' ? 'Thêm khóa học' : 'Chỉnh sửa khóa học'}
			subtitle={mode === 'add' ? 'Thêm khóa học mới' : `Cập nhật — ${course?.name}`}
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={() => validate() && submit()}
					loading={loading}
					confirmLabel={mode === 'add' ? 'Thêm khóa học' : 'Lưu thay đổi'}
				/>
			}
		>
			<div className={styles.formGrid2}>
				<div
					className={styles.sectionTitle}
					style={full}
				>
					1. Thông tin chung
				</div>
				<FormField label='Loại khóa'>
					<select
						className={styles.formInput}
						value={form.training_type_id}
						onChange={(e) => changeType(e.target.value)}
					>
						<option value=''>-- Chọn loại khóa --</option>
						{types.map((t) => (
							<option
								key={t.id}
								value={t.id}
							>
								{t.name}
							</option>
						))}
					</select>
				</FormField>
				{canBatch ? (
					<FormField label='Tuyển sinh'>
						<div className={`${styles.formInput} ${styles.toggleBox}`}>
							<Toggle
								on={form.auto_batch}
								onChange={() => setForm((f) => ({ ...f, auto_batch: !f.auto_batch }))}
								title='Tuyển sinh theo đợt'
							/>
							<span onClick={() => setForm((f) => ({ ...f, auto_batch: !f.auto_batch }))}>Tuyển sinh theo đợt</span>
						</div>
						<span className={styles.fieldHint}>
							{form.auto_batch
								? 'Đăng ký liên tục, đủ sĩ số tối thiểu của chương trình thì tự lập đợt'
								: 'Một lớp theo lịch cố định'}
						</span>
					</FormField>
				) : null}
				{form.auto_batch ? null : form.training_type_id === TRAINING_TYPE.DTLT ? (
					<FormField
						label='Đợt số'
						required
						error={errors.batch_no}
					>
						<input
							type='number'
							min={1}
							className={`${styles.formInput} ${errors.batch_no ? styles.inputError : ''}`}
							value={form.batch_no}
							onChange={(e) => changeBatch(e.target.value)}
							placeholder='VD: 3'
						/>
					</FormField>
				) : (
					<FormField
						label='Lịch khóa'
					>
						<div className={`${styles.formInput} ${styles.toggleBox}`}>
							<Toggle
								on={form.is_rolling}
								onChange={() => setForm((f) => ({ ...f, is_rolling: !f.is_rolling }))}
								title='Mở liên tục'
							/>
							<span onClick={() => setForm((f) => ({ ...f, is_rolling: !f.is_rolling }))}>Mở liên tục</span>
						</div>
						<span className={styles.fieldHint}>
							{form.is_rolling ? 'Mỗi học viên có lịch học riêng' : 'Cả lớp học theo một lịch chung'}
						</span>
					</FormField>
				)}
				<FormField
					label='Tên khóa học'
					required
					error={errors.name}
					style={full}
				>
					<input
						className={`${styles.formInput} ${errors.name ? styles.inputError : ''}`}
						value={form.name}
						onChange={set('name')}
						placeholder='VD: Khóa Cấp cứu cơ bản K1/2026'
					/>
				</FormField>
				<FormField
					label='Chương trình đào tạo áp dụng'
					style={full}
				>
					{visiblePrograms.length === 0 ? (
						<div className={styles.hint}>
							{programs.length === 0
								? 'Chưa có chương trình đào tạo nào.'
								: 'Chưa có chương trình nào thuộc loại khóa này.'}
						</div>
					) : (
						<div className={styles.pickBox}>
							<div className={styles.pickHead}>
								<SearchInput
									value={programQ}
									onChange={setProgramQ}
									placeholder='Tìm theo mã hoặc tên chương trình...'
								/>
								<span className={styles.pickCount}>
									Đã chọn <b>{form.program_ids.length}</b>/{visiblePrograms.length}
								</span>
								{form.program_ids.length > 0 && (
									<button
										type='button'
										className={styles.pickClear}
										onClick={() => setForm((f) => ({ ...f, program_ids: [] }))}
									>
										Bỏ chọn
									</button>
								)}
							</div>
							<div className={styles.pickList}>
								{filteredPrograms.length === 0 && <div className={styles.pickEmpty}>Không tìm thấy chương trình phù hợp.</div>}
								{filteredPrograms.map((p) => {
									const on = form.program_ids.includes(p.id);
									return (
										<label
											key={p.id}
											className={`${styles.pickRow} ${on ? styles.pickRowOn : ''}`}
										>
											<input
												type='checkbox'
												checked={on}
												onChange={() =>
													setForm((f) => ({
														...f,
														program_ids: on ? f.program_ids.filter((x) => x !== p.id) : [...f.program_ids, p.id],
													}))
												}
											/>
											{p.code && <span className={styles.pickCode}>{p.code}</span>}
											<span className={styles.pickName}>{p.name}</span>
										</label>
									);
								})}
							</div>
						</div>
					)}
				</FormField>

				<div
					className={styles.sectionTitle}
					style={full}
				>
					2. Thời gian
				</div>
				{form.auto_batch ? (
					<div
						className={styles.hint}
						style={full}
					>
						Khóa tuyển sinh: không có ngày học, luôn nhận đăng ký. Học viên được duyệt vào danh sách chờ; đủ sĩ số tối thiểu
						của chương trình (đặt ở Chương trình đào tạo) thì tự lập một đợt — ngày học xếp trong từng đợt. Đợt đầy thì người
						sau chờ đợt kế tiếp.
					</div>
				) : form.is_rolling ? (
					<div
						className={styles.hint}
						style={full}
					>
						Khóa mở liên tục: không có ngày khóa, luôn nhận học viên — ngày bắt đầu/kết thúc nhập ở hồ sơ từng học viên.
					</div>
				) : (
					<>
						<FormField label='Ngày bắt đầu'>
							<DatePicker
								value={form.start_date}
								onChange={(val) => setForm((f) => ({ ...f, start_date: val }))}
								max={form.end_date || undefined}
							/>
						</FormField>
						<FormField label='Ngày kết thúc'>
							<DatePicker
								value={form.end_date}
								onChange={(val) => setForm((f) => ({ ...f, end_date: val }))}
								min={form.start_date || undefined}
							/>
						</FormField>
						<FormField
							label='Mở đăng ký từ'
						>
							<DatePicker
								value={form.enrollment_start_date}
								onChange={(val) => setForm((f) => ({ ...f, enrollment_start_date: val }))}
								max={form.enrollment_end_date || undefined}
							/>
						</FormField>
						<FormField label='Đóng đăng ký sau'>
							<DatePicker
								value={form.enrollment_end_date}
								onChange={(val) => setForm((f) => ({ ...f, enrollment_end_date: val }))}
								min={form.enrollment_start_date || undefined}
							/>
						</FormField>
						<div
							className={styles.hint}
							style={full}
						>
							Trạng thái (Sắp khai giảng / Đang mở đăng ký / Đang học / Hoàn thành) tự tính từ các ngày trên.
						</div>
					</>
				)}

				<div
					className={styles.sectionTitle}
					style={full}
				>
					3. Đăng ký
				</div>
				<FormField
					label='Chế độ đăng ký'
				>
					<select
						className={styles.formInput}
						value={form.is_public_registration ? '1' : '0'}
						onChange={(e) => setForm((f) => ({ ...f, is_public_registration: e.target.value === '1' }))}
					>
						<option value='0'>Nội bộ</option>
						<option value='1'>Công khai</option>
					</select>
				</FormField>
				<FormField label='Hình thức học'>
					<select
						className={styles.formInput}
						value={form.training_form_id}
						onChange={set('training_form_id')}
					>
						<option value=''>-- Chọn --</option>
						{forms.map((f) => (
							<option
								key={f.id}
								value={f.id}
							>
								{f.name}
							</option>
						))}
					</select>
				</FormField>
				<FormField
					label={form.auto_batch ? 'Sĩ số tối đa mỗi đợt' : 'Sĩ số tối đa'}
					error={errors.capacity}
				>
					<input
						type='number'
						min={1}
						className={`${styles.formInput} ${errors.capacity ? styles.inputError : ''}`}
						value={form.capacity}
						onChange={set('capacity')}
						placeholder='Bỏ trống = không giới hạn'
					/>
					{form.auto_batch && (
						<span className={styles.fieldHint}>Dùng khi chương trình chưa đặt số lượng tối đa</span>
					)}
				</FormField>
				{mode === 'edit' ? (
					<FormField label='Huỷ khóa'>
						<label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minHeight: 38, cursor: 'pointer' }}>
							<input
								type='checkbox'
								checked={form.status === 'cancelled'}
								onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? 'cancelled' : 'draft' }))}
							/>
							<span style={{ color: form.status === 'cancelled' ? '#791f1f' : undefined }}>Huỷ khóa học này</span>
						</label>
					</FormField>
				) : (
					<div />
				)}

				{/* Phần giới thiệu ít dùng — thu gọn, chỉ mở sẵn khi đã có nội dung */}
				<details
					className={styles.collapse}
					style={full}
					open={!!(form.description || form.prerequisites.length || form.objectives.length)}
				>
					<summary className={styles.sectionTitle}>
						4. Giới thiệu khóa học (mô tả, điều kiện, mục tiêu — không bắt buộc)
					</summary>
					<div className={styles.formGrid2}>
						<FormField
							label='Mô tả'
							style={full}
						>
							<textarea
								className={styles.formTextarea}
								value={form.description}
								onChange={set('description')}
								rows={3}
								placeholder='Mô tả ngắn về khóa học...'
							/>
						</FormField>
						<ListEditor
							label='Điều kiện'
							items={form.prerequisites}
							onChange={(items) => setForm((f) => ({ ...f, prerequisites: items }))}
							placeholder='VD: Đã hoàn thành khóa Cấp cứu cơ bản'
							addLabel='Thêm điều kiện'
						/>
						<ListEditor
							label='Mục tiêu'
							items={form.objectives}
							onChange={(items) => setForm((f) => ({ ...f, objectives: items }))}
							placeholder='VD: Nắm vững quy trình cấp cứu ngừng tuần hoàn'
							addLabel='Thêm mục tiêu'
						/>
					</div>
				</details>
			</div>
		</Modal>
	);
}
