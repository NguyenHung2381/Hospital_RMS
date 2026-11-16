import { useNavigate } from 'react-router-dom';
import {
	BuildingSvg,
	HistorySvg,
	PlusSvg,
	UserCheckSvg,
} from '@/assets/icons';
import UserLayout from '../../../layouts/UserLayout';
import { InlineLoading } from '@/shared/components';
import { EditTopicModal } from '../components/EditTopicModal';
import MembersTab from '../components/MembersTab';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { MyTopicsDetailPanel } from '../components/MyTopicsDetailPanel';
import { MyTopicsListPanel } from '../components/MyTopicsListPanel';
import { useMyTopics } from '../hooks/useMyTopics';
import styles from './MyTopics.module.css';

export default function MyTopics() {
	const navigate = useNavigate();
	const d = useMyTopics();

	const headerActions = d.canCreateTopic ? (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
			{/* Đề tài của đợt đã làm xong trước khi có hệ thống — không cần mốc đăng ký */}
			<button
				className={styles.btnSecondary}
				onClick={() => navigate('/user/nhap-de-tai')}
			>
				<HistorySvg />
				Nhập đề tài đã hoàn thành
			</button>
			{d.canRegister && (
				<button
					className={styles.btnPrimary}
					onClick={() => navigate('/user/register-topic')}
				>
					<PlusSvg />
					Đăng ký đề tài mới
				</button>
			)}
		</div>
	) : null;

	return (
		<UserLayout
			pageTitle='Đề tài nghiên cứu'
			pageSubtitle={
				d.canSeeDept
					? 'Quản lý đề tài theo khoa và cá nhân'
					: 'Đề tài bạn tham gia hoặc đăng ký'
			}
			breadcrumbs={[{ label: 'Đề tài nghiên cứu' }]}
			headerActions={headerActions}
			userName={d.fullName}
			userRole={d.userRole}
			userInitials={d.initials}
		>
			{d.loading ? (
				<InlineLoading label='Đang tải…' />
			) : d.error ? (
				<div
					className={styles.stateBox}
					style={{ color: '#ef4444' }}
				>
					{d.error}
				</div>
			) : (
				<>
					{/* Phạm vi là BỘ LỌC, không phải điểm đến → điều khiển phân đoạn gọn.
					    Không còn 4 thẻ thống kê: chúng chính là 4 tab trạng thái của danh sách. */}
					{d.canSeeDept && (
						<div
							className={styles.scopeSwitch}
							role='group'
							aria-label='Phạm vi đề tài'
						>
							{(
								[
									{ key: 'mine', label: 'Đề tài tôi tham gia', count: d.myTopics.length, Icon: UserCheckSvg },
									{ key: 'department', label: 'Đề tài của khoa', count: d.deptTopics.length, Icon: BuildingSvg },
								] as const
							).map((c) => (
								<button
									key={c.key}
									type='button'
									aria-pressed={d.category === c.key}
									className={`${styles.scopeOption} ${d.category === c.key ? styles.scopeOptionActive : ''}`}
									onClick={() => {
										d.setCategory(c.key);
										d.setSearch('');
									}}
								>
									<c.Icon />
									{c.label}
									<span className={styles.scopeCount}>{c.count}</span>
								</button>
							))}
						</div>
					)}

					{/* Split layout */}
					<div className={styles.splitLayout}>
						<MyTopicsListPanel
							filtered={d.filtered}
							selectedId={d.selectedId}
							setSelectedId={d.setSelectedId}
							search={d.search}
							setSearch={d.setSearch}
							activeTab={d.activeTab}
							setActiveTab={d.setActiveTab}
							stats={d.stats}
						/>
						<MyTopicsDetailPanel
							selectedId={d.selectedId}
							detailLoading={d.detailLoading}
							detailTopic={d.detailTopic}
							detailFiles={d.detailFiles}
							detailHistory={d.detailHistory}
							latestApproval={d.latestApproval}
							canUploadFiles={d.canUploadFiles}
							canEditTopic={d.canEditTitle || d.canEditInfo || d.canEditMembers}
							setFileViewer={d.setFileViewer}
							fileInputRef={d.fileInputRef}
							pendingFiles={d.pendingFiles}
							setPendingFiles={d.setPendingFiles}
							batchNote={d.batchNote}
							setBatchNote={d.setBatchNote}
							uploadLoading={d.uploadLoading}
							uploadError={d.uploadError}
							handleUpload={d.handleUpload}
							openEdit={d.openEdit}
							formatFileSize={d.formatFileSize}
						/>
					</div>
				</>
			)}

			{d.editOpen && (
				<EditTopicModal
					editLoading={d.editLoading}
					editError={d.editError}
					editForm={d.editForm}
					setEditForm={d.setEditForm}
					canEditTitle={d.canEditTitle}
					canEditInfo={d.canEditInfo}
					refData={d.refData}
					refDataLoading={d.refDataLoading}
					cfg={d.editCfg}
					errors={d.editErrors}
					custom={d.editCustom}
					setCustom={d.setEditCustom}
					onClose={() => d.setEditOpen(false)}
					onSave={() => void d.handleSaveEdit()}
				>
					{d.canEditMembers && (
						<MembersTab
							members={d.members}
							canEditMembers
							addingMember={d.addingMember}
							setAddingMember={d.setAddingMember}
							newMember={d.newMember}
							setNewMember={d.setNewMember}
							editingMemberId={d.editingMemberId}
							setEditingMemberId={d.setEditingMemberId}
							editMemberForm={d.editMemberForm}
							setEditMemberForm={d.setEditMemberForm}
							savingMember={d.savingMember}
							memberErr={d.memberErr}
							setMemberErr={d.setMemberErr}
							handleAddMember={d.handleAddMember}
							startEditMember={d.startEditMember}
							handleSaveMember={d.handleSaveMember}
							handleDeleteMember={d.handleDeleteMember}
						/>
					)}
				</EditTopicModal>
			)}

			{d.fileViewer && (
				<FileViewerModal
					file={d.fileViewer}
					onClose={() => d.setFileViewer(null)}
				/>
			)}
		</UserLayout>
	);
}
