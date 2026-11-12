import React, { useEffect, useId, useState } from 'react';
import { CalendarSvg, CheckSvg, ChevDSvg } from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import { DatePicker, Modal, MultiSelect, TimePicker, SearchableSelect } from '@/shared/components';
import {
	EMPTY_SEMINAR_FORM,
	EVENT_TYPE_LABELS,
	SCOPE_LABELS,
	type Seminar,
	type SeminarEventType,
	type SeminarForm,
	type SeminarScope,
} from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';
import cs from './SeminarFormModal.module.css';

// Form gồm 2 phần:
//  - Thông tin cơ bản: luôn hiện — tên (bắt buộc duy nhất, backend chỉ validate title),
//    hình thức/phạm vi (hoặc chủ đề/khoa với tập huấn BV), thời gian, địa điểm.
//  - Cấu hình thêm: các nhóm thu gọn được (accordion) cho mọi trường không bắt buộc.
//    Chọn accordion thay vì tab/bước vì vẫn 1 màn hình + 1 nút Lưu, lỗi không bị giấu
//    sau tab khác, và khi sửa thì nhóm đã có dữ liệu tự mở + có dòng tóm tắt trên tiêu đề.
// Dữ liệu gửi lên vẫn là SeminarForm như cũ (formToPayload trong seminarApi).

const numStr = (n: number | null) => (n != null ? String(n) : '');

/** Năm sự kiện chỉ giữ khi khác năm của ngày bắt đầu — trống = tự suy từ ngày khi lưu. */
function eventYearOverride(s: Seminar): string {
	if (!s.event_year) return '';
	const y = String(s.event_year);
	return s.start_date && s.start_date.slice(0, 4) === y ? '' : y;
}

function toForm(s: Seminar): SeminarForm {
	return {
		title: s.title,
		event_type: s.event_type,
		scope: s.scope,
		location: s.location ?? '',
		start_date: s.start_date ? s.start_date.slice(0, 10) : '',
		end_date: s.end_date ? s.end_date.slice(0, 10) : '',
		start_time: s.start_time ?? '',
		end_time: s.end_time ?? '',
		date_text: s.date_text ?? '',
		event_year: eventYearOverride(s),
		host_chair: s.host_chair ?? '',
		speakers: s.speakers ?? '',
		permit_doc_no: s.permit_doc_no ?? '',
		co_organizers: s.co_organizers ?? '',
		coordinator: s.coordinator ?? '',
		grants_cme: s.grants_cme,
		cme_default_credits:
			s.cme_default_credits != null ? String(s.cme_default_credits) : '',
		manual_participant_count: numStr(s.manual_participant_count),
		manual_internal_count: numStr(s.manual_internal_count),
		manual_external_count: numStr(s.manual_external_count),
		manual_foreign_count: numStr(s.manual_foreign_count),
		manual_cme_count: numStr(s.manual_cme_count),
		notes: s.notes ?? '',
		organizer_department_id: s.organizer_department_id ?? '',
		topic_id: s.topic_id ?? '',
		lesson_hours: numStr(s.lesson_hours),
		required_department_ids: (s.required_departments ?? []).map((d) => d.id),
	};
}

type Option = { id: string; name: string };
type GroupKey = 'cme' | 'audience' | 'org' | 'counts' | 'time' | 'notes';
type Errors = Partial<Record<keyof SeminarForm, string>>;

/** Trường nằm trong nhóm nào — để mở đúng nhóm khi có lỗi */
const FIELD_GROUP: Partial<Record<keyof SeminarForm, GroupKey>> = {
	cme_default_credits: 'cme',
	lesson_hours: 'cme',
	manual_cme_count: 'cme',
	manual_participant_count: 'counts',
	manual_internal_count: 'counts',
	manual_external_count: 'counts',
	manual_foreign_count: 'counts',
	event_year: 'time',
};

const ORG_FIELDS: { key: keyof SeminarForm; label: string }[] = [
	{ key: 'coordinator', label: 'Người điều phối' },
	{ key: 'host_chair', label: 'Chủ tọa' },
	{ key: 'speakers', label: 'Báo cáo viên' },
	{ key: 'permit_doc_no', label: 'Công văn cấp phép' },
	{ key: 'co_organizers', label: 'Đơn vị phối hợp' },
];

