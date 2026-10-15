import type { Dispatch, SetStateAction } from 'react';
import { AlertSvg as IcAlert } from '@/assets/icons';
import type { SimpleItem, UserSuggestion } from '../api/topicApi';
import type { NewMemberForm } from '../hooks/useTopicDrawer';
import { MEMBER_ROLE_CFG } from '../utils/topicHelpers';
import styles from '../pages/Topic.module.css';

interface AddMemberFormProps {
	departments: SimpleItem[];
	newMember: NewMemberForm;
	setNewMember: Dispatch<SetStateAction<NewMemberForm>>;
	savingMember: boolean;
	memberError: string;
	setMemberError: (v: string) => void;
	nameSuggestions: UserSuggestion[];
	showNameSuggestions: boolean;
	setShowNameSuggestions: (v: boolean) => void;
	isSearchingName: boolean;
	setShowAddMember: Dispatch<SetStateAction<boolean>>;
	handleAddMember: () => void;
}

export function AddMemberForm({
	departments,
	newMember,
	setNewMember,
	savingMember,
	memberError,
	setMemberError,
	nameSuggestions,
	showNameSuggestions,
	setShowNameSuggestions,
	isSearchingName,
	setShowAddMember,
	handleAddMember,
}: AddMemberFormProps) {
	return (
		<div
			style={{
				background: 'var(--color-gray-50)',
				border: '1px solid var(--color-gray-200)',
				borderRadius: 8,
				padding: 12,
				marginBottom: 8,
			}}
		>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '1fr 1fr',
					gap: 8,
					marginBottom: 8,
				}}
			>
				<div style={{ gridColumn: '1 / -1' }}>
					<label
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: 'var(--color-gray-600)',
							display: 'block',
							marginBottom: 4,
						}}
					>
						Họ tên <span style={{ color: 'var(--color-red-500)' }}>*</span>
					</label>
					<div style={{ position: 'relative' }}>
						<input
							className={styles.formInput}
							placeholder='Nhập họ tên...'
							value={newMember.ho_ten}
							onChange={(e) => {
								setNewMember((p) => ({
									...p,
									ho_ten: e.target.value,
								}));
								if (e.target.value.trim().length < 2)
									setShowNameSuggestions(false);
							}}
							onBlur={() =>
								setTimeout(() => setShowNameSuggestions(false), 150)
							}
						/>
						{showNameSuggestions && (
							<div
								style={{
									position: 'absolute',
									top: '100%',
									left: 0,
									right: 0,
									zIndex: 200,
									background: 'var(--color-white)',
									border: '1px solid var(--color-gray-200)',
									borderRadius: 6,
									boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
									overflow: 'hidden',
									marginTop: 2,
								}}
							>
								{isSearchingName ? (
									<div
										style={{
											padding: '8px 12px',
											fontSize: 12,
											color: 'var(--color-gray-400)',
										}}
									>
										Đang tìm...
									</div>
								) : nameSuggestions.length === 0 ? (
									<div
										style={{
											padding: '8px 12px',
											fontSize: 12,
											color: 'var(--color-gray-400)',
										}}
									>
										Không tìm thấy
									</div>
								) : (
									nameSuggestions.map((u) => (
										<div
											key={u.id}
											onMouseDown={() => {
												setNewMember((p) => ({
													...p,
													ho_ten: u.full_name,
													staff_number:
														u.staff_number != null
															? String(u.staff_number)
															: '',
													email: u.email,
													department_id: u.department_id,
												}));
												setShowNameSuggestions(false);
											}}
											style={{
												padding: '7px 12px',
												cursor: 'pointer',
												borderBottom: '1px solid var(--color-gray-100)',
											}}
											onMouseEnter={(e) =>
												(e.currentTarget.style.background = '#f0fbf5')
											}
											onMouseLeave={(e) =>
												(e.currentTarget.style.background = '')
											}
										>
											<div
												style={{
													fontWeight: 600,
													fontSize: 12,
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
												MNV: {u.staff_number ?? '—'} · {u.username}
											</div>
										</div>
									))
								)}
							</div>
						)}
					</div>
				</div>
				<div>
					<label
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: 'var(--color-gray-600)',
							display: 'block',
							marginBottom: 4,
						}}
					>
						Mã nhân viên{' '}
						<span style={{ color: 'var(--color-red-500)' }}>*</span>
					</label>
					<input
						className={styles.formInput}
						placeholder='VD: 0123'
						value={newMember.staff_number}
						onChange={(e) =>
							setNewMember((p) => ({
								...p,
								staff_number: e.target.value,
							}))
						}
					/>
				</div>
				<div>
					<label
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: 'var(--color-gray-600)',
							display: 'block',
							marginBottom: 4,
						}}
					>
						Chức vụ
					</label>
					<input
						className={styles.formInput}
						placeholder='Bác sĩ, Điều dưỡng...'
						value={newMember.chuc_vu}
						onChange={(e) =>
							setNewMember((p) => ({
								...p,
								chuc_vu: e.target.value,
							}))
						}
					/>
				</div>
				<div>
					<label
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: 'var(--color-gray-600)',
							display: 'block',
							marginBottom: 4,
						}}
					>
						Khoa / Phòng ban
					</label>
					<select
						className={styles.formSelect}
						value={newMember.department_id}
						onChange={(e) =>
							setNewMember((p) => ({
								...p,
								department_id: e.target.value,
							}))
						}
					>
						<option value=''>— Chọn khoa —</option>
						{departments.map((d) => (
							<option
								key={d.id}
								value={d.id}
							>
								{d.name}
							</option>
						))}
					</select>
				</div>
				<div>
					<label
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: 'var(--color-gray-600)',
							display: 'block',
							marginBottom: 4,
						}}
					>
						Vai trò
					</label>
					<select
						className={styles.formSelect}
						value={newMember.role}
						onChange={(e) =>
							setNewMember((p) => ({
								...p,
								role: e.target.value as NewMemberForm['role'],
							}))
						}
					>
						{(
							Object.keys(
								MEMBER_ROLE_CFG,
							) as (keyof typeof MEMBER_ROLE_CFG)[]
						).map((r) => (
							<option
								key={r}
								value={r}
							>
								{MEMBER_ROLE_CFG[r].label}
							</option>
						))}
					</select>
				</div>
			</div>
			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '1fr',
					gap: 8,
					marginBottom: 8,
				}}
			>
				<div>
					<label
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: 'var(--color-gray-600)',
							display: 'block',
							marginBottom: 4,
						}}
					>
						Email
					</label>
					<input
						className={styles.formInput}
						placeholder='email@hospital.vn (tuỳ chọn)'
						type='email'
						value={newMember.email}
						onChange={(e) =>
							setNewMember((p) => ({ ...p, email: e.target.value }))
						}
					/>
				</div>
				<div>
					<label
						style={{
							fontSize: 12,
							fontWeight: 600,
							color: 'var(--color-gray-600)',
							display: 'block',
							marginBottom: 4,
						}}
					>
						Số điện thoại
					</label>
					<input
						className={styles.formInput}
						placeholder='0901234567 (tuỳ chọn)'
						type='tel'
						value={newMember.so_dien_thoai}
						onChange={(e) =>
							setNewMember((p) => ({
								...p,
								so_dien_thoai: e.target.value,
							}))
						}
					/>
				</div>
			</div>
			{memberError && (
				<div
					style={{
						fontSize: 12,
						color: 'var(--color-red-600)',
						marginBottom: 8,
						display: 'flex',
						alignItems: 'center',
						gap: 4,
					}}
				>
					<IcAlert /> {memberError}
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
					onClick={() => {
						setShowAddMember(false);
						setMemberError('');
					}}
				>
					Huỷ
				</button>
				<button
					className={styles.btnPrimary}
					onClick={handleAddMember}
					disabled={savingMember}
				>
					{savingMember ? 'Đang lưu...' : 'Thêm thành viên'}
				</button>
			</div>
		</div>
	);
}
