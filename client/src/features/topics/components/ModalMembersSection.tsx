import type { Dispatch, SetStateAction } from 'react';
import type { SimpleItem, UserSuggestion } from '../api/topicApi';
import type { ManualMemberForm, PendingMember } from '../hooks/useTopicModal';
import styles from '../pages/Topic.module.css';
import type { MemberRole } from '../types/topic.type';
import { getInitials } from '../../../shared/utils/helper';
import { MEMBER_ROLE_CFG } from '../utils/topicHelpers';
import { Badge } from './Badge';
import { AlertSvg, PlusSvg, SearchSvg, UserSvg, XSvg } from '@/assets/icons';
import { SearchableSelect } from '../../../shared/components/Input/SearchableSelect';

interface ModalMembersSectionProps {
	departments: SimpleItem[];
	pendingMembers: PendingMember[];
	memberQuery: string;
	setMemberQuery: (v: string) => void;
	suggestions: UserSuggestion[];
	isSearching: boolean;
	showSuggestions: boolean;
	setShowSuggestions: (v: boolean) => void;
	addRole: MemberRole;
	setAddRole: (v: MemberRole) => void;
	isManualAdd: boolean;
	setIsManualAdd: (v: boolean) => void;
	closeManualAdd: () => void;
	manualForm: ManualMemberForm;
	setManualForm: Dispatch<SetStateAction<ManualMemberForm>>;
	manualRole: MemberRole;
	setManualRole: (v: MemberRole) => void;
	manualError: string;
	deptName: (id: string) => string;
	selectUser: (u: UserSuggestion) => void;
	addManual: () => void;
	removeMember: (tempId: string) => void;
}