const COUNT_FIELDS: { key: keyof SeminarForm; label: string; short: string }[] = [
	{ key: 'manual_participant_count', label: 'Tổng người tham dự', short: 'Tổng' },
	{ key: 'manual_internal_count', label: 'Nội viện', short: 'Nội viện' },
	{ key: 'manual_external_count', label: 'Ngoại viện', short: 'Ngoại viện' },
	{ key: 'manual_foreign_count', label: 'Nước ngoài', short: 'Nước ngoài' },
];

const isInt = (v: string) => /^\d+$/.test(v.trim());
const isDecimal = (v: string) => /^\d+(?:[.,]\d+)?$/.test(v.trim());
const dot = (v: string) => v.trim().replace(',', '.');
const clip = (s: string, n = 60) => {
	const t = s.replace(/\s+/g, ' ').trim();
	return t.length > n ? `${t.slice(0, n)}…` : t;
};
const join = (parts: (string | false | null | undefined)[]) =>
	parts.filter(Boolean).join(' · ');

/** Một nhóm thu gọn trong "Cấu hình thêm" */
function ConfigGroup({
	title,
	hint,
	summary,
	open,
	hasError,
	onToggle,
	children,
}: {
	title: string;
	/** Mô tả khi nhóm chưa có dữ liệu */
	hint: string;
	/** Tóm tắt dữ liệu đã nhập — có thì nhóm coi là "đã cấu hình" */
	summary: string;
	open: boolean;
	hasError: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}) {
	const bodyId = useId();
	return (
		<section
			className={`${cs.group} ${open ? cs.groupOpen : ''} ${hasError ? cs.groupError : ''}`}
		>
			<button
				type='button'
				className={cs.groupHead}
				aria-expanded={open}
				aria-controls={bodyId}
				onClick={onToggle}
			>
				<span className={cs.groupText}>
					<span className={cs.groupTitle}>
						{title}
						{(hasError || summary) && (
							<span
								className={`${cs.dot} ${hasError ? cs.dotError : ''}`}
								role='img'
								aria-label={hasError ? 'Có lỗi' : 'Đã cấu hình'}
							/>
						)}
					</span>
					<span className={`${cs.groupSummary} ${summary ? cs.groupSummarySet : ''}`}>
						{summary || hint}
					</span>
				</span>
				<ChevDSvg
					className={cs.chev}
					aria-hidden
				/>
			</button>
			{open && (
				<div
					id={bodyId}
					className={cs.groupBody}
				>
					<div className={styles.formGrid}>{children}</div>
				</div>
			)}
		</section>
	);
}

