import {
	AlertSvg,
	PlusSvg,
	SearchSvg,
	UserPlusSvg,
} from '@/assets/icons';
import type { SimpleItem, UserSuggestion } from '../api/topicApi';
import type { ManualForm } from '../hooks/useTopicRegister';
import type { MemberRole } from '../types/topic.type';
import type { PendingMember } from '../types/topicregister.type';
import { getInitials } from '../../../shared/utils/helper';
import styles from '../pages/TopicRegister.module.css';
import { PendingMemberRow } from './PendingMemberList';
import { RoleSelectPill } from './RoleSelectPill';

interface RegisterMemberSectionProps {
	depts: SimpleItem[];
	roleKeys: MemberRole[];
	roleCfg: Partial<Record<MemberRole, { label: string }>>;
	memberQuery: string;
	setMemberQuery: (v: string) => void;
	suggestions: UserSuggestion[];
	setSuggestions: (v: UserSuggestion[]) => void;
	showSuggestions: boolean;
	setShowSuggestions: (v: boolean) => void;
	isSearching: boolean;
	addRole: MemberRole;
	setAddRole: (v: MemberRole) => void;
	addedIds: Set<string>;
	addMember: (u: UserSuggestion) => void;
	pendingMembers: PendingMember[];
	removeMember: (id: string) => void;
	changeRole: (id: string, role: MemberRole) => void;
	showManualForm: boolean;
	setShowManualForm: (v: boolean) => void;
	manualForm: ManualForm;
	setManualForm: (v: ManualForm) => void;
	manualErrors: Record<string, string>;
	setManualErrors: (v: Record<string, string>) => void;
	addMemberManual: () => void;
}

