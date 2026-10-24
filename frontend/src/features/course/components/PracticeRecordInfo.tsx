import { useState } from 'react';
import { DatePicker } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { usePracticeCatalogs } from '../../catalog/hooks/usePracticeCatalogs';
import { updateEnrollment } from '../api/courseApi';
import {
	PROGRESS_LABEL,
	type CourseProgramLink,
	type Enrollment,
	type EnrollmentUpdate,
} from '../types/course.type';
import styles from '../pages/Courses.module.css';
import local from '../pages/PracticeRecords.module.css';

type Field = keyof Required<EnrollmentUpdate>;
type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; message: string };

const day = (v: string | null) => (v ? v.slice(0, 10) : '');
const current = (e: Enrollment, k: Field): string => {
	const v = e[k];
	if (k === 'start_date' || k === 'end_date' || k === 'progress_date') return day(v as string | null);
	if (k === 'progress_status') return (v as string | null) || 'in_progress';
	return (v as string | null) ?? '';
};
const programLabel = (p: CourseProgramLink) => (p.program_code ? `${p.program_code} — ${p.program_name}` : p.program_name);
const nowLabel = () => new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Tab "Thông tin hồ sơ" của trang hồ sơ thực hành GPHN — TỰ LƯU từng trường:
 * ô chọn / ngày lưu khi đổi, ô chữ lưu khi rời ô (hoặc Enter). Không còn nút "Lưu hồ sơ",
 * cùng cách lưu với tab Vòng thực hành.
 */
