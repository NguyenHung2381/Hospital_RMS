import {
	WarnSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { ApprovalDetailPanel } from '../components/ApprovalDetailPanel';
import { ApprovalListPanel } from '../components/ApprovalListPanel';
import { BulkConfirmModal } from '../components/BulkConfirmModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { FileViewerModal } from '@/shared/components/FileViewerModal';
import { useApproval } from '../hooks/useApproval';
import styles from './Approval.module.css';

export default function Approval() {
	const state = useApproval();
	const {
		activeTab,
		search,
		selected,
		comment,
		modal,
		loading,
		listLoading,
		detailLoading,
		error,
		refreshData,
		checkedIds,
		bulkModal,
		bulkComment,
		filesByTopic,
		fileViewer,
		stats,
		filtered,
		isSelectableTab,
		checkedCount,
		allChecked,
		someChecked,
		TABS,
		setActiveTab,
		setSearch,
		setSelectedId,
		setComment,
		setModal,
		setCheckedIds,
		setBulkModal,
		setBulkComment,
		setFileViewer,
		openModal,
		toggleAll,
		handleAction,
		handleBulkAction,
	} = state;

	// Tóm tắt hàng đợi ở header — chỉ hiện khi có hồ sơ chờ (màu hổ phách = cần chú ý)
	const headerActions =
		stats.pending > 0 ? (
			<div
				className={styles.pendingSummary}
				role='status'
			>
				<WarnSvg />
				<span className={styles.pendingSummaryCount}>{stats.pending}</span>
				<span className={styles.pendingSummaryText}>đề tài chờ phê duyệt</span>
			</div>
		) : null;

	return (
		<AdminLayout
			pageTitle='Phê duyệt đề tài'
			pageSubtitle='Xem xét và quyết định hồ sơ đề tài nghiên cứu khoa học'
			headerActions={headerActions}
		>
			{/* Không có hàng thẻ thống kê: 4 thẻ chính là 4 tab của danh sách (cùng số, cùng
			    tác dụng lọc). Số chờ duyệt đã nằm ở header + badge tab "Chờ duyệt". */}
			{/* Split layout */}
			<div className={styles.splitLayout}>
				<ApprovalListPanel
					filtered={filtered}
					selected={selected}
					checkedIds={checkedIds}
					setCheckedIds={setCheckedIds}
					activeTab={activeTab}
					setActiveTab={setActiveTab}
					setSelectedId={setSelectedId}
					search={search}
					setSearch={setSearch}
					listLoading={listLoading}
					error={error}
					onRetry={refreshData}
					isSelectableTab={isSelectableTab}
					checkedCount={checkedCount}
					allChecked={allChecked}
					someChecked={someChecked}
					TABS={TABS}
					toggleAll={toggleAll}
					setBulkModal={setBulkModal}
					setBulkComment={setBulkComment}
				/>
				<ApprovalDetailPanel
					selected={selected}
					detailLoading={detailLoading}
					filesByTopic={filesByTopic}
					setFileViewer={setFileViewer}
					openModal={openModal}
				/>
			</div>

			{/* Modals */}
			{modal && selected && (
				<ConfirmModal
					type={modal}
					topicTitle={selected.topic_title}
					comment={comment}
					onChangeComment={setComment}
					onConfirm={() => void handleAction()}
					onClose={() => {
						setModal(null);
						setComment('');
					}}
					loading={loading}
				/>
			)}
			{bulkModal && checkedCount > 0 && (
				<BulkConfirmModal
					action={bulkModal === 'bulkApprove' ? 'approve' : 'reject'}
					count={checkedCount}
					comment={bulkComment}
					onChangeComment={setBulkComment}
					onConfirm={() => void handleBulkAction()}
					onClose={() => setBulkModal(null)}
					loading={loading}
				/>
			)}
			{fileViewer && (
				<FileViewerModal
					file={fileViewer}
					onClose={() => setFileViewer(null)}
				/>
			)}

		</AdminLayout>
	);
}
