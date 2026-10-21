import React, { useEffect, useState } from 'react';
import { CalendarSvg, CheckSvg } from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import { DatePicker, Modal, MultiSelect } from '@/shared/components';
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

const numStr = (n: number | null) => (n != null ? String(n) : '');

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
		event_year: s.event_year ? String(s.event_year) : '',
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
	const [form, setForm] = useState<SeminarForm>(
		seminar
			? toForm(seminar)
			: ht
				? { ...EMPTY_SEMINAR_FORM, event_type: 'training', scope: 'hosted', grants_cme: true }
				: EMPTY_SEMINAR_FORM,
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
	const [err, setErr] = useState<string>('');
	const [timeErr, setTimeErr] = useState<string>('');

	const set =
		<K extends keyof SeminarForm>(k: K) =>
		(
			e: React.ChangeEvent<
				HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
			>,
		) => {
			const v =
				e.target.type === 'checkbox'
					? (e.target as HTMLInputElement).checked
					: e.target.value;
			setForm((f) => ({ ...f, [k]: v }));
			setErr('');
			setTimeErr('');
		};

	const submit = () => {
		if (!form.title.trim()) {
			setErr(ht ? 'Vui lòng nhập tên buổi tập huấn' : 'Vui lòng nhập tên hội thảo/hội nghị');
			return;
		}
		// Cùng một ngày thì giờ kết thúc phải sau giờ bắt đầu
		const sameDay = !form.end_date || form.end_date === form.start_date;
		if (sameDay && form.start_time && form.end_time && form.end_time <= form.start_time) {
			setTimeErr('Giờ kết thúc phải sau giờ bắt đầu');
			return;
		}
		// suy năm từ ngày bắt đầu nếu để trống
		const year =
			form.event_year ||
			(form.start_date ? form.start_date.slice(0, 4) : '') ||
			(form.date_text.match(/20\d{2}/)?.[0] ?? '');
		onSave({ ...form, event_year: year });
	};

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
			subtitle='Thông tin sự kiện — người tham dự quản lý ở trang chi tiết'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
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
				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>
						Tên / Nội dung <span className={styles.required}>*</span>
					</label>
					<input
						className={`${styles.formInput} ${err ? styles.inputError : ''}`}
						value={form.title}
						onChange={set('title')}
						placeholder={
							ht ? 'VD: Tập huấn vệ sinh tay 2026' : 'VD: Hội nghị khoa học Phẫu thuật Gan Mật Tụy...'
						}
					/>
					{err && <div className={styles.fieldError}>{err}</div>}
				</div>

				{ht ? (
					<>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Chủ đề</label>
							<select
								className={styles.formInput}
								value={form.topic_id}
								onChange={set('topic_id')}
							>
								<option value=''>— Chọn chủ đề —</option>
								{topics.map((t) => (
									<option key={t.id} value={t.id}>
										{t.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Khoa/phòng tổ chức</label>
							<select
								className={styles.formInput}
								value={form.organizer_department_id}
								onChange={set('organizer_department_id')}
							>
								<option value=''>— Chọn khoa/phòng —</option>
								{departments.map((d) => (
									<option key={d.id} value={d.id}>
										{d.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Số tiết</label>
							<input
								className={styles.formInput}
								value={form.lesson_hours}
								onChange={set('lesson_hours')}
								inputMode='decimal'
								placeholder='VD: 4'
							/>
							<span className={styles.hint}>1 tiết = 1 giờ tín chỉ CME (TT 32/2023)</span>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Khoa bắt buộc tham dự</label>
							<MultiSelect
								options={departments.map((d) => ({ id: d.id, label: d.name }))}
								selected={new Set(form.required_department_ids)}
								onChange={(next) => setForm((f) => ({ ...f, required_department_ids: [...next] }))}
								placeholder='Không bắt buộc'
								searchable
							/>
							<span className={styles.hint}>Dùng cho báo cáo nhân viên chưa tham dự</span>
						</div>
					</>
				) : (
					<>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Hình thức</label>
							<select
								className={styles.formInput}
								value={form.event_type}
								onChange={set('event_type')}
							>
								{(Object.keys(EVENT_TYPE_LABELS) as SeminarEventType[]).map((t) => (
									<option key={t} value={t}>
										{EVENT_TYPE_LABELS[t]}
									</option>
								))}
							</select>
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Phạm vi</label>
							<select
								className={styles.formInput}
								value={form.scope}
								onChange={set('scope')}
							>
								{(Object.keys(SCOPE_LABELS) as SeminarScope[]).map((s) => (
									<option key={s} value={s}>
										{SCOPE_LABELS[s]}
									</option>
								))}
							</select>
							{form.event_type === 'training' && form.scope === 'hosted' && (
								<span className={styles.hint}>Tập huấn BV tổ chức sẽ chuyển sang mục "Tập huấn bệnh viện"</span>
							)}
						</div>
					</>
				)}

				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>Địa điểm</label>
					<input
						className={styles.formInput}
						value={form.location}
						onChange={set('location')}
					/>
				</div>

				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Ngày bắt đầu</label>
					<DatePicker
						value={form.start_date}
						onChange={(val) => setForm((f) => ({ ...f, start_date: val }))}
						max={form.end_date || undefined}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Ngày kết thúc</label>
					<DatePicker
						value={form.end_date}
						onChange={(val) => setForm((f) => ({ ...f, end_date: val }))}
						min={form.start_date || undefined}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Giờ bắt đầu</label>
					<input
						type='time'
						className={styles.formInput}
						value={form.start_time}
						onChange={set('start_time')}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Giờ kết thúc</label>
					<input
						type='time'
						className={`${styles.formInput} ${timeErr ? styles.inputError : ''}`}
						value={form.end_time}
						onChange={set('end_time')}
					/>
					{timeErr ? (
						<div className={styles.fieldError}>{timeErr}</div>
					) : (
						<span className={styles.hint}>Vào ngày kết thúc (trống thì tính ngày bắt đầu)</span>
					)}
				</div>

				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Thời gian (dạng chữ)</label>
					<input
						className={styles.formInput}
						value={form.date_text}
						onChange={set('date_text')}
						placeholder='VD: 05-06/06/2026'
					/>
					<span className={styles.hint}>
						Giữ nguyên chuỗi gốc khi ngày không theo chuẩn
					</span>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Năm sự kiện</label>
					<input
						className={styles.formInput}
						value={form.event_year}
						onChange={set('event_year')}
						placeholder='2026'
						inputMode='numeric'
					/>
					<span className={styles.hint}>
						Dùng cho chu trình cấp số CME theo năm
					</span>
				</div>

				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Người điều phối</label>
					<input
						className={styles.formInput}
						value={form.coordinator}
						onChange={set('coordinator')}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Chủ tọa (nếu BV tổ chức)</label>
					<input
						className={styles.formInput}
						value={form.host_chair}
						onChange={set('host_chair')}
					/>
				</div>

				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>Báo cáo viên</label>
					<input
						className={styles.formInput}
						value={form.speakers}
						onChange={set('speakers')}
					/>
				</div>

				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Công văn cấp phép của Sở</label>
					<input
						className={styles.formInput}
						value={form.permit_doc_no}
						onChange={set('permit_doc_no')}
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Đơn vị phối hợp tổ chức</label>
					<input
						className={styles.formInput}
						value={form.co_organizers}
						onChange={set('co_organizers')}
					/>
				</div>

				<div className={styles.formGroup}>
					<label className={styles.checkFilter}>
						<input
							type='checkbox'
							checked={form.grants_cme}
							onChange={set('grants_cme')}
						/>
						Có cấp CME
					</label>
				</div>
				{form.grants_cme && !ht && (
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Tín chỉ CME / người</label>
						<input
							className={styles.formInput}
							value={form.cme_default_credits}
							onChange={set('cme_default_credits')}
							placeholder='VD: 3 hoặc 3.5'
							inputMode='decimal'
						/>
						<span className={styles.hint}>
							Số tín chỉ mỗi đại biểu, không phải tổng số chứng chỉ
						</span>
					</div>
				)}

				{/* ── Số liệu tổng hợp (khi chưa nhập từng người) ── */}
				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel} style={{ fontWeight: 700 }}>
						Số liệu tổng hợp
					</label>
					<span className={styles.hint}>
						Nhập nhanh số lượng ở đây nếu chưa cần danh sách từng người. Khi
						có số nhập tay, hệ thống hiển thị số này thay cho số đếm tự động.
					</span>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Số lượng người tham dự</label>
					<input
						className={styles.formInput}
						value={form.manual_participant_count}
						onChange={set('manual_participant_count')}
						inputMode='numeric'
						placeholder='VD: 260'
					/>
				</div>
				{form.grants_cme && (
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>Số lượng chứng chỉ CME</label>
						<input
							className={styles.formInput}
							value={form.manual_cme_count}
							onChange={set('manual_cme_count')}
							inputMode='numeric'
							placeholder='VD: 330'
						/>
					</div>
				)}
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Trong đó: nội viện</label>
					<input
						className={styles.formInput}
						value={form.manual_internal_count}
						onChange={set('manual_internal_count')}
						inputMode='numeric'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Ngoại viện</label>
					<input
						className={styles.formInput}
						value={form.manual_external_count}
						onChange={set('manual_external_count')}
						inputMode='numeric'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Nước ngoài</label>
					<input
						className={styles.formInput}
						value={form.manual_foreign_count}
						onChange={set('manual_foreign_count')}
						inputMode='numeric'
					/>
				</div>

				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel}>Ghi chú</label>
					<textarea
						className={styles.formTextarea}
						rows={2}
						value={form.notes}
						onChange={set('notes')}
					/>
				</div>
			</div>
		</Modal>
	);
}
