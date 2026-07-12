import type { Dispatch, SetStateAction } from 'react';
import type { SimpleItem, UserSuggestion } from '../api/topicApi';
import type { ManualMemberForm as ManualMemberFormData, PendingMember } from '../hooks/useTopicModal';
import type { MemberRole } from '../types/topic.type';
import { ManualMemberForm } from './ManualMemberForm';
import { MemberSearchBox } from './MemberSearchBox';
import { PendingMemberList } from './PendingMemberList';
import styles from '../pages/Topic.module.css';

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
	manualForm: ManualMemberFormData;
	setManualForm: Dispatch<SetStateAction<ManualMemberFormData>>;
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

			<MemberSearchBox
				pendingMembers={pendingMembers}
				memberQuery={memberQuery}
				setMemberQuery={setMemberQuery}
				suggestions={suggestions}
				isSearching={isSearching}
				showSuggestions={showSuggestions}
				setShowSuggestions={setShowSuggestions}
				addRole={addRole}
				setAddRole={setAddRole}
				isManualAdd={isManualAdd}
				setIsManualAdd={setIsManualAdd}
				deptName={deptName}
				selectUser={selectUser}
			/>

			{isManualAdd && (
				<ManualMemberForm
					departments={departments}
					manualForm={manualForm}
					setManualForm={setManualForm}
					manualRole={manualRole}
					setManualRole={setManualRole}
					manualError={manualError}
					closeManualAdd={closeManualAdd}
					addManual={addManual}
				/>
			)}

			<PendingMemberList
				pendingMembers={pendingMembers}
				removeMember={removeMember}
			/>
		</>
	);
}
