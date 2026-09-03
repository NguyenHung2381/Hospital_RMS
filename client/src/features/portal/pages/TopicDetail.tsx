import UserLayout from '../../../layouts/UserLayout';
import FilesTab from '../components/FilesTab';
import InfoTab from '../components/InfoTab';
import MembersTab from '../components/MembersTab';
import { ChevLSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import { useTopicDetail } from '../hooks/useTopicDetail';
import { STATUS_CFG } from '../types/topicDetail.type';
import styles from './TopicDetail.module.css';

type TabKey = 'info' | 'members' | 'files';
const TABS: { key: TabKey; label: string }[] = [
	{ key: 'info', label: 'Thông tin' },
	{ key: 'members', label: 'Thành viên' },
	{ key: 'files', label: 'Tài liệu' },
];

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
				<div className={styles.stateBox}>
					<div className={styles.spinner} />
					<span>Đang tải...</span>
				</div>
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
	const statusCfg = STATUS_CFG[topic.status] ?? STATUS_CFG.submitted;

	return (
		<UserLayout
			{...layoutProps}
			breadcrumbs={[
				{ label: 'Đề tài của tôi', path: '/user/my-topics' },
				{ label: topic.title },
			]}
		>
			{/* Page top row: back + title */}
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

			{/* Topic identity strip */}
			<div className={styles.topicStrip}>
				<span className={styles.topicId}>{topic.id}</span>
				<span className={styles.topicStripTitle}>{topic.title}</span>
				<Badge
					tone={statusCfg.tone}
					dot
				>
					{statusCfg.label}
				</Badge>
			</div>

			{/* Edit mode banner */}
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

			{/* Tabs */}
			<div className={styles.tabs}>
				{TABS.map((t) => {
					const count =
						t.key === 'members'
							? members.length
							: t.key === 'files'
								? files.length
								: undefined;
					return (
						<button
							key={t.key}
							className={`${styles.tab} ${d.tab === t.key ? styles.tabActive : ''}`}
							onClick={() => d.setTab(t.key)}
						>
							{t.label}
							{count !== undefined && (
								<span
									className={`${styles.tabCount} ${d.tab === t.key ? styles.tabCountActive : ''}`}
								>
									{count}
								</span>
							)}
						</button>
					);
				})}
			</div>

			{/* Panels */}
			{d.tab === 'info' && (
				<div className={styles.panel}>
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
				</div>
			)}

			{d.tab === 'members' && (
				<div className={styles.panel}>
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
				</div>
			)}

			{d.tab === 'files' && (
				<div className={styles.panel}>
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
				</div>
			)}
		</UserLayout>
	);
}