export function RegisterMemberSection({
	depts,
	roleKeys,
	roleCfg,
	memberQuery,
	setMemberQuery,
	suggestions,
	setSuggestions,
	showSuggestions,
	setShowSuggestions,
	isSearching,
	addRole,
	setAddRole,
	addedIds,
	addMember,
	pendingMembers,
	removeMember,
	changeRole,
	showManualForm,
	setShowManualForm,
	manualForm,
	setManualForm,
	manualErrors,
	setManualErrors,
	addMemberManual,
}: RegisterMemberSectionProps) {
	return (
		<>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Tìm kiếm thành viên</label>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
					<div
						className={styles.memberSearch}
						style={{ flex: 1, marginBottom: 0 }}
					>
						<span className={styles.memberSearchIcon}>
							{isSearching ? (
								<span
									style={{
										width: 15,
										height: 15,
										border: '2px solid #cbd5e1',
										borderTopColor: '#1a6abd',
										borderRadius: '50%',
										display: 'inline-block',
										animation: 'spin 0.6s linear infinite',
									}}
								/>
							) : (
								<SearchSvg />
							)}
						</span>
						<input
							className={styles.memberSearchInput}
							placeholder='Tìm theo tên hoặc mã nhân viên...'
							value={memberQuery}
							onChange={(e) => {
								const val = e.target.value;
								setMemberQuery(val);
								if (val.trim().length < 2) {
									setSuggestions([]);
									setShowSuggestions(false);
								}
							}}
							onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
							onFocus={() =>
								suggestions.length > 0 && setShowSuggestions(true)
							}
						/>
						{showSuggestions && (
							<div className={styles.suggestionsBox}>
								{suggestions.length > 0 ? (
									suggestions.map((u) => {
										const already = addedIds.has(u.id);
										return (
											<div
												key={u.id}
												className={`${styles.suggestionItem} ${already ? styles.suggestionDisabled : ''}`}
												onMouseDown={() => !already && addMember(u)}
											>
												<div className={styles.suggAvatar}>
													{getInitials(u.full_name)}
												</div>
												<div style={{ flex: 1, minWidth: 0 }}>
													<div className={styles.suggName}>{u.full_name}</div>
													<div className={styles.suggMeta}>
														{u.username} · MNV: {u.staff_number ?? '—'}
													</div>
												</div>
												{already ? (
													<span className={styles.suggAdded}>Đã thêm</span>
												) : (
													<span className={styles.suggAdd}>+ Thêm</span>
												)}
											</div>
										);
									})
								) : (
									<div
										style={{
											padding: '20px 14px',
											textAlign: 'center',
											background: 'var(--color-gray-50)',
											display: 'flex',
											flexDirection: 'column',
											alignItems: 'center',
											gap: 10,
										}}
									>
										<div
											style={{
												fontSize: 13,
												color: 'var(--color-gray-500)',
											}}
										>
											Không tìm thấy nhân viên phù hợp
										</div>
										<button
											type='button'
											className={styles.btnSecondary}
											style={{
												fontSize: 12,
												padding: '6px 12px',
												display: 'inline-flex',
												alignItems: 'center',
												gap: 6,
												cursor: 'pointer',
												boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
											}}
											onMouseDown={(e) => {
												e.preventDefault();
												setShowSuggestions(false);
												setManualForm({
													...manualForm,
													ho_ten: memberQuery,
													role: addRole,
												});
												setShowManualForm(true);
											}}
										>
											<PlusSvg style={{ width: 12, height: 12 }} />
											Thêm thủ công
										</button>
									</div>
								)}
							</div>
						)}
					</div>
					<RoleSelectPill
						value={addRole}
						onChange={setAddRole}
						allowedRoles={roleKeys}
						roleLabels={roleCfg}
						size='md'
					/>
				</div>
				<div className={styles.formHint}>
					Nhập tối thiểu 2 ký tự để tìm kiếm · Chỉ thành viên cùng khoa/phòng ban
				</div>
			</div>

			{!showManualForm && (
				<button
					type='button'
					className={styles.manualAddTrigger}
					onClick={() => {
						setManualForm({
							ho_ten: '',
							staff_number: '',
							phone_number: '',
							chuc_vu: '',
							department_id: '',
							role: pendingMembers.length === 0 ? 'leader' : 'member',
						});
						setShowManualForm(true);
					}}
				>
					<UserPlusSvg /> Thêm thành viên thủ công
				</button>
			)}

			{showManualForm && (
				<div className={styles.manualAddForm}>
					<div className={styles.manualAddTitle}>Thêm thành viên thủ công</div>

					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Họ tên <span className={styles.formRequired}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${manualErrors.ho_ten ? styles.hasError : ''}`}
								placeholder='Nguyễn Văn A'
								value={manualForm.ho_ten}
								onChange={(e) => {
									setManualForm({ ...manualForm, ho_ten: e.target.value });
									setManualErrors({ ...manualErrors, ho_ten: '' });
								}}
							/>
							{manualErrors.ho_ten && (
								<div className={styles.formError}>
									<AlertSvg /> {manualErrors.ho_ten}
								</div>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Mã nhân viên (MNV) <span className={styles.formRequired}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${manualErrors.staff_number ? styles.hasError : ''}`}
								placeholder='NV001'
								value={manualForm.staff_number}
								onChange={(e) => {
									setManualForm({
										...manualForm,
										staff_number: e.target.value,
									});
									setManualErrors({ ...manualErrors, staff_number: '' });
								}}
							/>
							{manualErrors.staff_number && (
								<div className={styles.formError}>
									<AlertSvg /> {manualErrors.staff_number}
								</div>
							)}
						</div>
					</div>

					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Số điện thoại <span className={styles.formRequired}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${manualErrors.phone_number ? styles.hasError : ''}`}
								placeholder='0912345678'
								type='tel'
								value={manualForm.phone_number}
								onChange={(e) => {
									setManualForm({
										...manualForm,
										phone_number: e.target.value,
									});
									setManualErrors({ ...manualErrors, phone_number: '' });
								}}
							/>
							{manualErrors.phone_number && (
								<div className={styles.formError}>
									<AlertSvg /> {manualErrors.phone_number}
								</div>
							)}
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Chức danh chuyên môn <span className={styles.formRequired}>*</span>
							</label>
							<input
								className={`${styles.formInput} ${manualErrors.chuc_vu ? styles.hasError : ''}`}
								placeholder='Bác sĩ, Điều dưỡng...'
								value={manualForm.chuc_vu}
								onChange={(e) => {
									setManualForm({ ...manualForm, chuc_vu: e.target.value });
									setManualErrors({ ...manualErrors, chuc_vu: '' });
								}}
							/>
							{manualErrors.chuc_vu && (
								<div className={styles.formError}>
									<AlertSvg /> {manualErrors.chuc_vu}
								</div>
							)}
						</div>
					</div>

					<div className={styles.formRow}>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Khoa phòng</label>
							<select
								className={styles.formSelect}
								value={manualForm.department_id}
								onChange={(e) =>
									setManualForm({
										...manualForm,
										department_id: e.target.value,
									})
								}
							>
								<option value=''>-- Chọn khoa/phòng ban --</option>
								{depts.map((d) => (
									<option
										key={d.id}
										value={d.id}
									>
										{d.name}
									</option>
								))}
							</select>
						</div>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Vai trò trong đề tài</label>
							<select
								className={styles.formSelect}
								value={manualForm.role}
								onChange={(e) =>
									setManualForm({
										...manualForm,
										role: e.target.value as MemberRole,
									})
								}
							>
								{roleKeys.map((r) => (
									<option
										key={r}
										value={r}
									>
										{roleCfg[r]?.label}
									</option>
								))}
							</select>
						</div>
					</div>

					<div
						style={{
							display: 'flex',
							gap: 8,
							justifyContent: 'flex-end',
						}}
					>
						<button
							type='button'
							className={styles.btnSecondary}
							style={{ padding: '7px 14px', fontSize: 12.5 }}
							onClick={() => {
								setShowManualForm(false);
								setManualErrors({});
							}}
						>
							Hủy
						</button>
						<button
							type='button'
							className={styles.btnPrimary}
							style={{ padding: '7px 14px', fontSize: 12.5 }}
							onClick={addMemberManual}
						>
							Thêm thành viên
						</button>
					</div>
				</div>
			)}

			{pendingMembers.length > 0 && (
				<div className={styles.manualBox} style={{ marginTop: 10 }}>
					<div className={styles.memberList} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
						{pendingMembers.map((m) => (
							<PendingMemberRow
								key={m.id}
								name={m.ho_ten}
								details={[m.staff_number && `MNV: ${m.staff_number}`, m.chuc_vu, m.phone_number || m.email]}
								onRemove={() => removeMember(m.id)}
								removeTitle='Xóa'
								rolePill={
									<RoleSelectPill
										value={m.role}
										onChange={(role) => changeRole(m.id, role)}
										allowedRoles={roleKeys}
										roleLabels={roleCfg}
									/>
								}
							/>
						))}
					</div>
				</div>
			)}
		</>
	);
}
