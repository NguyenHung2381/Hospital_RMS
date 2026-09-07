import UserLayout from '../../../layouts/UserLayout';
import FilesTab from '../components/FilesTab';
import InfoTab from '../components/InfoTab';
import MembersTab from '../components/MembersTab';
import { ChevLSvg } from '@/assets/icons';
import { InlineLoading } from '@/shared/components';
import { useTopicDetail } from '../hooks/useTopicDetail';
import styles from './TopicDetail.module.css';

export default function TopicDetail() {
	const d = useTopicDetail();

	const layoutProps = {
		userName: d.fullName,
		userRole: d.userRole,
		userInitials: d.initials,
	};

	if (d.loading)
		return (
			<UserLayout {...layoutProps}>
				<InlineLoading label='Đang tải…' />
			</UserLayout>
		);

	if (d.error || !d.topic)
		return (
			<UserLayout {...layoutProps}>
				<div
					className={styles.stateBox}
					style={{ color: '#ef4444' }}
				>
					{d.error || 'Không tìm thấy đề tài.'}
				</div>
			</UserLayout>
		);

	const { topic, meta, members, files } = d;

	return (
		<UserLayout
			{...layoutProps}
			breadcrumbs={[
				{ label: 'Đề tài của tôi', path: '/user/my-topics' },
				{ label: topic.title },
			]}
		>
			{/* Detail header: back + page title */}
			<div className={styles.detailHeader}>
				<div className={styles.pageTopRow}>
					<button
						className={styles.backBtn}
						onClick={() => d.navigate('/user/my-topics')}
						title='Quay lại danh sách'
					>
						<ChevLSvg />
					</button>
					<h1 className={styles.pageTitle}>Chi tiết đề tài</h1>
				</div>

				{d.editBanner && (
					<div
						className={styles.editBanner}
						style={{ background: d.editBanner.bg, color: d.editBanner.color }}
					>
						<span
							className={styles.editBannerDot}
							style={{ background: d.editBanner.color }}
						/>
						{d.editBanner.text}
					</div>
				)}
			</div>

			{/* One information sheet — brochure-style sections */}
			<div className={styles.sheet}>
				<section className={styles.section}>
					<InfoTab
						topic={topic}
						meta={meta}
						canEditTitle={d.canEditTitle}
						canEditInfo={d.canEditInfo}
						editingInfo={d.editingInfo}
						setEditingInfo={d.setEditingInfo}
						infoForm={d.infoForm}
						setInfoForm={d.setInfoForm}
						savingInfo={d.savingInfo}
						infoErr={d.infoErr}
						startEditInfo={d.startEditInfo}
						handleSaveInfo={d.handleSaveInfo}
					/>
				</section>

				<section className={styles.section}>
					<MembersTab
						members={members}
						canEditMembers={d.canEditMembers}
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
				</section>

				<section className={styles.section}>
					<div className={styles.sectionHeader}>
						Tài liệu đính kèm
						<span className={styles.sectionCount}>— {files.length} file</span>
					</div>
					<FilesTab
						files={files}
						canUploadFiles={d.canUploadFiles}
						canDeleteFiles={d.canDeleteFiles}
						fileInputRef={d.fileInputRef}
						pendingFiles={d.pendingFiles}
						setPendingFiles={d.setPendingFiles}
						batchNote={d.batchNote}
						setBatchNote={d.setBatchNote}
						uploading={d.uploading}
						uploadError={d.uploadError}
						dragging={d.dragging}
						setDragging={d.setDragging}
						selectedIds={d.selectedIds}
						handleFileSelect={d.handleFileSelect}
						handleUpload={d.handleUpload}
						toggleSelect={d.toggleSelect}
						toggleSelectAll={d.toggleSelectAll}
						handleDeleteFile={d.handleDeleteFile}
						handleBulkDelete={d.handleBulkDelete}
						handleBulkDownload={d.handleBulkDownload}
					/>
				</section>
			</div>
		</UserLayout>
	);
}
