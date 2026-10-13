import { RowActions } from '@/shared/components/Table/TableToolbar';
import { useState } from 'react';
import { EditSvg, PlusSvg, SearchSvg, TrashSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge } from '@/shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import {
	BulkButton,
	BulkDeleteModal,
	SelectCheckbox,
} from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { ExternalReviewerBulkEditModal } from '../components/ExternalReviewerBulkEditModal';
import { ExternalReviewerDeleteModal } from '../components/ExternalReviewerDeleteModal';
import { ExternalReviewerFormModal } from '../components/ExternalReviewerFormModal';
import { useExternalReviewers } from '../hooks/useExternalReviewers';
import styles from './Council.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

export default function ExternalReviewers() {
	const d = useExternalReviewers();
	const pg = useClientPaging(d.filtered);
	const rowSel = useRowSelection(pg.paged.map((x) => x.id));
	const [bulkEditOpen, setBulkEditOpen] = useState(false);
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách người ngoài viện</span>
						{rowSel.selectedCount > 0 ? (
							<span className={styles.tableCount}>
								Đã chọn {rowSel.selectedCount}
								<BulkButton onClick={() => setBulkEditOpen(true)}>
									<EditSvg /> Sửa đồng loạt
								</BulkButton>
								<BulkButton
									danger
									onClick={() => setConfirmBulkDelete(true)}
								>
									<TrashSvg /> Xoá đã chọn
								</BulkButton>
								<button
									type='button'
									className={styles.clearSelectionBtn}
									onClick={rowSel.clearSelection}
								>
									Bỏ chọn
								</button>
							</span>
						) : (
							<span className={styles.tableCount}>
								{d.filtered.length} người
							</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên, đơn vị, hệ chuyên môn...'
								value={d.search}
								onChange={(e) => d.setSearch(e.target.value)}
							/>
						</div>
					</div>
				</div>

				<div className={styles.tableWrap}>
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
							<th className={`${styles.th} ${tbl.thIdx}`}>STT</th>
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
							<SkeletonTable
								rows={8}
								cols={8}
							/>
						) : d.filtered.length === 0 ? (
							<tr>
								<td colSpan={8}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>Chưa có người ngoài viện nào</div>
										<div className={styles.emptyDesc}>
											Thêm chuyên gia mời ngoài để chọn khi xếp ghế hội đồng
										</div>
									</div>
								</td>
							</tr>
						) : (
							pg.paged.map((r, i) => (
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
									<td className={`${styles.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
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
										<Badge tone={r.is_active ? 'green' : 'amber'}>
											{r.is_active ? 'Đang hoạt động' : 'Ngừng hoạt động'}
										</Badge>
									</td>
									<td className={`${styles.td} ${styles.tdActions}`}>
										<RowActions
											onEdit={() => {
												d.setEditingReviewer(r);
												d.setModal('edit');
											}}
											onDelete={() => {
												d.setDeletingReviewer(r);
												d.setModal('delete');
											}}
										/>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
				</div>
				<Pagination
					{...pg.pagination}
					itemLabel='người'
				/>
			</div>

			<BulkDeleteModal
				open={confirmBulkDelete}
				count={rowSel.selectedCount}
				itemLabel='người'
				loading={d.loading}
				note='Người đã từng ngồi ghế hội đồng sẽ được vô hiệu hoá thay vì xoá hẳn, để giữ tên hiển thị trên hội đồng cũ.'
				onClose={() => setConfirmBulkDelete(false)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmBulkDelete(false);
				}}
			/>

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

		</AdminLayout>
	);
}
