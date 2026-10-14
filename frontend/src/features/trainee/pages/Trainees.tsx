import { avatarColor, getInitials } from '@/shared/utils';
import { SearchInput, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useState } from 'react';
import { BookOpenSvg, FileTextSvg, KeySvg, PlusSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkButton, BulkDeleteModal, DeleteAllButton, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { GrantedAccountsModal } from '../components/GrantedAccountsModal';
import { TraineeDeleteModal } from '../components/TraineeDeleteModal';
import { TraineeDetailModal } from '../components/TraineeDetailModal';
import { TraineeFormModal } from '../components/TraineeFormModal';
import { TraineeImportModal } from '../components/TraineeImportModal';
import { useTrainees } from '../hooks/useTrainees';
import { formatDate } from '../../../shared/utils/formatDate';
import styles from './Trainees.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

export default function Trainees() {
	const d = useTrainees();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
	const [showImport, setShowImport] = useState(false);

	const headerActions = (
		<div style={{ display: 'flex', gap: 8 }}>
			<button
				className={styles.btnAddHeader}
				onClick={() => setShowImport(true)}
			>
				<UploadSvg /> Nhập từ Excel
			</button>
			<button
				className={styles.btnAddHeader}
				onClick={() => d.setModal('add')}
			>
				<PlusSvg /> Thêm học viên
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Học viên'
			pageSubtitle='Danh sách học viên tham gia các chương trình đào tạo'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách học viên</span>
						{rowSel.selectedCount > 0 ? (
							<span className={styles.tableCount}>
								Đã chọn {rowSel.selectedCount}
								<BulkButton
									disabled={d.granting}
									onClick={() => d.handleGrantAccounts([...rowSel.selectedIds])}
								>
									<KeySvg /> Cấp tài khoản
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
								{d.filtered.length} học viên
							</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên, CCCD, điện thoại, email...'
						/>
						<DeleteAllButton
							count={d.filtered.length}
							itemLabel='học viên'
							getIds={() => d.filtered.map((x) => x.id)}
							onDelete={d.handleBulkDelete}
							onDone={rowSel.clearSelection}
							disabled={d.loading}
						/>
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
							<th className={styles.th}>Học viên</th>
							<th className={styles.th}>CCCD/CMND</th>
							<th className={styles.th}>Liên hệ</th>
							<th className={styles.th}>Đối tượng</th>
							<th className={styles.th}>Khoa / Phòng</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<SkeletonTable
								rows={d.pageSize || 8}
								cols={8}
							/>
						) : d.filtered.length === 0 ? (
							<tr>
								<td colSpan={8}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>Không tìm thấy học viên</div>
										<div className={styles.emptyDesc}>
											{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có học viên nào'}
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((t, i) => {
								const c = avatarColor(t.id);
								const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
								return (
									<tr
										key={t.id}
										className={`${styles.tr} ${rowSel.isSelected(t.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn học viên'
												checked={rowSel.isSelected(t.id)}
												onChange={() => rowSel.toggleSelect(t.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<div
												className={styles.personCell}
												style={{ cursor: 'pointer' }}
												title='Xem chi tiết học viên'
												onClick={() => d.openDetail(t, 'general')}
											>
												<div
													className={styles.personAvatar}
													style={{ background: c.bg, color: c.color }}
												>
													{getInitials(t.full_name)}
												</div>
												<div>
													<div
														className={styles.personName}
														style={{ display: 'flex', alignItems: 'center', gap: 6 }}
													>
														{t.full_name}
														{t.account_granted && (
															<Badge
																tone='green'
																dot
															>
																TK
															</Badge>
														)}
													</div>
													{t.dob && (
														<div className={styles.personSub}>
															{formatDate(t.dob)}
														</div>
													)}
												</div>
											</div>
										</td>
										<td className={styles.td}>
											<span className={`${styles.descText} ${styles.mono}`}>
												{t.national_id ?? '—'}
											</span>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>{t.phone ?? t.email ?? '—'}</span>
										</td>
										<td className={styles.td}>
											{t.trainee_type_name ? (
												<span className={styles.badge}>{t.trainee_type_name}</span>
											) : (
												'—'
											)}
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>{t.department_name ?? '—'}</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<RowActions
												onEdit={() => {
													d.setEditingTrainee(t);
													d.setModal('edit');
												}}
												onDelete={() => {
													d.setDeletingTrainee(t);
													d.setModal('delete');
												}}
											>
												<RowAction
													title='Hồ sơ đính kèm'
													onClick={() => d.openDetail(t, 'documents')}
												>
													<FileTextSvg />
												</RowAction>
												<RowAction
													title='Chương trình đào tạo đã đăng ký'
													onClick={() => d.openDetail(t, 'enrollments')}
												>
													<BookOpenSvg />
												</RowAction>
											</RowActions>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
				</div>

								<Pagination
					page={d.safePage}
					totalPages={d.totalPages}
					total={d.filtered.length}
					rowsPerPage={d.pageSize}
					onPageChange={d.setPage}
					itemLabel='học viên'
					onRowsPerPageChange={d.handlePageSize}
				/>
			</div>

			<BulkDeleteModal
				open={confirmBulkDelete}
				count={rowSel.selectedCount}
				itemLabel='học viên'
				loading={d.loading}
				onClose={() => setConfirmBulkDelete(false)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmBulkDelete(false);
				}}
			/>

			{showImport && (
				<TraineeImportModal
					onClose={() => setShowImport(false)}
					onDone={d.refreshData}
				/>
			)}

			{d.grantedAccounts.length > 0 && (
				<GrantedAccountsModal
					accounts={d.grantedAccounts}
					onClose={() => {
						d.setGrantedAccounts([]);
						rowSel.clearSelection();
					}}
				/>
			)}

			{d.modal === 'add' && (
				<TraineeFormModal
					mode='add'
					traineeTypes={d.traineeTypes}
					departments={d.departments}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingTrainee && (
				<TraineeFormModal
					mode='edit'
					trainee={d.editingTrainee}
					traineeTypes={d.traineeTypes}
					departments={d.departments}
					onClose={() => {
						d.setModal(null);
						d.setEditingTrainee(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingTrainee && (
				<TraineeDeleteModal
					trainee={d.deletingTrainee}
					onClose={() => {
						d.setModal(null);
						d.setDeletingTrainee(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}
			{d.viewingTrainee &&
				(() => {
					const viewing = d.viewingTrainee;
					return (
						<TraineeDetailModal
							trainee={viewing}
							initialTab={d.viewingTab}
							onClose={() => d.setViewingTrainee(null)}
							onEdit={() => {
								d.setEditingTrainee(viewing);
								d.setViewingTrainee(null);
								d.setModal('edit');
							}}
						/>
					);
				})()}

		</AdminLayout>
	);
}
