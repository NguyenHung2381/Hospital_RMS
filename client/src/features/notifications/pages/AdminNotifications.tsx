import { CheckCircleSvg, SendSvg, WarnSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { NotificationDeleteModal } from '../components/NotificationDeleteModal';
import { NotificationHistoryTable } from '../components/NotificationHistoryTable';
import { NotificationSendForm } from '../components/NotificationSendForm';
import { useAdminNotifications } from '../hooks/useAdminNotifications';
import styles from './AdminNotifications.module.css';

export default function AdminNotifications() {
	const {
		form,
		setForm,
		depts,
		deptSearch,
		setDeptSearch,
		usersList,
		userSearch,
		setUserSearch,
		loadingUsers,
		sending,
		toast,
		showSendModal,
		setShowSendModal,
		topicSearch,
		setTopicSearch,
		topicResults,
		loadingTopics,
		selectedTopic,
		selectTopic,
		clearTopic,
		expandedDepts,
		usersByDept,
		getDeptState,
		toggleDeptSelection,
		toggleUserInDept,
		toggleUser,
		selectAllTargets,
		clearTargets,
		toggleDeptExpanded,
		filteredDepts,
		filteredUsers,
		rows,
		page,
		setPage,
		total,
		totalPages,
		search,
		setSearch,
		filterType,
		setFilterType,
		loading,
		pendingDelete,
		setPendingDelete,
		deletingBatch,
		expandedBatch,
		recipientsByBatch,
		loadingRecipients,
		toggleBatchExpand,
		setRefreshKey,
		handleSend,
		confirmDelete,
		handleBulkDelete,
	} = useAdminNotifications();

	const headerActions = (
		<button
			className={styles.btnSend}
			onClick={() => setShowSendModal(true)}
		>
			<SendSvg style={{ width: 15, height: 15 }} />
			Gửi thông báo
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý thông báo'
			pageSubtitle='Gửi thông báo và xem lịch sử thông báo hệ thống'
			headerActions={headerActions}
		>
			<div className={styles.layout}>
				<NotificationHistoryTable
					total={total}
					rows={rows}
					page={page}
					setPage={setPage}
					totalPages={totalPages}
					search={search}
					setSearch={setSearch}
					filterType={filterType}
					setFilterType={setFilterType}
					loading={loading}
					expandedBatch={expandedBatch}
					recipientsByBatch={recipientsByBatch}
					loadingRecipients={loadingRecipients}
					onToggleExpand={toggleBatchExpand}
					onRefresh={() => setRefreshKey((k) => k + 1)}
					onDeleteRequest={setPendingDelete}
					onBulkDelete={handleBulkDelete}
					onFilterChange={() => setPage(1)}
				/>
			</div>

			{showSendModal && (
				<NotificationSendForm
					form={form}
					setForm={setForm}
					depts={depts}
					deptSearch={deptSearch}
					setDeptSearch={setDeptSearch}
					usersList={usersList}
					userSearch={userSearch}
					setUserSearch={setUserSearch}
					loadingUsers={loadingUsers}
					sending={sending}
					expandedDepts={expandedDepts}
					usersByDept={usersByDept}
					getDeptState={getDeptState}
					toggleDeptSelection={toggleDeptSelection}
					toggleUserInDept={toggleUserInDept}
					toggleUser={toggleUser}
					selectAllTargets={selectAllTargets}
					clearTargets={clearTargets}
					toggleDeptExpanded={toggleDeptExpanded}
					filteredDepts={filteredDepts}
					filteredUsers={filteredUsers}
					topicSearch={topicSearch}
					setTopicSearch={setTopicSearch}
					topicResults={topicResults}
					loadingTopics={loadingTopics}
					selectedTopic={selectedTopic}
					onSelectTopic={selectTopic}
					onClearTopic={clearTopic}
					onSend={handleSend}
					onClose={() => setShowSendModal(false)}
				/>
			)}

			{pendingDelete && (
				<NotificationDeleteModal
					notif={pendingDelete}
					onClose={() => setPendingDelete(null)}
					onConfirm={confirmDelete}
					loading={deletingBatch}
				/>
			)}

			{toast && (
				<div
					className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}
				>
					{toast.ok ? (
						<CheckCircleSvg style={{ width: 15, height: 15 }} />
					) : (
						<WarnSvg style={{ width: 15, height: 15 }} />
					)}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