export function PracticeRecordInfo({
	enrollment,
	programLinks,
	canEdit,
	onSaved,
}: {
	enrollment: Enrollment;
	programLinks: CourseProgramLink[];
	canEdit: boolean;
	/** Trường vừa lưu — trang cập nhật hồ sơ ngay rồi tải lại. */
	onSaved: (patch: EnrollmentUpdate) => void;
}) {
	const [draft, setDraft] = useState<Partial<Record<Field, string>>>({});
	const [state, setState] = useState<SaveState>({ kind: 'idle' });
	const catalogs = usePracticeCatalogs();

	const value = (k: Field) => draft[k] ?? current(enrollment, k);
	const program = programLinks.find((p) => p.program_id === value('program_id'));

	const commit = async (k: Field, next = draft[k]) => {
		if (next === undefined) return;
		const clear = () =>
			setDraft((d) => {
				const rest = { ...d };
				delete rest[k];
				return rest;
			});
		if (next === current(enrollment, k)) return clear();
		if (
			k === 'program_id' &&
			enrollment.rotation_total > 0 &&
			!window.confirm(
				'Hồ sơ đã có vòng thực hành theo chương trình cũ. Đổi chương trình không tự đổi các vòng — sau đó vào tab "Vòng thực hành" bấm "Tự động xếp lại" nếu cần. Tiếp tục?',
			)
		)
			return clear();
		setDraft((d) => ({ ...d, [k]: next }));
		setState({ kind: 'saving' });
		const patch = { [k]: next === '' ? null : next } as EnrollmentUpdate;
		try {
			await updateEnrollment(enrollment.id, patch);
			onSaved(patch);
			clear();
			setState({ kind: 'saved', at: nowLabel() });
		} catch (err) {
			setState({ kind: 'error', message: err instanceof Error ? err.message : 'Lưu thất bại' });
		}
	};

	// Ô chữ: gõ vào bản nháp, rời ô / Enter thì lưu
	const text = (k: Field, placeholder?: string) => (
		<input
			className={styles.formInput}
			value={value(k)}
			placeholder={placeholder}
			disabled={!canEdit}
			onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
			onBlur={() => void commit(k)}
			onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
		/>
	);
	// Ô chọn từ danh mục (lưu chữ vào hồ sơ); giá trị cũ không có trong danh mục vẫn hiện để giữ nguyên
	const pick = (k: Field, items: { id: string; name: string }[], empty: string) => {
		const v = value(k);
		return (
			<select
				className={styles.formInput}
				value={v}
				disabled={!canEdit}
				onChange={(e) => void commit(k, e.target.value)}
			>
				<option value=''>{empty}</option>
				{v && !items.some((x) => x.name === v) && <option value={v}>{v} (ngoài danh mục)</option>}
				{items.map((x) => (
					<option
						key={x.id}
						value={x.name}
					>
						{x.name}
					</option>
				))}
			</select>
		);
	};
	const date = (k: Field, bounds: { min?: string; max?: string } = {}) => (
		<DatePicker
			value={value(k)}
			onChange={(v) => void commit(k, v ?? '')}
			min={bounds.min || undefined}
			max={bounds.max || undefined}
			disabled={!canEdit}
		/>
	);
	const full = { gridColumn: '1 / -1' };
	const progress = value('progress_status');

	return (
		<div className={local.infoWrap}>
			<div className={local.saveState}>
				{state.kind === 'saving' && <span className={local.muted}>Đang lưu…</span>}
				{state.kind === 'saved' && <span className={local.ok}>✓ Đã lưu lúc {state.at}</span>}
				{state.kind === 'error' && <span className={local.danger}>{state.message}</span>}
				{state.kind === 'idle' && (
					<span className={local.muted}>
						{canEdit ? 'Thay đổi được lưu tự động khi rời ô nhập' : 'Bạn chỉ có quyền xem hồ sơ'}
					</span>
				)}
			</div>

			<section className={local.section}>
				<h3 className={local.sectionTitle}>Chương trình &amp; tiến độ</h3>
				<div className={styles.formGrid2}>
					<FormField
						label='Chương trình thực hành'
						style={full}
					>
						<select
							className={styles.formInput}
							value={value('program_id')}
							disabled={!canEdit}
							onChange={(e) => void commit('program_id', e.target.value)}
						>
							<option value=''>-- Chưa chọn chương trình --</option>
							{programLinks.map((p) => (
								<option
									key={p.program_id}
									value={p.program_id}
								>
									{programLabel(p)}
								</option>
							))}
						</select>
					</FormField>
					<FormField label='Tiến độ'>
						<select
							className={styles.formInput}
							value={progress}
							disabled={!canEdit}
							onChange={(e) => void commit('progress_status', e.target.value)}
						>
							{Object.entries(PROGRESS_LABEL).map(([v, label]) => (
								<option
									key={v}
									value={v}
								>
									{label}
								</option>
							))}
						</select>
					</FormField>
					{progress !== 'in_progress' ? (
						<FormField label={progress === 'completed' ? 'Ngày hoàn thành' : 'Ngày nghỉ học'}>
							{date('progress_date')}
						</FormField>
					) : (
						<div />
					)}
					{progress === 'dropped' && (
						<FormField
							label='Lý do nghỉ học'
							style={full}
						>
							{text('progress_reason')}
						</FormField>
					)}
				</div>
			</section>

			<section className={local.section}>
				<h3 className={local.sectionTitle}>Thời gian &amp; địa điểm thực hành</h3>
				<div className={styles.formGrid2}>
					<FormField label='Bắt đầu thực hành'>{date('start_date', { max: value('end_date') })}</FormField>
					<FormField label='Kết thúc thực hành'>{date('end_date', { min: value('start_date') })}</FormField>
					<FormField label='Tổng thời gian thực hành'>
						{text('total_duration', program?.program_duration ?? 'VD: 12 tháng')}
					</FormField>
					<FormField label='Địa điểm thực hành'>
						{text('practice_location', 'VD: Tại các khoa: Cấp cứu, Nội tim mạch 2…')}
					</FormField>
				</div>
			</section>

			<section className={local.section}>
				<h3 className={local.sectionTitle}>Thông tin in trên giấy tờ (đơn đề nghị, hợp đồng)</h3>
				<div className={styles.formGrid2}>
					<FormField label='Mã thực hành'>{text('practice_code', '226.BS')}</FormField>
					<FormField label='Đơn vị cử đi'>{pick('sending_unit', catalogs.units, '-- Chọn đơn vị cử đi --')}</FormField>
					<FormField label='Lĩnh vực chuyên môn'>
						{pick('professional_field', catalogs.fields, '-- Chọn lĩnh vực --')}
					</FormField>
					<FormField label='Hình thức hành nghề'>
						{pick('practice_form', catalogs.forms, '-- Chọn hình thức --')}
					</FormField>
					<div
						className={styles.hint}
						style={full}
					>
						Thiếu lựa chọn? Thêm ở Danh mục đào tạo (Lĩnh vực chuyên môn / Hình thức hành nghề / Đơn vị cử đi). Đặt lĩnh
						vực, hình thức mặc định ở chương trình đào tạo thì hồ sơ mới tự điền.
					</div>
					<FormField
						label='Ghi chú'
						style={full}
					>
						{text('note')}
					</FormField>
				</div>
			</section>
		</div>
	);
}
