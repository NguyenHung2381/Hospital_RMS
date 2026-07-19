import type { Dispatch, SetStateAction } from 'react';
import { AlertSvg, PlusSvg, UserSvg, XSvg } from '@/assets/icons';
import type { SimpleItem } from '../api/topicApi';
import type { ManualMemberForm as ManualMemberFormData, PendingMember } from '../hooks/useTopicModal';
import type { MemberRole } from '../types/topic.type';
import { isAddRoleAllowed, MEMBER_ROLE_CFG } from '../utils/topicHelpers';
import { SearchableSelect } from '../../../shared/components/Input/SearchableSelect';
import styles from '../pages/Topic.module.css';

interface ManualMemberFormProps {
	departments: SimpleItem[];
	pendingMembers: PendingMember[];
	manualForm: ManualMemberFormData;
	setManualForm: Dispatch<SetStateAction<ManualMemberFormData>>;
	manualRole: MemberRole;
	setManualRole: (v: MemberRole) => void;
	manualError: string;
	closeManualAdd: () => void;
	addManual: () => void;
}

export function ManualMemberForm({
	departments,
	pendingMembers,
	manualForm,
	setManualForm,
	manualRole,
	setManualRole,
	manualError,
	closeManualAdd,
	addManual,
}: ManualMemberFormProps) {
	return (
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
						{(Object.keys(MEMBER_ROLE_CFG) as MemberRole[]).map((r) => {
							const allowed = isAddRoleAllowed(pendingMembers, r);
							return (
							<button
								key={r}
								type='button'
								disabled={!allowed}
								onClick={() => setManualRole(r)}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 6,
									padding: '5px 13px',
									borderRadius: 20,
									fontSize: 12,
									fontWeight: 600,
									cursor: allowed ? 'pointer' : 'not-allowed',
									opacity: allowed ? 1 : 0.45,
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
							);
						})}
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
	);
}
