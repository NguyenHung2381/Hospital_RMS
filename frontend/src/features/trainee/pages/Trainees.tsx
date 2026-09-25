import { useState } from 'react';
import { BookOpenSvg, CheckSvg, EditSvg, FileTextSvg, KeySvg, PlusSvg, SearchSvg, TrashSvg, UploadSvg, XSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkButton, BulkDeleteModal, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { GrantedAccountsModal } from '../components/GrantedAccountsModal';
import { TraineeDeleteModal } from '../components/TraineeDeleteModal';
import { TraineeDetailModal } from '../components/TraineeDetailModal';
import { TraineeFormModal } from '../components/TraineeFormModal';
import { TraineeImportModal } from '../components/TraineeImportModal';
import { useTrainees } from '../hooks/useTrainees';
import { formatDate } from '../../../shared/utils/formatDate';
import styles from './Trainees.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

const COLORS = [
	{ bg: '#e1f5ea', color: '#085028' },
	{ bg: '#e6f1fb', color: '#0c447c' },
	{ bg: '#eeedfe', color: '#3c3489' },
	{ bg: '#faeeda', color: '#633806' },
	{ bg: '#fce8fb', color: '#6b1a69' },
];
function getColor(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
	return COLORS[Math.abs(hash) % COLORS.length];
}
function getInitials(s: string) {
	const parts = s.trim().split(/\s+/);
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên, CCCD, điện thoại, email...'
								value={d.search}
								onChange={(e) => d.handleSearch(e.target.value)}
							/>
							{d.search && (
								<button
									className={styles.searchClear}
									onClick={() => d.handleSearch('')}
								>
									<XSvg />
								</button>
							)}
						</div>
						<div className={styles.pageSizeWrap}>
							<label className={styles.pageSizeLabel}>Hiển thị</label>
							<select
								className={styles.pageSizeSelect}
								value={d.pageSize}
								onChange={(e) => d.handlePageSize(Number(e.target.value))}
							>
								<option value={5}>5</option>
								<option value={10}>10</option>
								<option value={25}>25</option>
								<option value={50}>50</option>
								<option value={0}>Tất cả</option>
							</select>
							<span className={styles.pageSizeLabel}>dòng</span>
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
							<th className={styles.th}>#</th>
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
								const c = getColor(t.id);
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
											<div className={styles.actionBtns}>
												<div
													className={styles.actionBtn}
													title='Hồ sơ đính kèm'
													onClick={() => d.openDetail(t, 'documents')}
												>
													<FileTextSvg />
												</div>
												<div
													className={styles.actionBtn}
													title='Chương trình đào tạo đã đăng ký'
													onClick={() => d.openDetail(t, 'enrollments')}
												>
													<BookOpenSvg />
												</div>
												<div
													className={styles.actionBtn}
													title='Chỉnh sửa'
													onClick={() => {
														d.setEditingTrainee(t);
														d.setModal('edit');
													}}
												>
													<EditSvg />
												</div>
												<div
													className={`${styles.actionBtn} ${styles.danger}`}
													title='Xoá'
													onClick={() => {
														d.setDeletingTrainee(t);
														d.setModal('delete');
													}}
												>
													<TrashSvg />
												</div>
											</div>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
				</div>

				{d.filtered.length > 0 && d.totalPages > 1 && (
					<Pagination
						page={d.safePage}
						totalPages={d.totalPages}
						total={d.filtered.length}
						rowsPerPage={d.pageSize}
						pageSizeOptions={PAGE_SIZE_OPTIONS}
						onPageChange={d.setPage}
						onRowsPerPageChange={d.handlePageSize}
						itemLabel='học viên'
						hideSizeSelect
					/>
				)}
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
