import type { TopicMember } from '../../topics/types/topic.type';
import { getInitials } from '../../../shared/utils/helper';
import styles from '../pages/TopicDetail.module.css';
import type { MemberFormState } from '../types/topicDetail.type';
import { blankMember, ROLE_BADGE } from '../types/topicDetail.type';
import MemberFormFields from './MemberFormFields';

type Props = {
	members: TopicMember[];
	canEditMembers: boolean;
	addingMember: boolean;
	setAddingMember: (v: boolean) => void;
	newMember: MemberFormState;
	setNewMember: React.Dispatch<React.SetStateAction<MemberFormState>>;
	editingMemberId: string | null;
	setEditingMemberId: (id: string | null) => void;
	editMemberForm: MemberFormState;
	setEditMemberForm: React.Dispatch<React.SetStateAction<MemberFormState>>;
	savingMember: boolean;
	memberErr: string;
	setMemberErr: (s: string) => void;
	handleAddMember: () => void;
	startEditMember: (m: TopicMember) => void;
	handleSaveMember: () => void;
	handleDeleteMember: (id: string) => void;
};

export default function MembersTab({
	members,
	canEditMembers,
	addingMember,
	setAddingMember,
	newMember,
	setNewMember,
	editingMemberId,
	setEditingMemberId,
	editMemberForm,
	setEditMemberForm,
	savingMember,
	memberErr,
	setMemberErr,
	handleAddMember,
	startEditMember,
	handleSaveMember,
	handleDeleteMember,
}: Props) {
	return (
		<>
			<div className={styles.sectionHeader}>
				Danh sách thành viên
				<span className={styles.sectionCount}>— {members.length} người</span>
			</div>

			{memberErr && (
				<p style={{ color: '#ef4444', fontSize: 13, marginBottom: 8 }}>
					{memberErr}
				</p>
			)}

			{members.length === 0 ? (
				<div className={styles.emptyFiles}>Chưa có thành viên nào.</div>
			) : (
				<div className={styles.memberList}>
					{members.map((m) => {
						const rc = ROLE_BADGE[m.role] ?? ROLE_BADGE.member;
						if (editingMemberId === m.id) {
							return (
								<div
									key={m.id}
									className={styles.memberEditBox}
								>
									<MemberFormFields
										form={editMemberForm}
										setForm={setEditMemberForm}
										onSave={handleSaveMember}
										onCancel={() => setEditingMemberId(null)}
										saving={savingMember}
										err={memberErr}
									/>
								</div>
							);
						}
						return (
							<div
								key={m.id}
								className={styles.memberItem}
							>
								<div className={styles.memberAvatar}>
									{getInitials(m.ho_ten)}
								</div>
								<div className={styles.memberInfo}>
									<div className={styles.memberName}>{m.ho_ten}</div>
									<div className={styles.memberMeta}>
										{m.staff_number && <span>MNV: {m.staff_number} · </span>}
										{m.email && <span>{m.email} · </span>}
										{m.chuc_vu ?? 'N/A'}
									</div>
								</div>
								<span
									className={styles.roleBadge}
									style={{ background: rc.bg, color: rc.color }}
								>
									{rc.label}
								</span>
								{canEditMembers && (
									<div className={styles.memberActions}>
										<button
											className={styles.btnSecondary}
											onClick={() => startEditMember(m)}
										>
											Sửa
										</button>
										<button
											className={styles.btnDanger}
											onClick={() => handleDeleteMember(m.id)}
										>
											Xoá
										</button>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{canEditMembers && !addingMember && (
				<button
					className={styles.btnSecondary}
					onClick={() => {
						setNewMember(blankMember);
						setMemberErr('');
						setAddingMember(true);
					}}
					style={{ marginTop: 12, alignSelf: 'flex-start' }}
				>
					+ Thêm thành viên
				</button>
			)}

			{canEditMembers && addingMember && (
				<div
					className={styles.memberEditBox}
					style={{ marginTop: 12 }}
				>
					<div
						style={{
							fontWeight: 600,
							fontSize: 13,
							marginBottom: 4,
							color: 'var(--color-gray-700)',
						}}
					>
						Thêm thành viên mới
					</div>
					<MemberFormFields
						form={newMember}
						setForm={setNewMember}
						onSave={handleAddMember}
						onCancel={() => setAddingMember(false)}
						saving={savingMember}
						err={memberErr}
						saveLabel='Thêm'
					/>
				</div>
			)}
		</>
	);
}
