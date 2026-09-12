import { CheckSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkBar, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { formatDate } from '../../../shared/utils/formatDate';
import { TrainingRoundDeleteModal } from '../components/TrainingRoundDeleteModal';
import { TrainingRoundFormModal } from '../components/TrainingRoundFormModal';
import { useTrainingRounds } from '../hooks/useTrainingRounds';
import { STATUS_CFG } from '../types/trainingRound.type';
import styles from './TrainingRounds.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

export default function TrainingRounds() {
	const d = useTrainingRounds();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Thêm đợt đào tạo
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Đợt Đào tạo'
			pageSubtitle='Quản lý các đợt đào tạo và cửa sổ đăng ký khóa học'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên đợt...'
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
				<span className={styles.resultCount}>{d.filtered.length} đợt</span>
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

			<div className={styles.tableWrap}>
				<BulkBar
					rowSel={rowSel}
					itemLabel='đợt đào tạo'
					loading={d.loading}
					onBulkDelete={d.handleBulkDelete}
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
							<th className={styles.th}>#</th>
							<th className={styles.th}>Đợt đào tạo</th>
							<th className={styles.th}>Thời gian</th>
							<th className={styles.th}>Cửa sổ đăng ký</th>
							<th className={styles.th}>Khóa học</th>
							<th className={styles.th}>Trạng thái</th>
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
										<div className={styles.emptyTitle}>Không tìm thấy đợt đào tạo</div>
										<div className={styles.emptyDesc}>
											{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có đợt đào tạo nào'}
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((r, i) => {
								const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
								const cfg = STATUS_CFG[r.status];
								return (
									<tr
										key={r.id}
										className={`${styles.tr} ${rowSel.isSelected(r.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn đợt'
												checked={rowSel.isSelected(r.id)}
												onChange={() => rowSel.toggleSelect(r.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<span className={styles.itemName}>{r.name}</span>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>
												{formatDate(r.start_date)} — {formatDate(r.end_date)}
											</span>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>
												{r.enrollment_start_date || r.enrollment_end_date
													? `${formatDate(r.enrollment_start_date) ?? '—'} — ${formatDate(r.enrollment_end_date) ?? '—'}`
													: 'Luôn mở'}
												{' · '}
												<span style={{ color: r.enrollment_open ? '#085041' : '#791f1f' }}>
													{r.enrollment_open ? 'Đang mở' : 'Đã đóng'}
												</span>
											</span>
										</td>
										<td className={styles.td}>{r.course_count ?? 0}</td>
										<td className={styles.td}>
											<span
												className={styles.badge}
												style={{ background: cfg.bg, color: cfg.color }}
											>
												{cfg.label}
											</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<button
												className={`${styles.actionBtn} ${styles.actionEdit}`}
												title='Chỉnh sửa'
												onClick={() => {
													d.setEditingRound(r);
													d.setModal('edit');
												}}
											>
												<EditSvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Xoá'
												onClick={() => {
													d.setDeletingRound(r);
													d.setModal('delete');
												}}
											>
												<TrashSvg />
											</button>
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
					itemLabel='đợt đào tạo'
					hideSizeSelect
				/>
			)}

			{d.modal === 'add' && (
				<TrainingRoundFormModal
					mode='add'
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingRound && (
				<TrainingRoundFormModal
					mode='edit'
					round={d.editingRound}
					onClose={() => {
						d.setModal(null);
						d.setEditingRound(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingRound && (
				<TrainingRoundDeleteModal
					round={d.deletingRound}
					onClose={() => {
						d.setModal(null);
						d.setDeletingRound(null);
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