export function ModalMembersSection({
	departments,
	pendingMembers,
	memberQuery,
	setMemberQuery,
	suggestions,
	isSearching,
	showSuggestions,
	setShowSuggestions,
	addRole,
	setAddRole,
	isManualAdd,
	setIsManualAdd,
	closeManualAdd,
	manualForm,
	setManualForm,
	manualRole,
	setManualRole,
	manualError,
	deptName,
	selectUser,
	addManual,
	removeMember,
}: ModalMembersSectionProps) {
	return (
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
					<SearchSvg
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
					/>
					<input
						className={styles.formInput}
						style={{ paddingLeft: 32 }}
						placeholder='Tìm theo tên, mã nhân viên...'
						value={memberQuery}
						onChange={(e) => {
							const val = e.target.value;
							setMemberQuery(val);
							if (val.trim().length < 2) {
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

			{!isManualAdd && (
				<button
					type='button'
					className={styles.btnSecondary}
					style={{
						fontSize: 12,
						padding: '6px 12px',
						marginBottom: 8,
						alignSelf: 'flex-start',
						display: 'inline-flex',
						alignItems: 'center',
						gap: 6,
						cursor: 'pointer',
						boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
						border: '1.5px dashed var(--color-gray-300)',
						color: 'var(--color-gray-500)',
						background: 'none',
						transition: 'all 0.15s ease',
					}}
					onClick={() => {
						setIsManualAdd(true);
						setShowSuggestions(false);
						setMemberQuery('');
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.borderColor = 'var(--color-primary)';
						e.currentTarget.style.color = 'var(--color-primary-dark)';
						e.currentTarget.style.background = 'var(--color-primary-pale)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.borderColor = 'var(--color-gray-300)';
						e.currentTarget.style.color = 'var(--color-gray-500)';
						e.currentTarget.style.background = 'none';
					}}
				>
					<PlusSvg style={{ width: 12, height: 12 }} />
					Thêm thủ công
				</button>
			)}

			{showSuggestions && memberQuery.trim().length >= 2 && (
				<div
					style={{
						border: '1px solid var(--color-gray-200)',
						borderRadius: 8,
						marginBottom: 8,
						maxHeight: '240px',
						overflowY: 'auto',
						boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
						background: 'var(--color-white)',
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
								onClick={() => {
									setIsManualAdd(true);
									setShowSuggestions(false);
									setMemberQuery('');
								}}
							>
								<PlusSvg style={{ width: 12, height: 12 }} />
								Thêm thủ công
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
											(e.currentTarget as HTMLDivElement).style.background =
												'#f0fbf6';
									}}
									onMouseLeave={(e) => {
										(e.currentTarget as HTMLDivElement).style.background =
											alreadyAdded ? 'var(--color-gray-50)' : '';
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
											style={{ fontSize: 11, color: 'var(--color-gray-400)' }}
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
					{suggestions.length > 0 && (
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
								transition: 'background 0.12s, color 0.12s',
								position: 'sticky',
								bottom: 0,
								background: 'var(--color-white)',
								zIndex: 1,
							}}
							onMouseEnter={(e) => {
								(e.currentTarget as HTMLDivElement).style.background = '#f9fafb';
								(e.currentTarget as HTMLDivElement).style.color = 'var(--color-primary-dark)';
							}}
							onMouseLeave={(e) => {
								(e.currentTarget as HTMLDivElement).style.background = '';
								(e.currentTarget as HTMLDivElement).style.color = '';
							}}
							onClick={() => {
								setIsManualAdd(true);
								setShowSuggestions(false);
								setMemberQuery('');
							}}
						>
							<PlusSvg style={{ width: 12, height: 12 }} />
							Thêm thủ công (không có trong hệ thống)
						</div>
					)}
				</div>
			)}

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
								<UserSvg width={14} height={14} />
							</div>
							<span
								style={{
									fontSize: 13,
									fontWeight: 700,
									color: 'var(--color-primary-dark)',
								}}
							>
								Thêm thành viên thủ công
							</span>
						</div>
						<button
							type='button'
							onClick={closeManualAdd}
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
							<XSvg />
						</button>
					</div>

					<div
						style={{
							padding: '14px 14px 12px',
							display: 'flex',
							flexDirection: 'column',
							gap: 12,
						}}
					>
						<div className={styles.formGroup}>
							<label className={styles.formLabel}>
								Họ tên <span className={styles.formRequired}>*</span>
							</label>
							<input
								className={styles.formInput}
								placeholder='Nguyễn Văn A'
								value={manualForm.ho_ten}
								onChange={(e) =>
									setManualForm((p) => ({ ...p, ho_ten: e.target.value }))
								}
							/>
						</div>

						<div className={styles.formRow}>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>
									Mã nhân viên <span className={styles.formRequired}>*</span>
								</label>
								<input
									className={styles.formInput}
									placeholder='VD: 0123'
									value={manualForm.staff_number}
									onChange={(e) =>
										setManualForm((p) => ({
											...p,
											staff_number: e.target.value,
										}))
									}
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Chức vụ</label>
								<input
									className={styles.formInput}
									placeholder='Bác sĩ, Điều dưỡng...'
									value={manualForm.chuc_vu}
									onChange={(e) =>
										setManualForm((p) => ({ ...p, chuc_vu: e.target.value }))
									}
								/>
							</div>
						</div>

						<div className={styles.formGroup}>
							<label className={styles.formLabel}>Khoa / Phòng ban</label>
							<SearchableSelect
								options={departments}
								value={manualForm.department_id}
								onChange={(id) =>
									setManualForm((p) => ({ ...p, department_id: id }))
								}
								placeholder='— Chọn khoa —'
							/>
						</div>

						<div className={styles.formRow}>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Email</label>
								<input
									className={styles.formInput}
									placeholder='email@hospital.vn'
									type='email'
									value={manualForm.email}
									onChange={(e) =>
										setManualForm((p) => ({ ...p, email: e.target.value }))
									}
								/>
							</div>
							<div className={styles.formGroup}>
								<label className={styles.formLabel}>Số điện thoại</label>
								<input
									className={styles.formInput}
									placeholder='0901234567'
									type='tel'
									value={manualForm.so_dien_thoai}
									onChange={(e) =>
										setManualForm((p) => ({
											...p,
											so_dien_thoai: e.target.value,
										}))
									}
								/>
							</div>
						</div>

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
											border:
												manualRole === r
													? '2px solid var(--color-primary)'
													: '2px solid var(--color-gray-200)',
											background:
												manualRole === r
													? 'var(--color-primary)'
													: 'var(--color-white)',
											color:
												manualRole === r ? '#fff' : 'var(--color-gray-600)',
										}}
									>
										<span
											style={{
												width: 6,
												height: 6,
												borderRadius: '50%',
												flexShrink: 0,
												background:
													manualRole === r
														? 'rgba(255,255,255,0.8)'
														: 'var(--color-gray-300)',
											}}
										/>
										{MEMBER_ROLE_CFG[r].label}
									</button>
								))}
							</div>
						</div>

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
								<AlertSvg /> {manualError}
							</div>
						)}

						<div
							style={{
								display: 'flex',
								gap: 8,
								justifyContent: 'flex-end',
							}}
						>
							<button
								className={styles.btnSecondary}
								style={{ padding: '6px 14px', fontSize: 12 }}
								type='button'
								onClick={closeManualAdd}
							>
								Huỷ
							</button>
							<button
								className={styles.btnPrimary}
								style={{ padding: '6px 14px', fontSize: 12 }}
								type='button'
								onClick={addManual}
							>
								<PlusSvg /> Thêm thành viên
							</button>
						</div>
					</div>
				</div>
			)}

			{pendingMembers.length > 0 && (
				<div
					style={{
						border: '1px solid var(--color-gray-200)',
						borderRadius: 8,
						maxHeight: '180px',
						overflowY: 'auto',
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
									<XSvg />
								</button>
							</div>
						);
					})}
				</div>
			)}
		</>
	);
}
