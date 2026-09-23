import { CheckSvg, EditSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { workflowApi } from '../api/workflowApi';
import { WorkflowDeleteModal } from '../components/WorkflowDeleteModal';
import { WorkflowFormModal } from '../components/WorkflowFormModal';
import { useWorkflow } from '../hooks/useWorkflow';
import styles from './Workflow.module.css';

export default function Workflow() {
	const d = useWorkflow();

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Tạo workflow
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Workflow duyệt'
			pageSubtitle='Cấu hình quy trình duyệt nhiều bước — mặc định tắt, đề tài vẫn duyệt 1 bước như hiện tại trừ khi bật'
			breadcrumbs={[{ label: 'Hệ thống' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách workflow</span>
						<span className={styles.tableCount}>{d.items.length} workflow</span>
					</div>
				</div>

				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={styles.th}>#</th>
								<th className={styles.th}>Tên workflow</th>
								<th className={styles.th}>Áp dụng cho</th>
								<th className={styles.th}>Số bước</th>
								<th className={styles.th}>Trạng thái</th>
								<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{d.isLoadingData ? (
								<SkeletonTable
									rows={5}
									cols={6}
								/>
							) : d.items.length === 0 ? (
								<tr>
									<td colSpan={6}>
										<div className={styles.emptyState}>
											<div className={styles.emptyTitle}>Chưa có workflow nào</div>
											<div className={styles.emptyDesc}>
												Đề tài đang duyệt theo đường 1 bước mặc định. Tạo workflow để chuyển
												sang duyệt nhiều bước.
											</div>
										</div>
									</td>
								</tr>
							) : (
								d.items.map((w, i) => (
									<tr
										key={w.id}
										className={styles.tr}
									>
										<td className={`${styles.td} ${styles.tdIdx}`}>{i + 1}</td>
										<td className={styles.td}>
											<div className={styles.itemName}>{w.name}</div>
										</td>
										<td className={styles.td}>{w.resource === 'topics' ? 'Đề tài NCKH' : w.resource}</td>
										<td className={styles.td}>{w.step_count}</td>
										<td className={styles.td}>
											<span
												className={`${styles.statusBadge} ${w.is_active ? styles.statusActive : styles.statusDraft}`}
											>
												{w.is_active ? 'Đang bật' : 'Tắt'}
											</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<div className={styles.actionBtns}>
												<div
													className={styles.actionBtn}
													title='Chỉnh sửa'
													onClick={async () => {
														const full = await workflowApi.getById(w.id);
														d.setEditingItem(full);
														d.setModal('edit');
													}}
												>
													<EditSvg />
												</div>
												<div
													className={`${styles.actionBtn} ${styles.danger}`}
													title='Xoá'
													onClick={() => {
														d.setDeletingItem(w);
														d.setModal('delete');
													}}
												>
													<TrashSvg />
												</div>
											</div>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>

			{d.modal === 'add' && (
				<WorkflowFormModal
					mode='add'
					roles={d.roles}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingItem && (
				<WorkflowFormModal
					mode='edit'
					item={d.editingItem}
					roles={d.roles}
					onClose={() => {
						d.setModal(null);
						d.setEditingItem(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingItem && (
				<WorkflowDeleteModal
					item={d.deletingItem}
					onClose={() => {
						d.setModal(null);
						d.setDeletingItem(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}

			{d.toast && (
				<div
					className={`${styles.toast} ${
						styles[
							`toast${d.toast.type.charAt(0).toUpperCase() + d.toast.type.slice(1)}` as keyof typeof styles
						]
					}`}
				>
					{d.toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{d.toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
