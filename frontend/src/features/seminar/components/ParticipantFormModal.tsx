import { DatePicker, Modal } from '@/shared/components';
import { useEffect, useId, useState } from 'react';
import { CheckSvg, UsersSvg } from '@/assets/icons';
import { searchUsers, type UserSuggestion } from '../../topics/api/topicApi';
import {
	EMPTY_PARTICIPANT_FORM,
	PARTICIPATION_LABELS,
	SOURCE_LABELS,
	type ParticipantForm,
	type ParticipantSource,
	type ParticipationType,
	type SeminarParticipant,
} from '../types/seminar.type';
import { GENDER_OPTIONS } from '../../../shared/utils/gender';
import styles from '../pages/Seminar.module.css';

function toForm(p: SeminarParticipant): ParticipantForm {
	return {
		user_id: p.user_id,
		title_prefix: p.title_prefix ?? '',
		full_name: p.full_name,
		dob: p.dob ? p.dob.slice(0, 10) : '',
		dob_text: p.dob_text ?? '',
		gender: p.gender ?? '',
		organization: p.organization ?? '',
		department_raw: p.department_raw ?? '',
		staff_number: p.staff_number != null ? String(p.staff_number) : '',
		qualification_raw: p.qualification_raw ?? '',
		source: p.source,
		is_foreign: p.is_foreign,
		participation_type: p.participation_type,
		cme_credits: p.cme_credits != null ? String(p.cme_credits) : '',
		notes: p.notes ?? '',
	};
}