/** hospitalTraining: buổi tập huấn bệnh viện — cố định loại 'training' + BV tổ chức, thêm trường riêng. */
export function SeminarFormModal({
	mode,
	seminar,
	hospitalTraining = false,
	loading,
	onClose,
	onSave,
}: {
	mode: 'add' | 'edit';
	seminar?: Seminar | null;
	hospitalTraining?: boolean;
	loading: boolean;
	onClose: () => void;
	onSave: (form: SeminarForm) => void;
}) {
	const ht = hospitalTraining;
	/** Tập huấn BV mặc định cấp CME; hội thảo thường mặc định không */
	const defaultGrantsCme = ht;
	const [form, setForm] = useState<SeminarForm>(() =>
		seminar
			? toForm(seminar)
			: {
					...EMPTY_SEMINAR_FORM,
					// trống = suy từ ngày bắt đầu khi lưu (không còn cố định năm hiện tại)
					event_year: '',
					...(ht ? { event_type: 'training', scope: 'hosted', grants_cme: true } : {}),
				},
	);
	const [departments, setDepartments] = useState<Option[]>([]);
	const [topics, setTopics] = useState<Option[]>([]);
	useEffect(() => {
		if (!ht) return;
		apiClient
			.get<{ data: Option[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => {});
		apiClient
			.get<{ data: Option[] }>('/hospital-training-topics?limit=0')
			.then((r) => setTopics(r.data))
			.catch(() => {});
	}, [ht]);
	const [errors, setErrors] = useState<Errors>({});

	const update = (patch: Partial<SeminarForm>) => {
		setForm((f) => ({ ...f, ...patch }));
		const keys = Object.keys(patch);
		setErrors((e) => {
			if (!keys.some((k) => k in e)) return e;
			const next = { ...e };
			keys.forEach((k) => delete next[k as keyof SeminarForm]);
			// đổi ngày/giờ thì xoá lỗi so sánh giờ
			if (keys.some((k) => k.endsWith('_date') || k.endsWith('_time'))) delete next.end_time;
			return next;
		});
	};
	const set =
		<K extends keyof SeminarForm>(k: K) =>
		(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
			const v =
				e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
			update({ [k]: v } as Partial<SeminarForm>);
		};

	// ── Tóm tắt từng nhóm (rỗng = nhóm chưa cấu hình) ──
	const yearFromDates =
		form.start_date.slice(0, 4) || (form.date_text.match(/20\d{2}/)?.[0] ?? '');
	const summaries: Record<GroupKey, string> = {
		cme:
			form.grants_cme === defaultGrantsCme &&
			!form.cme_default_credits &&
			!form.manual_cme_count &&
			!(ht && form.lesson_hours)
				? ''
				: form.grants_cme
					? join([
							'Cấp CME',
							!ht && form.cme_default_credits && `${form.cme_default_credits} tín chỉ/người`,
							ht && form.lesson_hours && `${form.lesson_hours} tiết`,
							form.manual_cme_count && `${form.manual_cme_count} chứng chỉ`,
						])
					: join([
							'Không cấp CME',
							ht && form.lesson_hours && `${form.lesson_hours} tiết`,
						]),
		audience: (() => {
			const ids = form.required_department_ids;
			if (!ids.length) return '';
			const names = ids.map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean);
			if (names.length !== ids.length) return `${ids.length} khoa bắt buộc tham dự`;
			return names.length > 2
				? `${names.slice(0, 2).join(', ')} +${names.length - 2} khoa`
				: names.join(', ');
		})(),
		org: ORG_FIELDS.filter((f) => String(form[f.key]).trim())
			.map((f) => f.label)
			.join(', '),
		counts: join(
			COUNT_FIELDS.filter((f) => String(form[f.key]).trim()).map(
				(f) => `${f.short} ${form[f.key] as string}`,
			),
		),
		time: join([
			form.date_text.trim() && `"${clip(form.date_text, 30)}"`,
			form.event_year.trim() && `Năm ${form.event_year.trim()}`,
		]),
		notes: clip(form.notes),
	};

	const groupOf = (k: keyof SeminarForm) => FIELD_GROUP[k];
	const groupHasError = (g: GroupKey) =>
		(Object.keys(errors) as (keyof SeminarForm)[]).some((k) => groupOf(k) === g);

	const groupKeys: GroupKey[] = ht
		? ['cme', 'audience', 'org', 'counts', 'time', 'notes']
		: ['cme', 'org', 'counts', 'time', 'notes'];
	// Sửa: nhóm đã có dữ liệu tự mở để thấy ngay cấu hình hiện có
	const [openGroups, setOpenGroups] = useState<Set<GroupKey>>(
		() => new Set(mode === 'edit' ? groupKeys.filter((g) => summaries[g]) : []),
	);
	const toggle = (g: GroupKey) =>
		setOpenGroups((s) => {
			const next = new Set(s);
			if (next.has(g)) next.delete(g);
			else next.add(g);
			return next;
		});
	const allOpen = groupKeys.every((g) => openGroups.has(g));

	const submit = () => {
		const e: Errors = {};
		if (!form.title.trim()) {
			e.title = ht ? 'Vui lòng nhập tên buổi tập huấn' : 'Vui lòng nhập tên hội thảo/hội nghị';
		}
		// Cùng một ngày thì giờ kết thúc phải sau giờ bắt đầu
		const sameDay = !form.end_date || form.end_date === form.start_date;
		if (sameDay && form.start_time && form.end_time && form.end_time <= form.start_time) {
			e.end_time = 'Giờ kết thúc phải sau giờ bắt đầu';
		}
		// Trường số trong Cấu hình thêm — backend cũng kiểm tra, báo sớm ngay tại ô
		COUNT_FIELDS.concat([{ key: 'manual_cme_count', label: '', short: '' }]).forEach(({ key }) => {
			const v = String(form[key]).trim();
			if (v && !isInt(v)) e[key] = 'Phải là số nguyên ≥ 0';
		});
		if (form.cme_default_credits.trim() && !isDecimal(form.cme_default_credits)) {
			e.cme_default_credits = 'Phải là số, VD: 3 hoặc 3.5';
		}
		if (form.lesson_hours.trim()) {
			if (!isDecimal(form.lesson_hours) || Number(dot(form.lesson_hours)) > 999) {
				e.lesson_hours = 'Số tiết phải là số từ 0 đến 999';
			}
		}
		if (form.event_year.trim() && !/^(19|20|21)\d{2}$/.test(form.event_year.trim())) {
			e.event_year = 'Năm gồm 4 chữ số, VD: 2026';
		}
		if (Object.keys(e).length) {
			setErrors(e);
			const groups = (Object.keys(e) as (keyof SeminarForm)[])
				.map(groupOf)
				.filter((g): g is GroupKey => !!g);
			if (groups.length) setOpenGroups((s) => new Set([...s, ...groups]));
			return;
		}
		// Năm sự kiện trống → suy từ ngày bắt đầu / chuỗi ngày; tạo mới mà không có ngày thì lấy năm nay
		const year =
			form.event_year.trim() ||
			yearFromDates ||
			(mode === 'add' ? String(new Date().getFullYear()) : '');
		onSave({
			...form,
			event_year: year,
			cme_default_credits: dot(form.cme_default_credits),
			lesson_hours: dot(form.lesson_hours),
		});
	};

	const uid = useId();
	const fid = (k: keyof SeminarForm) => `${uid}-${k}`;
	const fieldInput = (k: keyof SeminarForm, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
		<>
			<input
				id={fid(k)}
				className={`${styles.formInput} ${errors[k] ? styles.inputError : ''}`}
				value={form[k] as string}
				onChange={set(k)}
				aria-invalid={!!errors[k]}
				{...props}
			/>
			{errors[k] && <div className={styles.fieldError}>{errors[k]}</div>}
		</>
	);

	const groupProps = (g: GroupKey) => ({
		summary: summaries[g],
		open: openGroups.has(g),
		hasError: groupHasError(g),
		onToggle: () => toggle(g),
	});

	return (
		<Modal
			open
			onClose={onClose}
			icon={<CalendarSvg />}
			title={
				ht
					? mode === 'add'
						? 'Thêm buổi tập huấn'
						: 'Chỉnh sửa buổi tập huấn'
					: mode === 'add'
						? 'Thêm hội thảo / hội nghị'
						: 'Chỉnh sửa hội thảo / hội nghị'
			}
			subtitle={
				mode === 'add'
					? 'Chỉ cần tên là tạo được — các mục khác bổ sung sau ở Cấu hình thêm'
					: 'Thông tin sự kiện — người tham dự quản lý ở trang chi tiết'
			}
			size='lg'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Hủy
					</button>
					<button
						className={styles.btnPrimary}
						onClick={submit}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm' : 'Lưu thay đổi'}
					</button>
				</>
			}
		>
			<div className={styles.formGrid}>
				{/* ── Thông tin cơ bản ── */}
				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel} htmlFor={fid('title')}>
						{ht ? 'Tên buổi tập huấn' : 'Tên / Nội dung'}{' '}
						<span className={styles.required}>*</span>
					</label>
					{fieldInput('title', {
						placeholder: ht
							? 'VD: Tập huấn vệ sinh tay 2026'
							: 'VD: Hội nghị khoa học Phẫu thuật Gan Mật Tụy...',
						autoFocus: mode === 'add',
					})}
				</div>

				{ht ? (
					<>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('topic_id')}>Chủ đề</label>
							<select
								className={styles.formInput}
								id={fid('topic_id')}
								value={form.topic_id}
								onChange={set('topic_id')}
							>
								<option value=''>— Chọn chủ đề —</option>
								{topics.map((t) => (
									<option
										key={t.id}
										value={t.id}
									>
										{t.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Khoa/phòng tổ chức</label>
							<SearchableSelect
								options={[{ id: '', name: '— Chọn khoa/phòng —' }, ...departments]}
								value={form.organizer_department_id}
								onChange={(id) => update({ organizer_department_id: id })}
								placeholder='— Chọn khoa/phòng —'
								searchPlaceholder='Tìm khoa/phòng...'
							/>
						</div>
					</>
				) : (
					<>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('event_type')}>Hình thức</label>
							<select
								className={styles.formInput}
								id={fid('event_type')}
								value={form.event_type}
								onChange={set('event_type')}
							>
								{(Object.keys(EVENT_TYPE_LABELS) as SeminarEventType[]).map((t) => (
									<option
										key={t}
										value={t}
									>
										{EVENT_TYPE_LABELS[t]}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('scope')}>Phạm vi</label>
							<select
								className={styles.formInput}
								id={fid('scope')}
								value={form.scope}
								onChange={set('scope')}
							>
								{(Object.keys(SCOPE_LABELS) as SeminarScope[]).map((s) => (
									<option
										key={s}
										value={s}
									>
										{SCOPE_LABELS[s]}
									</option>
								))}
							</select>
						</div>
						{form.event_type === 'training' && form.scope === 'hosted' && (
							<span className={`${styles.hint} ${styles.full}`}>
								Tập huấn BV tổ chức sẽ chuyển sang mục "Tập huấn bệnh viện"
							</span>
						)}
					</>
				)}

				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Bắt đầu</label>
					<div className={styles.dateTimeRow}>
						<DatePicker
							value={form.start_date}
							onChange={(val) => update({ start_date: val })}
							max={form.end_date || undefined}
							placeholder='DD/MM/YYYY'
						/>
						<TimePicker
							value={form.start_time}
							onChange={(v) => update({ start_time: v })}
							className={styles.timeCell}
						/>
					</div>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Kết thúc</label>
					<div className={styles.dateTimeRow}>
						<DatePicker
							value={form.end_date}
							onChange={(val) => update({ end_date: val })}
							min={form.start_date || undefined}
							placeholder='DD/MM/YYYY'
						/>
						<TimePicker
							value={form.end_time}
							onChange={(v) => update({ end_time: v })}
							hasError={!!errors.end_time}
							className={styles.timeCell}
						/>
					</div>
					{errors.end_time && <div className={styles.fieldError}>{errors.end_time}</div>}
				</div>
				<span className={`${styles.hint} ${styles.full}`}>
					Giờ kết thúc tính vào ngày kết thúc (trống thì tính ngày bắt đầu)
				</span>

				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel} htmlFor={fid('location')}>Địa điểm</label>
					<input
						className={styles.formInput}
						id={fid('location')}
						value={form.location}
						onChange={set('location')}
						placeholder='VD: Hội trường A, tầng 3'
					/>
				</div>

				{/* ── Cấu hình thêm ── */}
				<div className={cs.configHead}>
					<div className={cs.configTitle}>
						Cấu hình thêm
						<span className={cs.configHint}>Không bắt buộc — bấm vào từng mục để nhập</span>
					</div>
					<button
						type='button'
						className={cs.linkBtn}
						onClick={() => setOpenGroups(new Set(allOpen ? [] : groupKeys))}
					>
						{allOpen ? 'Thu gọn tất cả' : 'Mở tất cả'}
					</button>
				</div>

				<div className={cs.groups}>
					<ConfigGroup
						title='CME & tín chỉ'
						hint={ht ? 'Cấp CME, số tiết, số chứng chỉ' : 'Cấp CME, tín chỉ mỗi người, số chứng chỉ'}
						{...groupProps('cme')}
					>
						<div className={styles.full}>
							<label className={styles.inlineSwitch}>
								<input
									type='checkbox'
									role='switch'
									checked={form.grants_cme}
									onChange={set('grants_cme')}
								/>
								<span className={styles.testSwitchTrack} />
								Cấp CME cho người tham dự
							</label>
						</div>
						{ht && (
							<div className={styles.formGroup}>
								<label className={styles.formLabel} htmlFor={fid('lesson_hours')}>Số tiết</label>
								{fieldInput('lesson_hours', { inputMode: 'decimal', placeholder: 'VD: 4' })}
								<span className={styles.hint}>1 tiết = 1 giờ tín chỉ CME (TT 32/2023)</span>
							</div>
						)}
						{form.grants_cme && !ht && (
							<div className={styles.formGroup}>
								<label className={styles.formLabel} htmlFor={fid('cme_default_credits')}>Tín chỉ CME / người</label>
								{fieldInput('cme_default_credits', {
									inputMode: 'decimal',
									placeholder: 'VD: 3 hoặc 3.5',
								})}
								<span className={styles.hint}>
									Số tín chỉ mỗi đại biểu, không phải tổng số chứng chỉ
								</span>
							</div>
						)}
						{form.grants_cme && (
							<div className={styles.formGroup}>
								<label className={styles.formLabel} htmlFor={fid('manual_cme_count')}>Số lượng chứng chỉ CME</label>
								{fieldInput('manual_cme_count', { inputMode: 'numeric', placeholder: 'VD: 330' })}
								<span className={styles.hint}>Nhập tay sẽ thay cho số đếm tự động</span>
							</div>
						)}
					</ConfigGroup>

					{ht && (
						<ConfigGroup
							title='Đối tượng tham dự'
							hint='Khoa bắt buộc tham dự'
							{...groupProps('audience')}
						>
							<div className={`${styles.formGroup} ${styles.full}`}>
								<label className={styles.formLabel}>Khoa bắt buộc tham dự</label>
								<MultiSelect
									options={departments.map((d) => ({ id: d.id, label: d.name }))}
									selected={new Set(form.required_department_ids)}
									onChange={(next) => update({ required_department_ids: [...next] })}
									placeholder='Không bắt buộc'
									searchable
								/>
								<span className={styles.hint}>Dùng cho báo cáo nhân viên chưa tham dự</span>
							</div>
						</ConfigGroup>
					)}

					<ConfigGroup
						title='Tổ chức & nhân sự'
						hint='Điều phối, chủ tọa, báo cáo viên, công văn, đơn vị phối hợp'
						{...groupProps('org')}
					>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('coordinator')}>Người điều phối</label>
							{fieldInput('coordinator')}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('host_chair')}>Chủ tọa (nếu BV tổ chức)</label>
							{fieldInput('host_chair')}
						</div>
						<div className={`${styles.formGroup} ${styles.full}`}>
							<label className={styles.formLabel} htmlFor={fid('speakers')}>Báo cáo viên</label>
							{fieldInput('speakers')}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('permit_doc_no')}>Công văn cấp phép của Sở</label>
							{fieldInput('permit_doc_no')}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('co_organizers')}>Đơn vị phối hợp tổ chức</label>
							{fieldInput('co_organizers')}
						</div>
					</ConfigGroup>

					<ConfigGroup
						title='Số liệu tổng hợp (nhập tay)'
						hint='Tổng, nội viện, ngoại viện, nước ngoài — thay cho số đếm tự động'
						{...groupProps('counts')}
					>
						<div className={`${styles.full} ${cs.countGrid}`}>
							{COUNT_FIELDS.map((f) => (
								<div
									key={f.key}
									className={styles.formGroup}
								>
									<label className={styles.formLabel} htmlFor={fid(f.key)}>{f.label}</label>
									{fieldInput(f.key, {
										inputMode: 'numeric',
										placeholder: f.key === 'manual_participant_count' ? 'VD: 260' : undefined,
									})}
								</div>
							))}
						</div>
						<span className={`${styles.hint} ${styles.full}`}>
							Để trống thì hệ thống đếm theo danh sách người tham dự
						</span>
					</ConfigGroup>

					<ConfigGroup
						title='Thời gian dạng chữ & năm sự kiện'
						hint='Chuỗi ngày gốc, năm cấp số CME'
						{...groupProps('time')}
					>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('date_text')}>Thời gian (dạng chữ)</label>
							{fieldInput('date_text', { placeholder: 'VD: 05-06/06/2026' })}
							<span className={styles.hint}>Giữ nguyên chuỗi gốc khi ngày không theo chuẩn</span>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel} htmlFor={fid('event_year')}>Năm sự kiện</label>
							{fieldInput('event_year', {
								inputMode: 'numeric',
								placeholder: yearFromDates ? `Theo ngày: ${yearFromDates}` : 'VD: 2026',
							})}
							<span className={styles.hint}>
								Dùng cho chu trình cấp số CME — trống thì lấy theo ngày bắt đầu
							</span>
						</div>
					</ConfigGroup>

					<ConfigGroup
						title='Ghi chú'
						hint='Ghi chú nội bộ'
						{...groupProps('notes')}
					>
						<div className={`${styles.formGroup} ${styles.full}`}>
							<textarea
								className={styles.formTextarea}
								rows={3}
								value={form.notes}
								onChange={set('notes')}
								aria-label='Ghi chú'
							/>
						</div>
					</ConfigGroup>
				</div>
			</div>
		</Modal>
	);
}
