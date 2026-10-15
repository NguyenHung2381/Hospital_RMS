import type { Dispatch, SetStateAction } from 'react';
import { PlusSvg as IcPlus } from '@/assets/icons';
import type { SimpleItem, UserSuggestion } from '../api/topicApi';
import type { NewMemberForm } from '../hooks/useTopicDrawer';
import type { Topic, TopicMember } from '../types/topic.type';
import { AddMemberForm } from './AddMemberForm';
import { MemberListSection } from './MemberListSection';
import styles from '../pages/Topic.module.css';

interface DrawerMembersTabProps {
	topic: Topic;
	departments: SimpleItem[];
	members: TopicMember[];
	showAddMember: boolean;
	setShowAddMember: Dispatch<SetStateAction<boolean>>;
	newMember: NewMemberForm;
	setNewMember: Dispatch<SetStateAction<NewMemberForm>>;
	savingMember: boolean;
	memberError: string;
	setMemberError: (v: string) => void;
	nameSuggestions: UserSuggestion[];
	showNameSuggestions: boolean;
	setShowNameSuggestions: (v: boolean) => void;
	isSearchingName: boolean;
	grantingIds: Set<string>;
	grantError: string;
	pendingMembers: TopicMember[];
	membersMissingEmail: TopicMember[];
	canGrantAccountsNoEmail: boolean;
	handleGrantAccountsNoEmail: () => void;
	handleGrantSingleMember: (memberId: string) => void;
	handleAddMember: () => void;
	handleDeleteMember: (memberId: string) => void;
}

export function DrawerMembersTab({
	topic,
	departments,
	members,
	showAddMember,
	setShowAddMember,
	newMember,
	setNewMember,
	savingMember,
	memberError,
	setMemberError,
	nameSuggestions,
	showNameSuggestions,
	setShowNameSuggestions,
	isSearchingName,
	grantingIds,
	grantError,
	pendingMembers,
	membersMissingEmail,
	canGrantAccountsNoEmail,
	handleGrantAccountsNoEmail,
	handleGrantSingleMember,
	handleAddMember,
	handleDeleteMember,
}: DrawerMembersTabProps) {
	return (
		<>
			<div
				className={styles.drawerSection}
				style={{
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}
			>
				<span>Danh sách thành viên — {members.length} người</span>
				<button
					className={styles.btnPrimary}
					onClick={() => {
						setShowAddMember((v) => !v);
						setMemberError('');
					}}
				>
					<IcPlus />
					Thêm
				</button>
			</div>

			{showAddMember && (
				<AddMemberForm
					departments={departments}
					newMember={newMember}
					setNewMember={setNewMember}
					savingMember={savingMember}
					memberError={memberError}
					setMemberError={setMemberError}
					nameSuggestions={nameSuggestions}
					showNameSuggestions={showNameSuggestions}
					setShowNameSuggestions={setShowNameSuggestions}
					isSearchingName={isSearchingName}
					setShowAddMember={setShowAddMember}
					handleAddMember={handleAddMember}
				/>
			)}

			<MemberListSection
				topic={topic}
				members={members}
				grantingIds={grantingIds}
				grantError={grantError}
				pendingMembers={pendingMembers}
				membersMissingEmail={membersMissingEmail}
				canGrantAccountsNoEmail={canGrantAccountsNoEmail}
				handleGrantAccountsNoEmail={handleGrantAccountsNoEmail}
				handleGrantSingleMember={handleGrantSingleMember}
				handleDeleteMember={handleDeleteMember}
			/>
		</>
	);
}
