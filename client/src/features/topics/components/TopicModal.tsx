import { useEffect, useRef, useState } from 'react';
import {
	searchUsers,
	type SimpleItem,
	type UserSuggestion,
} from '../api/topicApi';
import styles from '../pages/Topic.module.css';
import type {
	FormErrors,
	MemberRole,
	Topic,
	TopicForm,
	TopicStatus,
} from '../types/topic.type';
import {
	MEMBER_ROLE_CFG,
	STATUS_CFG,
	getInitials,
} from '../utils/topicHelpers';
import { Ic } from '../utils/topicIcons';
import { Badge } from './shared/Badge';
import { FormField } from './shared/FormField';

export interface PendingMember {
	tempId: string;
	ho_ten: string;
	staff_number: string;
	email?: string;
	so_dien_thoai?: string;
	chuc_vu?: string;
	username?: string;
	department_id?: string;
	department_name?: string;
	role: MemberRole;
}

interface TopicModalProps {
	mode: 'create' | 'edit';
	topic?: Topic;
	categories: SimpleItem[];
	levels: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
	onClose: () => void;
	onSave: (form: TopicForm, members: PendingMember[]) => Promise<void>;
}

export function TopicModal({
	mode,
	topic,
	categories,
	levels,
	rounds,
	departments,
	onClose,
	onSave,
}: TopicModalProps) {
	const [form, setForm] = useState<TopicForm>({
		title: topic?.title ?? '',
		description: topic?.description ?? '',
		round_id: topic?.round_id ?? '',
		category_id: topic?.category_id ?? '',
		level_id: topic?.level_id ?? '',
		department_id: topic?.department_id ?? '',
		status: topic?.status ?? 'submitted',
	});
	const [errors, setErrors] = useState<FormErrors>({});
	const [loading, setLoading] = useState(false);
	const [saveError, setSaveError] = useState('');

	const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
	const [memberQuery, setMemberQuery] = useState('');
	const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [addRole, setAddRole] = useState<MemberRole>('member');
	const [isManualAdd, setIsManualAdd] = useState(false);
	const [manualForm, setManualForm] = useState({
		ho_ten: '',
		staff_number: '',
		email: '',
		so_dien_thoai: '',
		chuc_vu: '',
		department_id: '',
	});
	const [manualRole, setManualRole] = useState<MemberRole>('member');
	const [manualError, setManualError] = useState('');
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (memberQuery.trim().length < 2) return;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			setIsSearching(true);
			searchUsers(memberQuery)
				.then((res) => {
					setSuggestions(res.data);
					setShowSuggestions(true);
				})
				.catch(() => setSuggestions([]))
				.finally(() => setIsSearching(false));
		}, 300);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [memberQuery]);

	const deptName = (id: string) =>
		departments.find((d) => d.id === id)?.name ?? '';

	const selectUser = (u: UserSuggestion) => {
		if (pendingMembers.some((m) => m.staff_number === (u.staff_number ?? '')))
			return;
		setPendingMembers((prev) => [
			...prev,
			{
				tempId: u.id,
				ho_ten: u.full_name,
				staff_number: u.staff_number != null ? String(u.staff_number) : '',
				email: u.email,
				username: u.username,
				department_id: u.department_id,
				department_name: deptName(u.department_id),
				role: addRole,
			},
		]);
		setMemberQuery('');
		setSuggestions([]);
		setShowSuggestions(false);
	};

	const addManual = () => {
		if (!manualForm.ho_ten.trim()) {
			setManualError('Vui lòng nhập họ tên');
			return;
		}
		if (!manualForm.staff_number.trim()) {
			setManualError('Vui lòng nhập mã nhân viên');
			return;
		}
		if (
			pendingMembers.some(
				(m) => m.staff_number === manualForm.staff_number.trim(),
			)
		) {
			setManualError('Mã nhân viên này đã được thêm');
			return;
		}
		setPendingMembers((prev) => [
			...prev,
			{
				tempId: `manual-${Date.now()}`,
				ho_ten: manualForm.ho_ten.trim(),
				staff_number: manualForm.staff_number.trim(),
				email: manualForm.email.trim() || undefined,
				so_dien_thoai: manualForm.so_dien_thoai.trim() || undefined,
				chuc_vu: manualForm.chuc_vu.trim() || undefined,
				department_id: manualForm.department_id || undefined,
				department_name: deptName(manualForm.department_id),
				role: manualRole,
			},
		]);
		setManualForm({ ho_ten: '', staff_number: '', email: '', so_dien_thoai: '', chuc_vu: '', department_id: '' });
		setManualError('');
		setIsManualAdd(false);
	};

	const removeMember = (tempId: string) =>
		setPendingMembers((prev) => prev.filter((m) => m.tempId !== tempId));

	const set = (field: keyof TopicForm, val: string) => {
		setForm((p) => ({ ...p, [field]: val }));
		if (errors[field])
			setErrors((p) => {
				const n = { ...p };
				delete n[field];
				return n;
			});
	};

	const validate = (): boolean => {
		const e: FormErrors = {};
		if (!form.title.trim()) e.title = 'Vui lòng nhập tên đề tài';
		else if (form.title.length < 10)
			e.title = 'Tên đề tài quá ngắn (ít nhất 10 ký tự)';
		if (!form.round_id) e.round_id = 'Vui lòng chọn đợt nghiên cứu';
		if (!form.category_id) e.category_id = 'Vui lòng chọn phân loại';
		if (!form.level_id) e.level_id = 'Vui lòng chọn cấp độ';
		if (!form.department_id) e.department_id = 'Vui lòng chọn phòng ban / khoa';
		setErrors(e);
		return Object.keys(e).length === 0;
	};

	const handleSubmit = async () => {
		if (!validate()) return;
		setLoading(true);
		setSaveError('');
		try {
			await onSave(form, pendingMembers);
		} catch (err: unknown) {
			setSaveError(err instanceof Error ? err.message : 'Lỗi lưu đề tài');
			setLoading(false);
		}
	};

	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				className={styles.modal}
				role='dialog'
				aria-modal='true'
				aria-labelledby='modal-title'
			>
				<div className={styles.modalHeader}>
					<div>
						<h2
							id='modal-title'
							className={styles.modalTitle}
						>
							{mode === 'create' ? 'Đăng ký đề tài mới' : 'Chỉnh sửa đề tài'}
						</h2>
						<p className={styles.modalSubtitle}>
							{mode === 'create'
								? 'Tạo đề tài nghiên cứu khoa học mới'
								: `Cập nhật thông tin — ${topic?.id}`}
						</p>
					</div>
					<button
						className={styles.modalCloseBtn}
						onClick={onClose}
						aria-label='Đóng'
					>
						<Ic.X />
					</button>
				</div>

				<div className={styles.modalBody}>
					{/* ── THÔNG TIN ĐỀ TÀI ── */}
					<div className={styles.formSection}>Thông tin đề tài</div>

					<FormField
						id='title'
						label='Tên đề tài'
						required
						error={errors.title}
						hint={`${form.title.length}/500 ký tự`}
					>
						<textarea
							id='title'
							className={`${styles.formInput} ${errors.title ? styles.hasError : ''}`}
							placeholder='Nhập tên đề tài nghiên cứu đầy đủ...'
							value={form.title}
							onChange={(e) => set('title', e.target.value)}
							rows={3}
							maxLength={500}
						/>
					</FormField>

					<FormField
						id='description'
						label='Mô tả / Tóm tắt'
						hint='Mô tả mục tiêu, phương pháp, kết quả kỳ vọng'
					>
						<textarea
							id='description'
							className={styles.formInput}
							placeholder='Nhập tóm tắt đề tài...'
							value={form.description}
							onChange={(e) => set('description', e.target.value)}
							rows={3}
							maxLength={2000}
						/>
					</FormField>

					{/* ── PHÂN LOẠI & ĐỢT NC ── */}
					<div className={styles.formSection}>Phân loại & Đợt nghiên cứu</div>

					<div className={styles.formRow}>
						<FormField
							id='round_id'
							label='Đợt nghiên cứu'
							required
							error={errors.round_id}
						>
							<select
								id='round_id'
								className={styles.formSelect}
								value={form.round_id}
								onChange={(e) => set('round_id', e.target.value)}
							>
								<option value=''>— Chọn đợt —</option>
								{rounds.map((r) => (
									<option
										key={r.id}
										value={r.id}
									>
										{r.name}
									</option>
								))}
							</select>
						</FormField>
						<FormField
							id='category_id'
							label='Phân loại'
							required
							error={errors.category_id}
						>
							<select
								id='category_id'
								className={styles.formSelect}
								value={form.category_id}
								onChange={(e) => set('category_id', e.target.value)}
							>
								<option value=''>— Chọn phân loại —</option>
								{categories.map((c) => (
									<option
										key={c.id}
										value={c.id}
									>
										{c.name}
									</option>
								))}
							</select>
						</FormField>
					</div>

					<div className={styles.formRow}>
						<FormField
							id='level_id'
							label='Cấp độ đề tài'
							required
							error={errors.level_id}
						>
							<select
								id='level_id'
								className={styles.formSelect}
								value={form.level_id}
								onChange={(e) => set('level_id', e.target.value)}
							>
								<option value=''>— Chọn cấp độ —</option>
								{levels.map((l) => (
									<option
										key={l.id}
										value={l.id}
									>
										{l.name}
									</option>
								))}
							</select>
						</FormField>
						<FormField
							id='department_id'
							label='Phòng ban / Khoa'
							required
							error={errors.department_id}
						>
							<select
								id='department_id'
								className={styles.formSelect}
								value={form.department_id}
								onChange={(e) => set('department_id', e.target.value)}
							>
								<option value=''>— Chọn phòng ban —</option>
								{departments.map((d) => (
									<option
										key={d.id}
										value={d.id}
									>
										{d.name}
									</option>
								))}
							</select>
						</FormField>
					</div>

					{/* ── TRẠNG THÁI ── */}
					<FormField
						id='status'
						label='Trạng thái đề tài'
					>
						<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
							{(Object.keys(STATUS_CFG) as TopicStatus[]).map((s) => (
								<button
									key={s}
									type='button'
									onClick={() => set('status', s)}
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 6,
										padding: '6px 14px',
										borderRadius: 20,
										fontSize: 13,
										fontWeight: 600,
										cursor: 'pointer',
										transition: 'all 0.15s',
										border:
											form.status === s
												? '2px solid var(--color-primary)'
												: '2px solid var(--color-gray-200)',
										background:
											form.status === s
												? 'var(--color-primary)'
												: 'var(--color-white)',
										color: form.status === s ? '#fff' : 'var(--color-gray-600)',
									}}
								>
									<span
										style={{
											width: 7,
											height: 7,
											borderRadius: '50%',
											flexShrink: 0,
											background:
												form.status === s
													? 'rgba(255,255,255,0.8)'
													: s === 'approved'
														? '#2eb87a'
														: s === 'submitted'
															? '#ef9f27'
															: s === 'rejected'
																? '#e24b4a'
																: '#9ca3af',
										}}
									/>
									{STATUS_CFG[s].label}
								</button>
							))}
						</div>
					</FormField>

					{/* ── THÀNH VIÊN (chỉ khi tạo mới) ── */}
					{mode === 'create' && (
						<>
							<div className={styles.formSection}>
								Thành viên nghiên cứu
								<span
									style={{
										fontSize: 11,
										color: 'var(--color-gray-400)',
										fontWeight: 400,
										marginLeft: 8,
									}}
								>
									(tuỳ chọn — có thể thêm sau)
								</span>
							</div>

							{/* Search box */}
							<div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
								<div style={{ position: 'relative', flex: 1 }}>
									<svg
										style={{
											position: 'absolute',
											left: 10,
											top: '50%',
											transform: 'translateY(-50%)',
											width: 14,
											height: 14,
											color: 'var(--color-gray-400)',
											pointerEvents: 'none',
										}}
										viewBox='0 0 24 24'
										fill='none'
										stroke='currentColor'
										strokeWidth='2'
										strokeLinecap='round'
										strokeLinejoin='round'
									>
										<circle
											cx='11'
											cy='11'
											r='8'
										/>
										<line
											x1='21'
											y1='21'
											x2='16.65'
											y2='16.65'
										/>
									</svg>
									<input
										className={styles.formInput}
										style={{ paddingLeft: 32 }}
										placeholder='Tìm theo tên, mã nhân viên...'
										value={memberQuery}
										onChange={(e) => {
											const val = e.target.value;
											setMemberQuery(val);
											if (val.trim().length < 2) {
												setSuggestions([]);
												setShowSuggestions(false);
											}
										}}
									/>
								</div>
								<select
									className={styles.formSelect}
									style={{ width: 130, flexShrink: 0 }}
									value={addRole}
									onChange={(e) => setAddRole(e.target.value as MemberRole)}
								>
									{(Object.keys(MEMBER_ROLE_CFG) as MemberRole[]).map((r) => (
										<option
											key={r}
											value={r}
										>
											{MEMBER_ROLE_CFG[r].label}
										</option>
									))}
								</select>
							</div>

							{/* Nút thêm thủ công */}
							{!isManualAdd && (
								<button
									type='button'
									className={styles.btnSecondary}
									style={{ fontSize: 12, padding: '4px 10px', marginBottom: 8 }}
									onClick={() => {
										setIsManualAdd(true);
										setShowSuggestions(false);
										setMemberQuery('');
									}}
								>
									<Ic.Plus /> Thêm thủ công
								</button>
							)}

							{/* Kết quả tìm kiếm */}
							{showSuggestions && memberQuery.trim().length >= 2 && (
								<div
									style={{
										border: '1px solid var(--color-gray-200)',
										borderRadius: 8,
										overflow: 'hidden',
										marginBottom: 8,
									}}
								>
									{isSearching ? (
										<div
											style={{
												padding: '10px 14px',
												fontSize: 13,
												color: 'var(--color-gray-400)',
											}}
										>
											Đang tìm...
										</div>
									) : suggestions.length === 0 ? (
										<div
											style={{
												padding: '10px 14px',
												fontSize: 13,
												color: 'var(--color-gray-400)',
											}}
										>
											Không tìm thấy nhân viên —{' '}
											<button
												type='button'
												style={{
													color: 'var(--color-primary-dark)',
													fontWeight: 600,
													background: 'none',
													border: 'none',
													cursor: 'pointer',
													fontSize: 13,
												}}
												onClick={() => {
													setIsManualAdd(true);
													setShowSuggestions(false);
													setMemberQuery('');
												}}
											>
												thêm thủ công
											</button>
										</div>
									) : (
										suggestions.map((u) => {
											const alreadyAdded = pendingMembers.some(
												(m) => m.staff_number === (u.staff_number ?? ''),
											);
											return (
												<div
													key={u.id}
													onClick={() => !alreadyAdded && selectUser(u)}
													style={{
														display: 'flex',
														alignItems: 'center',
														gap: 10,
														padding: '8px 14px',
														cursor: alreadyAdded ? 'default' : 'pointer',
														borderBottom: '1px solid var(--color-gray-100)',
														background: alreadyAdded
															? 'var(--color-gray-50)'
															: undefined,
														transition: 'background 0.12s',
													}}
													onMouseEnter={(e) => {
														if (!alreadyAdded)
															(
																e.currentTarget as HTMLDivElement
															).style.background = '#f0fbf6';
													}}
													onMouseLeave={(e) => {
														(
															e.currentTarget as HTMLDivElement
														).style.background = alreadyAdded
															? 'var(--color-gray-50)'
															: '';
													}}
												>
													<div
														className={styles.memberAvatar}
														style={{
															width: 32,
															height: 32,
															fontSize: 11,
															flexShrink: 0,
														}}
													>
														{getInitials(u.full_name)}
													</div>
													<div style={{ flex: 1, minWidth: 0 }}>
														<div
															style={{
																fontWeight: 600,
																fontSize: 13,
																color: 'var(--color-gray-800)',
															}}
														>
															{u.full_name}
														</div>
														<div
															style={{
																fontSize: 11,
																color: 'var(--color-gray-400)',
															}}
														>
															{u.username} · MNV: {u.staff_number ?? '—'}
															{deptName(u.department_id)
																? ` · ${deptName(u.department_id)}`
																: ''}
														</div>
													</div>
													{alreadyAdded ? (
														<span
															style={{
																fontSize: 11,
																color: 'var(--color-primary-dark)',
																fontWeight: 600,
															}}
														>
															✓ Đã thêm
														</span>
													) : (
														<span
															style={{
																fontSize: 12,
																color: 'var(--color-primary-dark)',
																fontWeight: 600,
															}}
														>
															+ Thêm
														</span>
													)}
												</div>
											);
										})
									)}
									<div
										style={{
											padding: '8px 14px',
											borderTop: '1px solid var(--color-gray-100)',
											cursor: 'pointer',
											fontSize: 12,
											color: 'var(--color-gray-500)',
											display: 'flex',
											alignItems: 'center',
											gap: 6,
										}}
										onClick={() => {
											setIsManualAdd(true);
											setShowSuggestions(false);
											setMemberQuery('');
										}}
									>
										<Ic.Plus /> Thêm thủ công (không có trong hệ thống)
									</div>
								</div>
							)}

							{/* Form thêm thủ công */}
							{isManualAdd && (
								<div
									style={{
										background: 'var(--color-white)',
										border: '1.5px solid var(--color-gray-200)',
										borderRadius: 12,
										overflow: 'hidden',
										marginBottom: 8,
										boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
									}}
								>
									{/* Card header */}
									<div
										style={{
											display: 'flex',
											alignItems: 'center',
											justifyContent: 'space-between',
											padding: '10px 14px',
											background: 'var(--color-primary-pale)',
											borderBottom: '1px solid rgba(46,184,122,0.18)',
										}}
									>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<div
												style={{
													width: 28,
													height: 28,
													borderRadius: '50%',
													background: 'rgba(46,184,122,0.18)',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													color: 'var(--color-primary-dark)',
													flexShrink: 0,
												}}
											>
												<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
													<path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
													<circle cx='12' cy='7' r='4' />
												</svg>
											</div>
											<span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
												Thêm thành viên thủ công
											</span>
										</div>
										<button
											type='button'
											onClick={() => { setIsManualAdd(false); setManualError(''); }}
											style={{
												background: 'none',
												border: 'none',
												cursor: 'pointer',
												color: 'var(--color-gray-400)',
												padding: 4,
												borderRadius: 6,
												display: 'flex',
												alignItems: 'center',
											}}
										>
											<Ic.X />
										</button>
									</div>

									{/* Form body */}
									<div style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
										{/* Row 1: Họ tên (full width) */}
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>
												Họ tên <span className={styles.formRequired}>*</span>
											</label>
											<input
												className={styles.formInput}
												placeholder='Nguyễn Văn A'
												value={manualForm.ho_ten}
												onChange={(e) => setManualForm((p) => ({ ...p, ho_ten: e.target.value }))}
											/>
										</div>

										{/* Row 2: Mã nhân viên + Chức vụ */}
										<div className={styles.formRow}>
											<div className={styles.formGroup}>
												<label className={styles.formLabel}>
													Mã nhân viên <span className={styles.formRequired}>*</span>
												</label>
												<input
													className={styles.formInput}
													placeholder='VD: 0123'
													value={manualForm.staff_number}
													onChange={(e) => setManualForm((p) => ({ ...p, staff_number: e.target.value }))}
												/>
											</div>
											<div className={styles.formGroup}>
												<label className={styles.formLabel}>Chức vụ</label>
												<input
													className={styles.formInput}
													placeholder='Bác sĩ, Điều dưỡng...'
													value={manualForm.chuc_vu}
													onChange={(e) => setManualForm((p) => ({ ...p, chuc_vu: e.target.value }))}
												/>
											</div>
										</div>

										{/* Row 3: Khoa/Phòng ban (full width) */}
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>Khoa / Phòng ban</label>
											<select
												className={styles.formSelect}
												value={manualForm.department_id}
												onChange={(e) => setManualForm((p) => ({ ...p, department_id: e.target.value }))}
											>
												<option value=''>— Chọn khoa —</option>
												{departments.map((d) => (
													<option key={d.id} value={d.id}>{d.name}</option>
												))}
											</select>
										</div>

										{/* Row 3: Email + Số điện thoại */}
										<div className={styles.formRow}>
											<div className={styles.formGroup}>
												<label className={styles.formLabel}>Email</label>
												<input
													className={styles.formInput}
													placeholder='email@hospital.vn'
													type='email'
													value={manualForm.email}
													onChange={(e) => setManualForm((p) => ({ ...p, email: e.target.value }))}
												/>
											</div>
											<div className={styles.formGroup}>
												<label className={styles.formLabel}>Số điện thoại</label>
												<input
													className={styles.formInput}
													placeholder='0901234567'
													type='tel'
													value={manualForm.so_dien_thoai}
													onChange={(e) => setManualForm((p) => ({ ...p, so_dien_thoai: e.target.value }))}
												/>
											</div>
										</div>

										{/* Vai trò — chip selector */}
										<div className={styles.formGroup}>
											<label className={styles.formLabel}>Vai trò</label>
											<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
												{(Object.keys(MEMBER_ROLE_CFG) as MemberRole[]).map((r) => (
													<button
														key={r}
														type='button'
														onClick={() => setManualRole(r)}
														style={{
															display: 'flex',
															alignItems: 'center',
															gap: 6,
															padding: '5px 13px',
															borderRadius: 20,
															fontSize: 12,
															fontWeight: 600,
															cursor: 'pointer',
															transition: 'all 0.15s',
															border: manualRole === r
																? '2px solid var(--color-primary)'
																: '2px solid var(--color-gray-200)',
															background: manualRole === r
																? 'var(--color-primary)'
																: 'var(--color-white)',
															color: manualRole === r ? '#fff' : 'var(--color-gray-600)',
														}}
													>
														<span
															style={{
																width: 6,
																height: 6,
																borderRadius: '50%',
																flexShrink: 0,
																background: manualRole === r
																	? 'rgba(255,255,255,0.8)'
																	: 'var(--color-gray-300)',
															}}
														/>
														{MEMBER_ROLE_CFG[r].label}
													</button>
												))}
											</div>
										</div>

										{/* Error */}
										{manualError && (
											<div
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: 7,
													padding: '8px 12px',
													background: '#fef2f2',
													border: '1px solid #fecaca',
													borderRadius: 8,
													fontSize: 12,
													color: '#991b1b',
												}}
											>
												<Ic.Alert /> {manualError}
											</div>
										)}

										{/* Buttons */}
										<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
											<button
												className={styles.btnSecondary}
												style={{ padding: '6px 14px', fontSize: 12 }}
												type='button'
												onClick={() => { setIsManualAdd(false); setManualError(''); }}
											>
												Huỷ
											</button>
											<button
												className={styles.btnPrimary}
												style={{ padding: '6px 14px', fontSize: 12 }}
												type='button'
												onClick={addManual}
											>
												<Ic.Plus /> Thêm thành viên
											</button>
										</div>
									</div>
								</div>
							)}

							{/* Danh sách thành viên đã chọn */}
							{pendingMembers.length > 0 && (
								<div
									style={{
										border: '1px solid var(--color-gray-200)',
										borderRadius: 8,
										overflow: 'hidden',
									}}
								>
									{pendingMembers.map((m) => {
										const rc = MEMBER_ROLE_CFG[m.role];
										return (
											<div
												key={m.tempId}
												className={styles.memberItem}
												style={{ padding: '8px 12px' }}
											>
												<div
													className={styles.memberAvatar}
													style={{ width: 32, height: 32, fontSize: 11 }}
												>
													{getInitials(m.ho_ten)}
												</div>
												<div className={styles.memberInfo}>
													<div className={styles.memberName}>{m.ho_ten}</div>
													<div className={styles.memberMeta}>
														MNV: {m.staff_number || 'N/A'}
														{m.email && ` · ${m.email}`}
														{m.so_dien_thoai && ` · ${m.so_dien_thoai}`}
														{m.username && ` · ${m.username}`}
														{m.department_name && ` · ${m.department_name}`}
													</div>
												</div>
												<Badge cls={rc.cls}>{rc.label}</Badge>
												<button
													type='button'
													onClick={() => removeMember(m.tempId)}
													style={{
														background: 'none',
														border: 'none',
														cursor: 'pointer',
														color: 'var(--color-gray-400)',
														padding: 4,
														borderRadius: 4,
														display: 'flex',
														alignItems: 'center',
													}}
													title='Xoá khỏi danh sách'
												>
													<Ic.X />
												</button>
											</div>
										);
									})}
								</div>
							)}
						</>
					)}
				</div>

				<div className={styles.modalFooter}>
					{saveError && (
						<span
							style={{ fontSize: 12, color: 'var(--color-red-600)', flex: 1 }}
						>
							<Ic.Alert /> {saveError}
						</span>
					)}
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Huỷ
					</button>
					<button
						className={styles.btnPrimary}
						onClick={handleSubmit}
						disabled={loading}
					>
						{loading ? (
							<>
								<span className={styles.spinner} />
								Đang lưu...
							</>
						) : mode === 'create' ? (
							<>
								<Ic.Plus />
								Đăng ký đề tài
								{pendingMembers.length > 0
									? ` (${pendingMembers.length} TV)`
									: ''}
							</>
						) : (
							<>
								<Ic.Check />
								Lưu thay đổi
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
