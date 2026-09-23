import { useEffect, useState } from 'react';
import type { SimpleItem } from '../api/topicApi';
import { useTopicDrawer } from '../hooks/useTopicDrawer';
import styles from '../pages/Topic.module.css';
import type { DrawerTab, Topic } from '../types/topic.type';
import { STATUS_CFG, lookup } from '../utils/topicHelpers';
import { Badge } from '@/shared/components';
import { ConfirmDeleteFileModal } from './ConfirmDeleteFileModal';
import { ConfirmUploadModal } from './ConfirmUploadModal';
import { DrawerFilesTab } from './DrawerFilesTab';
import { DrawerMembersTab } from './DrawerMembersTab';
import { GrantedAccountsModal } from './GrantedAccountsModal';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import { EditSvg as IcEdit, XSvg as IcX } from '@/assets/icons';

interface DrawerProps {
	topic: Topic;
	categories: SimpleItem[];
	levels: SimpleItem[];
	rounds: SimpleItem[];
	departments: SimpleItem[];
	onClose: () => void;
	onEdit: () => void;
}

export function TopicDrawer({
	topic,
	categories,
	levels,
	rounds,
	departments,
	onClose,
	onEdit,
}: DrawerProps) {
	const [tab, setTab] = useState<DrawerTab>('info');
	const d = useTopicDrawer(topic);
	const statusCfg = STATUS_CFG[topic.status];

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [onClose]);

	const TABS: { key: DrawerTab; label: string; count?: number }[] = [
		{ key: 'info', label: 'Thông tin' },
		{ key: 'members', label: 'Thành viên', count: d.members.length },
		{ key: 'files', label: 'Tài liệu', count: d.files.length },
	];

	return (
		<>
			<div className={styles.drawerBackdrop}>
			<div
				className={styles.drawer}
				role='dialog'
				aria-modal='true'
				aria-label='Chi tiết đề tài'
			>
				{/* Header */}
				<div className={styles.drawerHeader}>
					<div className={styles.drawerTitleWrap}>
						<div className={styles.drawerTopicId}>{topic.id}</div>
						<div className={styles.drawerTitle}>{topic.title}</div>
						<div className={styles.drawerBadges}>
							<Badge
								tone={statusCfg.tone}
								dot
							>
								{statusCfg.label}
							</Badge>
							<Badge tone='purple'>{lookup(levels, topic.level_id)}</Badge>
							<Badge tone='teal'>
								{lookup(categories, topic.category_id)}
							</Badge>
						</div>
					</div>
					<button
						className={styles.drawerCloseBtn}
						onClick={onClose}
						aria-label='Đóng'
					>
						<IcX />
					</button>
				</div>

				{/* Tabs */}
				<div className={styles.drawerTabs}>
					{TABS.map((t) => (
						<div
							key={t.key}
							className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
							onClick={() => setTab(t.key)}
						>
							{t.label}
							{t.count !== undefined && (
								<span className={styles.tabBadge}>{t.count}</span>
							)}
						</div>
					))}
				</div>

				{/* Body */}
				<div className={styles.drawerBody}>
					{tab === 'info' && (
						<>
							<div className={styles.infoGrid}>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Đợt nghiên cứu</div>
									<div className={styles.infoValue}>
										{lookup(rounds, topic.round_id)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Phòng ban / Khoa</div>
									<div className={styles.infoValue}>
										{lookup(departments, topic.department_id)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Cấp độ</div>
									<div className={styles.infoValue}>
										{lookup(levels, topic.level_id)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Phân loại</div>
									<div className={styles.infoValue}>
										{lookup(categories, topic.category_id)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Ngày đăng ký</div>
									<div className={styles.infoValue}>
										{formatDateTimeVN(topic.created_at)}
									</div>
								</div>
								<div className={styles.infoItem}>
									<div className={styles.infoLabel}>Số thành viên</div>
									<div className={styles.infoValue}>
										{topic.member_count} người
									</div>
								</div>
							</div>

							{topic.description && (
								<div>
									<div
										className={styles.infoLabel}
										style={{ marginBottom: 8 }}
									>
										Mô tả / Tóm tắt
									</div>
									<div className={styles.descBox}>{topic.description}</div>
								</div>
							)}
						</>
					)}

					{tab === 'members' && (
						<DrawerMembersTab
							topic={topic}
							departments={departments}
							members={d.members}
							showAddMember={d.showAddMember}
							setShowAddMember={d.setShowAddMember}
							newMember={d.newMember}
							setNewMember={d.setNewMember}
							savingMember={d.savingMember}
							memberError={d.memberError}
							setMemberError={d.setMemberError}
							nameSuggestions={d.nameSuggestions}
							showNameSuggestions={d.showNameSuggestions}
							setShowNameSuggestions={d.setShowNameSuggestions}
							isSearchingName={d.isSearchingName}
							grantingIds={d.grantingIds}
							grantError={d.grantError}
							pendingMembers={d.pendingMembers}
							membersMissingEmail={d.membersMissingEmail}
							canGrantAccountsNoEmail={d.canGrantAccountsNoEmail}
							handleGrantAccountsNoEmail={d.handleGrantAccountsNoEmail}
							handleGrantSingleMember={d.handleGrantSingleMember}
							handleAddMember={d.handleAddMember}
							handleDeleteMember={d.handleDeleteMember}
						/>
					)}

					{tab === 'files' && (
						<DrawerFilesTab
							files={d.files}
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
							setSelectedIds={d.setSelectedIds}
							handleFileSelect={d.handleFileSelect}
							removePending={d.removePending}
							toggleSelect={d.toggleSelect}
							toggleSelectAll={d.toggleSelectAll}
							handleDeleteFile={d.handleDeleteFile}
							handleBulkDelete={d.handleBulkDelete}
							handleBulkDownload={d.handleBulkDownload}
							setShowUploadConfirm={d.setShowUploadConfirm}
						/>
					)}
				</div>

				{/* Footer */}
				<div className={styles.drawerFooter}>
					<button
						className={styles.btnSecondary}
						onClick={onClose}
					>
						Đóng
					</button>
					<button
						className={styles.btnPrimary}
						onClick={onEdit}
					>
						<IcEdit />
						Chỉnh sửa đề tài
					</button>
				</div>
			</div>
			</div>

			{d.filesToDelete.length > 0 && (
				<ConfirmDeleteFileModal
					files={d.filesToDelete}
					onClose={() => d.setFilesToDelete([])}
					onConfirm={d.doDeleteFiles}
				/>
			)}

			{d.showUploadConfirm && (
				<ConfirmUploadModal
					files={d.pendingFiles}
					batchNote={d.batchNote}
					onClose={() => d.setShowUploadConfirm(false)}
					onConfirm={async () => {
						await d.handleUpload();
						d.setShowUploadConfirm(false);
					}}
				/>
			)}

			{d.grantedAccounts.length > 0 && (
				<GrantedAccountsModal
					accounts={d.grantedAccounts}
					members={d.members}
					onClose={() => d.setGrantedAccounts([])}
				/>
			)}
		</>
	);
}
