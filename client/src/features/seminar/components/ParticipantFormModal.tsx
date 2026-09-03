import { useEffect, useState } from 'react';
import { CheckSvg, UsersSvg, XSvg } from '@/assets/icons';
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
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={styles.modal}>
				<div className={styles.modalHeader}>
					<UsersSvg />
					<div>
						<div className={styles.modalTitle}>
							{mode === 'add' ? 'Thêm người tham dự' : 'Sửa người tham dự'}
						</div>
						<div className={styles.modalSub}>
							Nội viện: chọn từ danh bạ cán bộ · Ngoại viện: nhập tay
						</div>
					</div>
					<button className={styles.modalClose} onClick={onClose}>
						<XSvg />
					</button>
				</div>

				<div className={styles.modalBody}>
					<div className={styles.formGrid}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Nguồn</label>
							<select
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
							<label className={styles.formLabel}>Vai trò</label>
							<select
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
								<label className={styles.formLabel}>Tìm cán bộ</label>
								<input
									className={styles.formInput}
									value={q}
									onChange={(e) => setQ(e.target.value)}
									placeholder='Tên hoặc mã nhân viên...'
									onFocus={() => sugs.length && setShowSugs(true)}
								/>
								{showSugs && sugs.length > 0 && (
									<div className={styles.acList}>
										{sugs.map((u) => (
											<div
												key={u.id}
												className={styles.acItem}
												onClick={() => pickUser(u)}
											>
												{u.full_name}{' '}
												<span className={styles.acMeta}>
													#{u.staff_number ?? '—'}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						)}

						<div className={`${styles.formGroup} ${styles.full}`}>
							<label className={styles.formLabel}>
								Họ tên <span className={styles.required}>*</span>
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
							</label>
							<input
								className={`${styles.formInput} ${err ? styles.inputError : ''}`}
								value={form.full_name}
								onChange={set('full_name')}
								disabled={!!form.user_id}
							/>
							{err && <div className={styles.fieldError}>{err}</div>}
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Danh xưng</label>
							<input
								className={styles.formInput}
								value={form.title_prefix}
								onChange={set('title_prefix')}
								placeholder='Ông / Bà'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Giới tính</label>
							<select
								className={styles.formInput}
								value={form.gender}
								onChange={set('gender')}
							>
								<option value=''>—</option>
								<option value='Nam'>Nam</option>
								<option value='Nữ'>Nữ</option>
							</select>
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Ngày sinh</label>
							<input
								type='date'
								className={styles.formInput}
								value={form.dob}
								onChange={set('dob')}
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Ngày sinh (dạng chữ)</label>
							<input
								className={styles.formInput}
								value={form.dob_text}
								onChange={set('dob_text')}
								placeholder='VD: 1989'
							/>
						</div>

						{form.source === 'external' ? (
							<div className={`${styles.formGroup} ${styles.full}`}>
								<label className={styles.formLabel}>Đơn vị công tác</label>
								<input
									className={styles.formInput}
									value={form.organization}
									onChange={set('organization')}
								/>
							</div>
						) : (
							<div className={`${styles.formGroup} ${styles.full}`}>
								<label className={styles.formLabel}>
									Khoa/phòng (ghi trong danh sách)
								</label>
								<input
									className={styles.formInput}
									value={form.department_raw}
									onChange={set('department_raw')}
								/>
							</div>
						)}

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Mã nhân viên</label>
							<input
								className={styles.formInput}
								value={form.staff_number}
								onChange={set('staff_number')}
								inputMode='numeric'
							/>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Trình độ chuyên môn</label>
							<input
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
							<label className={styles.formLabel}>Tín chỉ CME</label>
							<input
								className={styles.formInput}
								value={form.cme_credits}
								onChange={set('cme_credits')}
								inputMode='decimal'
								placeholder='VD: 3 hoặc 3.5'
							/>
						</div>

						<div className={`${styles.formGroup} ${styles.full}`}>
							<label className={styles.formLabel}>Ghi chú</label>
							<input
								className={styles.formInput}
								value={form.notes}
								onChange={set('notes')}
							/>
						</div>
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
						className={styles.btnPrimary}
						onClick={submit}
						disabled={loading}
					>
						{loading ? <span className={styles.spinner} /> : <CheckSvg />}
						{mode === 'add' ? 'Thêm' : 'Lưu'}
					</button>
				</div>
			</div>
		</div>
	);
}
