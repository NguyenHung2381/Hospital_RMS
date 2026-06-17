import {
	CheckCircleSvg,
	CheckSvg,
	ClockSvg,
	MessageSvg,
	WarnSvg,
	XCircleSvg,
	XSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { ApprovalDetailPanel } from '../components/ApprovalDetailPanel';
import { ApprovalListPanel } from '../components/ApprovalListPanel';
import { BulkConfirmModal } from '../components/BulkConfirmModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { FileViewerModal } from '../components/FileViewerModal';
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
		toast,
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

	const headerActions = (
		<div
			style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
		>
			{stats.pending > 0 && (
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 10,
						padding: '7px 18px',
						background: '#FAEEDA',
						border: '1.5px solid #EF9F27',
						borderRadius: 10,
					}}
				>
					<WarnSvg />
					<div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
						<span
							style={{
								fontSize: 20,
								fontWeight: 800,
								color: '#7C4A00',
								lineHeight: 1,
							}}
						>
							{stats.pending}
						</span>
						<span
							style={{
								fontSize: 12,
								fontWeight: 600,
								color: '#633806',
								whiteSpace: 'nowrap',
							}}
						>
							đề tài chờ phê duyệt
						</span>
					</div>
					<div
						style={{
							width: 1,
							height: 24,
							background: '#EF9F2766',
							margin: '0 4px',
						}}
					/>
					<span
						style={{
							fontSize: 11,
							fontWeight: 500,
							color: '#9A5B00',
							whiteSpace: 'nowrap',
						}}
					>
						Cần xử lý sớm
					</span>
				</div>
			)}
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Phê duyệt Đề tài'
			pageSubtitle='Xem xét và quyết định hồ sơ đề tài NCKH'
			headerActions={headerActions}
		>
			{/* Stats */}
			<div className={styles.statsRow}>
				{[
					{
						key: 'pending' as const,
						value: stats.pending,
						label: 'Chờ phê duyệt',
						iconCls: 'iconAmber',
						cardCls: 'amber',
						hintCls: 'hintAmber',
						hint: 'Cần xử lý sớm',
					},
					{
						key: 'approved' as const,
						value: stats.approved,
						label: 'Đã phê duyệt',
						iconCls: 'iconGreen',
						cardCls: 'green',
						hintCls: 'hintGreen',
						hint: 'Hoàn tất',
					},
					{
						key: 'rejected' as const,
						value: stats.rejected,
						label: 'Đã từ chối',
						iconCls: 'iconRed',
						cardCls: 'red',
						hintCls: 'hintRed',
						hint: 'Không đạt yêu cầu',
					},
					{
						key: 'info_requested' as const,
						value: stats.info_requested,
						label: 'Chờ bổ sung',
						iconCls: 'iconBlue',
						cardCls: 'blue',
						hintCls: 'hintBlue',
						hint: 'Đang chờ phản hồi',
					},
				].map((s) => (
					<div
						key={s.key}
						className={`${styles.statCard} ${styles[s.cardCls as keyof typeof styles]} ${activeTab === s.key ? styles.statActive : ''}`}
						onClick={() => setActiveTab(s.key)}
					>
						<div
							className={`${styles.statIcon} ${styles[s.iconCls as keyof typeof styles]}`}
						>
							{s.key === 'pending' && <ClockSvg />}
							{s.key === 'approved' && <CheckCircleSvg />}
							{s.key === 'rejected' && <XCircleSvg />}
							{s.key === 'info_requested' && <MessageSvg />}
						</div>
						<div className={styles.statBody}>
							<div className={styles.statValue}>{s.value}</div>
							<div className={styles.statLabel}>{s.label}</div>
							<div
								className={`${styles.statHint} ${styles[s.hintCls as keyof typeof styles]}`}
							>
								{s.hint}
							</div>
						</div>
					</div>
				))}
			</div>

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

			{/* Toast */}
			{toast && (
				<div
					className={`${styles.toast} ${styles[`toast${toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}` as keyof typeof styles]}`}
				>
					{toast.type === 'approve' && <CheckSvg />}
					{toast.type === 'reject' && <XSvg />}
					{toast.type === 'request' && <CheckCircleSvg />}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
