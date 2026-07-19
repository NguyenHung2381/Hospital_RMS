import { PlusSvg, SearchSvg } from '@/assets/icons';
import type { UserSuggestion } from '../api/topicApi';
import type { PendingMember } from '../hooks/useTopicModal';
import type { MemberRole } from '../types/topic.type';
import { getInitials } from '../../../shared/utils/helper';
import { isAddRoleAllowed, MEMBER_ROLE_CFG } from '../utils/topicHelpers';
import styles from '../pages/Topic.module.css';

interface MemberSearchBoxProps {
	pendingMembers: PendingMember[];
	memberQuery: string;
	setMemberQuery: (v: string) => void;
	suggestions: UserSuggestion[];
	isSearching: boolean;
	showSuggestions: boolean;
	setShowSuggestions: (v: boolean) => void;
	addRole: MemberRole;
	setAddRole: (v: MemberRole) => void;
	setIsManualAdd: (v: boolean) => void;
	isManualAdd: boolean;
	deptName: (id: string) => string;
	selectUser: (u: UserSuggestion) => void;
}

export function MemberSearchBox({
	pendingMembers,
	memberQuery,
	setMemberQuery,
	suggestions,
	isSearching,
	showSuggestions,
	setShowSuggestions,
	addRole,
	setAddRole,
	setIsManualAdd,
	isManualAdd,
	deptName,
	selectUser,
}: MemberSearchBoxProps) {
	const startManualAdd = () => {
		setIsManualAdd(true);
		setShowSuggestions(false);
		setMemberQuery('');
	};

	return (
		<>
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
							disabled={!isAddRoleAllowed(pendingMembers, r)}
						>
							{MEMBER_ROLE_CFG[r].label}
						</option>
					))}
				</select>
			</div>
			{pendingMembers.length === 0 && (
				<div
					style={{
						fontSize: 11,
						color: 'var(--color-gray-400)',
						marginTop: -2,
						marginBottom: 6,
					}}
				>
					Người đầu tiên được thêm sẽ là Chủ nhiệm
				</div>
			)}

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
					onClick={startManualAdd}
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
								onClick={startManualAdd}
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
							onClick={startManualAdd}
						>
							<PlusSvg style={{ width: 12, height: 12 }} />
							Thêm thủ công (không có trong hệ thống)
						</div>
					)}
				</div>
			)}
		</>
	);
}
