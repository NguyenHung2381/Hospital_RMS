import { useState } from 'react';
import { CheckSvg, EditSvg, PlusSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import {
	BulkBar,
	SelectCheckbox,
} from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { ExternalReviewerBulkEditModal } from '../components/ExternalReviewerBulkEditModal';
import { ExternalReviewerDeleteModal } from '../components/ExternalReviewerDeleteModal';
import { ExternalReviewerFormModal } from '../components/ExternalReviewerFormModal';
import { useExternalReviewers } from '../hooks/useExternalReviewers';
import styles from './Council.module.css';

export default function ExternalReviewers() {
	const d = useExternalReviewers();
	const rowSel = useRowSelection(d.filtered.map((x) => x.id));
	const [bulkEditOpen, setBulkEditOpen] = useState(false);

	const headerActions = (
		<button
			className={styles.btnCreateCouncil}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm người ngoài viện
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Người ngoài viện tham gia hội đồng'
			pageSubtitle='Chuyên gia mời ngoài, chọn được khi xếp ghế hội đồng chấm'
			headerActions={headerActions}
		>
			<div className={styles.toolbar}>
				<input
					className={styles.formInput}
					style={{ maxWidth: 320 }}
					placeholder='Tìm theo tên, đơn vị, hệ chuyên môn...'
					value={d.search}
					onChange={(e) => d.setSearch(e.target.value)}
				/>
				<span className={styles.resultCount}>{d.filtered.length} người</span>
			</div>

			<div className={styles.tableWrap}>
				<BulkBar
					rowSel={rowSel}
					itemLabel='người'
					loading={d.loading}
					onBulkDelete={d.handleBulkDelete}
					onBulkEdit={() => setBulkEditOpen(true)}
					deleteNote='Người đã từng ngồi ghế hội đồng sẽ được vô hiệu hoá thay vì xoá hẳn, để giữ tên hiển thị trên hội đồng cũ.'
				/>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={sel.checkCol}>
								<SelectCheckbox
									title='Chọn tất cả'
									checked={rowSel.allPageSelected}
									indeterminate={rowSel.somePageSelected}
									onChange={rowSel.toggleSelectAll}
								/>
							</th>
							<th className={styles.th}>Họ tên</th>
							<th className={styles.th}>Đơn vị công tác</th>
							<th className={styles.th}>Hệ chuyên môn</th>
							<th className={styles.th}>Liên hệ</th>
							<th className={styles.th}>Trạng thái</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<tr>
								<td colSpan={7}>
									<div className={styles.emptyState}>
										<div className={styles.emptyDesc}>Đang tải dữ liệu...</div>
									</div>
								</td>
							</tr>
						) : d.filtered.length === 0 ? (
							<tr>
								<td colSpan={7}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>Chưa có người ngoài viện nào</div>
										<div className={styles.emptyDesc}>
											Thêm chuyên gia mời ngoài để chọn khi xếp ghế hội đồng
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.filtered.map((r) => (
								<tr
									key={r.id}
									className={`${styles.tr} ${rowSel.isSelected(r.id) ? sel.rowSelected : ''}`}
								>
									<td className={sel.checkCol}>
										<SelectCheckbox
											title='Chọn người'
											checked={rowSel.isSelected(r.id)}
											onChange={() => rowSel.toggleSelect(r.id)}
										/>
									</td>
									<td className={styles.td}>
										<div className={styles.councilName}>{r.full_name}</div>
									</td>
									<td className={styles.td}>
										{r.organization ?? <span className={styles.emptyDash}>—</span>}
									</td>
									<td className={styles.td}>
										{r.specialty_group ?? <span className={styles.emptyDash}>—</span>}
									</td>
									<td className={styles.td}>
										<span className={styles.memberNames}>
											{[r.phone, r.email].filter(Boolean).join(' · ') || (
												<span className={styles.emptyDash}>—</span>
											)}
										</span>
									</td>
									<td className={styles.td}>
										<span
											className={`${styles.badge} ${r.is_active ? styles.badgeFinalized : styles.badgeDraft}`}
										>
											{r.is_active ? 'Đang hoạt động' : 'Ngừng hoạt động'}
										</span>
									</td>
									<td className={`${styles.td} ${styles.tdActions}`}>
										<button
											className={`${styles.actionBtn} ${styles.actionEdit}`}
											title='Chỉnh sửa'
											onClick={() => {
												d.setEditingReviewer(r);
												d.setModal('edit');
											}}
										>
											<EditSvg />
										</button>
										<button
											className={`${styles.actionBtn} ${styles.actionDelete}`}
											title='Xoá'
											onClick={() => {
												d.setDeletingReviewer(r);
												d.setModal('delete');
											}}
										>
											<TrashSvg />
										</button>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{d.modal === 'add' && (
				<ExternalReviewerFormModal
					mode='add'
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingReviewer && (
				<ExternalReviewerFormModal
					mode='edit'
					reviewer={d.editingReviewer}
					onClose={() => {
						d.setModal(null);
						d.setEditingReviewer(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingReviewer && (
				<ExternalReviewerDeleteModal
					reviewer={d.deletingReviewer}
					onClose={() => {
						d.setModal(null);
						d.setDeletingReviewer(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}
			{bulkEditOpen && (
				<ExternalReviewerBulkEditModal
					count={rowSel.selectedCount}
					loading={d.loading}
					onClose={() => setBulkEditOpen(false)}
					onSave={async (patch) => {
						await d.handleBulkEdit([...rowSel.selectedIds], patch);
						rowSel.clearSelection();
						setBulkEditOpen(false);
					}}
				/>
			)}

			{d.toast && (
				<div
					className={`${styles.toast} ${d.toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
				>
					{d.toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{d.toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
