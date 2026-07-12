import { CheckCircleSvg, WarnSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
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
		deleting,
		setRefreshKey,
		handleSend,
		handleDelete,
	} = useAdminNotifications();

	return (
		<AdminLayout
			pageTitle='Quản lý thông báo'
			pageSubtitle='Gửi thông báo và xem lịch sử thông báo hệ thống'
		>
			<div className={styles.layout}>
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
					onSend={handleSend}
				/>

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
					deleting={deleting}
					onRefresh={() => setRefreshKey((k) => k + 1)}
					onDelete={handleDelete}
					onFilterChange={() => setPage(1)}
				/>
			</div>

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