export function ParticipantFormModal({
	mode,
	participant,
	loading,
	onClose,
	onSave,
}: {
	mode: 'add' | 'edit';
	participant?: SeminarParticipant | null;
	loading: boolean;
	onClose: () => void;
	onSave: (form: ParticipantForm) => void | Promise<unknown>;
}) {
	const [form, setForm] = useState<ParticipantForm>(
		participant ? toForm(participant) : EMPTY_PARTICIPANT_FORM,
	);
	const [err, setErr] = useState('');
	const uid = useId();
	const fid = (n: string) => `${uid}-${n}`;
	const [q, setQ] = useState('');
	const [sugs, setSugs] = useState<UserSuggestion[]>([]);
	const [showSugs, setShowSugs] = useState(false);

	useEffect(() => {
		const run = () => {
			if (form.source !== 'internal' || !q.trim() || form.user_id) {
				setSugs([]);
				return;
			}
			searchUsers(q.trim())
				.then((res) => {
					setSugs(res.data);
					setShowSugs(true);
				})
				.catch(() => setSugs([]));
		};
		const t = setTimeout(run, 300);
		return () => clearTimeout(t);
	}, [q, form.source, form.user_id]);

	const pickUser = (u: UserSuggestion) => {
		setForm((f) => ({
			...f,
			user_id: u.id,
			full_name: u.full_name,
			staff_number: u.staff_number ?? '',
			source: 'internal',
		}));
		setQ(u.full_name);
		setShowSugs(false);
	};

	const clearUser = () =>
		setForm((f) => ({ ...f, user_id: null }));

	const set =
		<K extends keyof ParticipantForm>(k: K) =>
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
		};

	const submit = async () => {
		if (!form.full_name.trim()) {
			setErr('Vui lòng nhập họ tên');
			return;
		}
		await onSave(form);
	};

	return (
		<Modal
			open
			onClose={onClose}
			icon={<UsersSvg />}
			title={mode === 'add' ? 'Thêm người tham dự' : 'Sửa người tham dự'}
			subtitle='Nội viện: chọn từ danh bạ cán bộ · Ngoại viện: nhập tay'
			className={styles.modal}
			bodyClassName={styles.modalBody}
			footer={
				<>
					<button
						type='button'
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Hủy
					</button>
					<button
						type='button'
						className={styles.btnPrimary}
						onClick={submit}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm' : 'Lưu'}
					</button>
				</>
			}
		>
			<div className={styles.formGrid}>
				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('source')}>Nguồn</label>
					<select
						id={fid('source')}
						className={styles.formInput}
						value={form.source}
						onChange={(e) => {
							const source = e.target.value as ParticipantSource;
							setForm((f) => ({
								...f,
								source,
								user_id: source === 'external' ? null : f.user_id,
							}));
						}}
					>
						{(Object.keys(SOURCE_LABELS) as ParticipantSource[]).map((s) => (
							<option key={s} value={s}>
								{SOURCE_LABELS[s]}
							</option>
						))}
					</select>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('role')}>Vai trò</label>
					<select
						id={fid('role')}
						className={styles.formInput}
						value={form.participation_type}
						onChange={set('participation_type')}
					>
						{(Object.keys(PARTICIPATION_LABELS) as ParticipationType[]).map(
							(t) => (
								<option key={t} value={t}>
									{PARTICIPATION_LABELS[t]}
								</option>
							),
						)}
					</select>
				</div>

				{form.source === 'internal' && !form.user_id && mode === 'add' && (
					<div className={`${styles.formGroup} ${styles.full} ${styles.acWrap}`}>
						<label className={styles.formLabel} htmlFor={fid('search')}>Tìm cán bộ</label>
						<input
							id={fid('search')}
							className={styles.formInput}
							value={q}
							onChange={(e) => setQ(e.target.value)}
							placeholder='Tên hoặc mã nhân viên...'
							onFocus={() => sugs.length && setShowSugs(true)}
						/>
						{showSugs && sugs.length > 0 && (
							<div className={styles.acList} role='group' aria-label='Gợi ý cán bộ'>
								{sugs.map((u) => (
									<button
										type='button'
										key={u.id}
										className={styles.acItem}
										onClick={() => pickUser(u)}
									>
										{u.full_name}{' '}
										<span className={styles.acMeta}>
											#{u.staff_number ?? '—'}
										</span>
									</button>
								))}
							</div>
						)}
					</div>
				)}

				<div className={`${styles.formGroup} ${styles.full}`}>
					<div className={styles.formLabel}>
						<label htmlFor={fid('name')}>
							Họ tên <span className={styles.required}>*</span>
						</label>
						{form.user_id && (
							<button
								type='button'
								className={styles.hint}
								style={{ marginLeft: 8, cursor: 'pointer' }}
								onClick={clearUser}
							>
								(bỏ liên kết cán bộ)
							</button>
						)}
					</div>
					<input
						id={fid('name')}
						className={`${styles.formInput} ${err ? styles.inputError : ''}`}
						value={form.full_name}
						onChange={set('full_name')}
						disabled={!!form.user_id}
						aria-required='true'
						aria-invalid={err ? true : undefined}
						aria-describedby={err ? fid('name-err') : undefined}
					/>
					{err && (
						<div
							id={fid('name-err')}
							className={styles.fieldError}
							role='alert'
						>
							{err}
						</div>
					)}
				</div>

				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('prefix')}>Danh xưng</label>
					<input
						id={fid('prefix')}
						className={styles.formInput}
						value={form.title_prefix}
						onChange={set('title_prefix')}
						placeholder='Ông / Bà'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('gender')}>Giới tính</label>
					<select
						id={fid('gender')}
						className={styles.formInput}
						value={form.gender}
						onChange={set('gender')}
					>
						<option value=''>—</option>
						{GENDER_OPTIONS.map((g) => (
							<option
								key={g.value}
								value={g.value}
							>
								{g.label}
							</option>
						))}
					</select>
				</div>

				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('dob')}>Ngày sinh</label>
					<DatePicker id={fid('dob')} value={form.dob} onChange={(v) => setForm((f) => ({ ...f, dob: v }))} />
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('dobText')}>Ngày sinh (dạng chữ)</label>
					<input
						id={fid('dobText')}
						className={styles.formInput}
						value={form.dob_text}
						onChange={set('dob_text')}
						placeholder='VD: 1989'
					/>
				</div>

				{form.source === 'external' ? (
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.formLabel} htmlFor={fid('org')}>Đơn vị công tác</label>
						<input
							id={fid('org')}
							className={styles.formInput}
							value={form.organization}
							onChange={set('organization')}
						/>
					</div>
				) : (
					<div className={`${styles.formGroup} ${styles.full}`}>
						<label className={styles.formLabel} htmlFor={fid('dept')}>
							Khoa/phòng (ghi trong danh sách)
						</label>
						<input
							id={fid('dept')}
							className={styles.formInput}
							value={form.department_raw}
							onChange={set('department_raw')}
						/>
					</div>
				)}

				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('staff')}>Mã nhân viên</label>
					<input
						id={fid('staff')}
						className={styles.formInput}
						value={form.staff_number}
						onChange={set('staff_number')}
						inputMode='numeric'
					/>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('qual')}>Trình độ chuyên môn</label>
					<input
						id={fid('qual')}
						className={styles.formInput}
						value={form.qualification_raw}
						onChange={set('qualification_raw')}
					/>
				</div>

				<div className={styles.formGroup}>
					<label className={styles.checkFilter}>
						<input
							type='checkbox'
							checked={form.is_foreign}
							onChange={set('is_foreign')}
						/>
						Đại biểu nước ngoài
					</label>
				</div>
				<div className={styles.formGroup}>
					<label className={styles.formLabel} htmlFor={fid('cme')}>Tín chỉ CME</label>
					<input
						id={fid('cme')}
						className={styles.formInput}
						value={form.cme_credits}
						onChange={set('cme_credits')}
						inputMode='decimal'
						placeholder='VD: 3 hoặc 3.5'
					/>
				</div>

				<div className={`${styles.formGroup} ${styles.full}`}>
					<label className={styles.formLabel} htmlFor={fid('notes')}>Ghi chú</label>
					<input
						id={fid('notes')}
						className={styles.formInput}
						value={form.notes}
						onChange={set('notes')}
					/>
				</div>
			</div>
		</Modal>
	);
}
