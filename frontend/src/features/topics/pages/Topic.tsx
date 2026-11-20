import { RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useState } from 'react';
import {
	DocSvg,
	DownloadSvg,
	EditSvg,
	EyeSvg,
	FilterSvg,
	PlusSvg,
	SearchSvg,
	TrashSvg,
	UploadSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { MultiSelect } from '../../../shared/components/Input/MultiSelect';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import {
	BulkButton,
	BulkDeleteModal,
	SelectCheckbox,
} from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Badge } from '@/shared/components';
import { TableEmpty } from '@/shared/components/EmptyState';
import { DeleteModal } from '../components/DeleteModal';
import { ExportExcelModal } from '../components/ExportExcelModal';
import { TopicBulkEditModal } from '../components/TopicBulkEditModal';
import { TopicDrawer } from '../components/TopicDrawer';
import { TopicModal } from '../components/TopicModal';
import { TopicImportModal } from '../components/TopicImportModal';
import { usePermission } from '@/shared/hooks/usePermission';
import { scopeOf } from '@/shared/utils/permissions';
import { useTopicPage } from '../hooks/useTopicPage';
import { STATUS_CFG, lookup } from '../utils/topicHelpers';
import styles from './Topic.module.css';
import tbl from '@/shared/components/Table/Table.module.css';


// Số cột bảng (checkbox, STT, mã, tên, đợt, cấp độ, trạng thái, ngày, thao tác)
const COL_COUNT = 9;

export default function TopicPage() {
	const d = useTopicPage();
	const rowSel = useRowSelection(d.pageSlice.map((t) => t.id));
	const [bulkModal, setBulkModal] = useState<'edit' | 'delete' | null>(null);
	const [showImport, setShowImport] = useState(false);
	const perm = usePermission();
	// Nhập Excel tạo đề tài cho mọi khoa → chỉ phạm vi toàn viện (backend kiểm tra lại)
	const canImport = perm.has('topics:create') && scopeOf(perm.user, 'topics') === 'all';
	// Lọc tinh chỉnh (cấp độ, phân loại, phòng ban, loại) gói sau nút "Bộ lọc khác"
	const refineCount = [d.levelFilters, d.catFilters, d.deptFilters, d.articleTypeFilters].filter(
		(f) => f.size > 0,
	).length;
	const [filtersOpen, setFiltersOpen] = useState(false);
	// Danh sách rỗng vì đang lọc hay vì thật sự chưa có gì — hai thông điệp khác nhau
	const hasFilters =
		d.search.trim() !== '' ||
		d.activeTab !== 'all' ||
		[
			d.yearFilters,
			d.roundFilters,
			d.levelFilters,
			d.catFilters,
			d.deptFilters,
			d.articleTypeFilters,
		].some((f) => f.size > 0);

	const headerActions = (
		<>
			{/* Thứ tự chung của trang danh sách: Nhập → Xuất → thao tác chính (cuối) */}
			{canImport && (
				<button
					type='button'
					className={styles.btnSecondary}
					onClick={() => setShowImport(true)}
				>
					<UploadSvg style={{ width: 14, height: 14 }} />
					Nhập Excel
				</button>
			)}
			<button
				type='button'
				className={styles.btnSecondary}
				onClick={() => d.setShowExport(true)}
			>
				<DownloadSvg style={{ width: 14, height: 14 }} />
				Xuất Excel
			</button>
			<button
				type='button'
				className={styles.btnPrimary}
				onClick={() => d.setShowCreate(true)}
			>
				<PlusSvg style={{ width: 14, height: 14 }} />
				Đăng ký đề tài
			</button>
		</>
	);

	return (
		<AdminLayout
			pageTitle='Đề tài nghiên cứu'
			pageSubtitle='Danh sách và theo dõi tất cả đề tài NCKH'
			headerActions={headerActions}
		>
			{/* Không có hàng thẻ thống kê: Tổng / Đã duyệt / Chờ duyệt / Từ chối chính là số
			    đếm trên tab trạng thái của bảng — hiện 2 lần chỉ đẩy bảng xuống dưới màn hình. */}
			{/* ── TABLE CARD ── */}
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách đề tài</span>
						{rowSel.selectedCount > 0 ? (
							<span className={styles.tableCount}>
								Đã chọn {rowSel.selectedCount}
								<BulkButton onClick={() => setBulkModal('edit')}>
									<EditSvg /> Sửa đồng loạt
								</BulkButton>
								<BulkButton
									danger
									onClick={() => setBulkModal('delete')}
								>
									<TrashSvg /> Xóa đã chọn
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
							<span className={styles.tableCount}>{d.total} đề tài</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchWrap}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								aria-label='Tìm đề tài theo mã hoặc tên'
								placeholder='Tìm mã, tên đề tài...'
								value={d.search}
								onChange={(e) => {
									d.setSearch(e.target.value);
									d.resetPage();
								}}
							/>
						</div>
						<MultiSelect
							className={styles.filterSelectWrap}
							options={d.availableYears.map((y) => ({
								id: y.toString(),
								label: String(y),
							}))}
							selected={d.yearFilters}
							onChange={d.handleYearChange}
							placeholder='Tất cả năm'
						/>
						<MultiSelect
							className={styles.filterSelectWrap}
							options={d.visibleRounds.map((r) => ({
								id: r.id,
								label: r.name,
							}))}
							selected={d.roundFilters}
							onChange={(next) => {
								d.setRoundFilters(next);
								d.setPage(1);
							}}
							placeholder='Tất cả đợt'
						/>
						<button
							type='button'
							className={`${styles.moreFiltersBtn} ${refineCount > 0 ? styles.moreFiltersBtnActive : ''}`}
							aria-expanded={filtersOpen || refineCount > 0}
							aria-controls='topic-refine-filters'
							onClick={() => setFiltersOpen((o) => !o)}
						>
							<FilterSvg />
							Bộ lọc khác{refineCount > 0 ? ` (${refineCount})` : ''}
						</button>
					</div>
				</div>

				{/* Tầng 2: lọc tinh chỉnh — chỉ hiện khi mở hoặc đang có điều kiện */}
				{(filtersOpen || refineCount > 0) && (
					<div
						id='topic-refine-filters'
						className={styles.refineRow}
					>
						<MultiSelect
							className={styles.filterSelectWrap}
							options={d.levels.map((l) => ({ id: l.id, label: l.name }))}
							selected={d.levelFilters}
							onChange={(next) => {
								d.setLevelFilters(next);
								d.setPage(1);
							}}
							placeholder='Cấp độ'
						/>
						<MultiSelect
							className={styles.filterSelectWrap}
							options={d.categories.map((c) => ({ id: c.id, label: c.name }))}
							selected={d.catFilters}
							onChange={(next) => {
								d.setCatFilters(next);
								d.setPage(1);
							}}
							placeholder='Phân loại'
						/>
						<MultiSelect
							className={styles.filterSelectWrap}
							options={d.departments.map((dep) => ({
								id: dep.id,
								label: dep.name,
							}))}
							selected={d.deptFilters}
							onChange={(next) => {
								d.setDeptFilters(next);
								d.setPage(1);
							}}
							placeholder='Phòng ban'
							searchable
						/>
						<MultiSelect
							className={styles.filterSelectWrap}
							options={[
								{ id: 'de_tai', label: 'Đề tài NCKH' },
								{ id: 'bai_bao', label: 'Bài báo & tập san' },
							]}
							selected={d.articleTypeFilters}
							onChange={(next) => {
								d.setArticleTypeFilters(next);
								d.setPage(1);
							}}
							placeholder='Loại'
						/>
						{refineCount > 0 && (
							<button
								type='button'
								className={styles.clearFiltersBtn}
								onClick={() => {
									d.setLevelFilters(new Set());
									d.setCatFilters(new Set());
									d.setDeptFilters(new Set());
									d.setArticleTypeFilters(new Set());
									d.setPage(1);
								}}
							>
								Xóa lọc
							</button>
						)}
					</div>
				)}

				<div
					className={styles.tabsRow}
					role='tablist'
					aria-label='Lọc theo trạng thái'
				>
					{d.TABS.map((t) => (
						<button
							key={t.key}
							type='button'
							role='tab'
							aria-selected={d.activeTab === t.key}
							className={`${styles.tab} ${d.activeTab === t.key ? styles.tabActive : ''}`}
							onClick={() => {
								d.setActiveTab(t.key);
								d.resetPage();
							}}
						>
							{t.label}
							<span
								className={`${styles.tabBadge} ${t.key === 'submitted' && t.count > 0 ? styles.tabBadgeAttention : ''}`}
							>
								{t.count}
							</span>
						</button>
					))}
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
								<th className={tbl.thIdx}>STT</th>
								<th className={styles.colId}>Mã đề tài</th>
								<th className={styles.colTitle}>Tên đề tài</th>
								<th className={styles.colRound}>Đợt NC</th>
								<th className={styles.colLevel}>Cấp độ</th>
								<th className={styles.colStatus}>Trạng thái</th>
								<th className={styles.colDate}>Ngày đăng ký</th>
								<th className={styles.colActions}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{d.isLoadingData ? (
								<SkeletonTable rows={10} cols={COL_COUNT} />
							) : d.loadError ? (
								<TableEmpty
									colSpan={COL_COUNT}
									title='Không tải được danh sách đề tài'
									desc={d.loadError}
									action={
										<button
											type='button'
											className={styles.btnSecondary}
											onClick={d.refreshData}
										>
											Thử lại
										</button>
									}
								/>
							) : d.pageSlice.length === 0 ? (
								<tr>
									<td colSpan={COL_COUNT}>
										<div className={styles.emptyState}>
											<DocSvg className={styles.emptyIcon} />
											<p className={styles.emptyTitle}>
												{hasFilters ? 'Không tìm thấy đề tài nào' : 'Chưa có đề tài nào'}
											</p>
											<p className={styles.emptyDesc}>
												{hasFilters
													? 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm'
													: 'Đề tài đăng ký hoặc nhập từ Excel sẽ hiện ở đây'}
											</p>
										</div>
									</td>
								</tr>
							) : (
								d.pageSlice.map((t, i) => {
									const sc = STATUS_CFG[t.status];
									return (
										<tr
											key={t.id}
											className={
												rowSel.isSelected(t.id) ? sel.rowSelected : ''
											}
										>
											<td className={sel.checkCol}>
												<SelectCheckbox
													title='Chọn đề tài'
													checked={rowSel.isSelected(t.id)}
													onChange={() => rowSel.toggleSelect(t.id)}
												/>
											</td>
											<td className={tbl.tdIdx}>
												{(d.safePage - 1) * d.rowsPerPage + i + 1}
											</td>
											<td>
												<div className={styles.topicId}>{t.id}</div>
											</td>
											<td>
												<button
													type='button'
													className={styles.topicTitle}
													title={t.title}
													onClick={() => d.setViewTopic(t)}
												>
													{t.article_type === 'bai_bao' && (
														<Badge tone='blue'>Bài báo</Badge>
													)}{' '}
													{t.title}
												</button>
												{/* Khoa + phân loại gộp vào dòng phụ (trước là 2 cột riêng,
												    đẩy cột Trạng thái/Thao tác ra ngoài khung ở 1440px) */}
												<div className={styles.topicMeta}>
													{[
														lookup(d.departments, t.department_id),
														lookup(d.categories, t.category_id),
														`${t.member_count} thành viên`,
													]
														.filter(Boolean)
														.join(' · ')}
												</div>
											</td>
											<td>
												<span className={styles.dateText}>
													{lookup(d.rounds, t.round_id)}
												</span>
											</td>
											<td>
												{/* Cấp độ là danh mục, không phải trạng thái → nhãn trung tính.
												    Hồng dành cho "đang chờ bạn", không tô theo cấp. */}
												<Badge tone='gray'>
													{lookup(d.levels, t.level_id)}
												</Badge>
											</td>
											<td>
												<Badge
													tone={sc.tone}
													dot
												>
													{sc.label}
												</Badge>
											</td>
											<td>
												<span className={styles.dateText}>
													{new Date(t.created_at).toLocaleDateString('vi-VN', {
														day: '2-digit',
														month: '2-digit',
														year: 'numeric',
													})}
												</span>
											</td>
											<td className={styles.colActions}>
												<RowActions
													onEdit={() => {
														d.setEditTopic(t);
														d.setViewTopic(null);
													}}
													onDelete={() => d.setDeleteTopic(t)}
												>
													<RowAction
														title='Xem chi tiết'
														onClick={() => d.setViewTopic(t)}
													>
														<EyeSvg />
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
					total={d.total}
					rowsPerPage={d.rowsPerPage}
					onPageChange={d.setPage}
					onRowsPerPageChange={(n) => {
						d.setRowsPerPage(n);
						d.setPage(1);
					}}
					itemLabel='đề tài'
				/>
			</div>

			{/* ── MODALS & DRAWER ── */}
			{showImport && (
				<TopicImportModal
					rounds={d.rounds}
					onClose={() => setShowImport(false)}
					onDone={d.refreshData}
				/>
			)}
			{d.showExport && (
				<ExportExcelModal
					totalCount={d.stats.total}
					filteredCount={d.total}
					fetchExportIds={d.fetchExportIds}
					categories={d.categories}
					levels={d.levels}
					rounds={d.rounds}
					departments={d.departments}
					onClose={() => d.setShowExport(false)}
				/>
			)}
			{d.showCreate && (
				<TopicModal
					mode='create'
					categories={d.categories}
					rounds={d.rounds}
					departments={d.departments}
					onClose={() => d.setShowCreate(false)}
					onSave={d.handleCreate}
				/>
			)}
			{d.editTopic && (
				<TopicModal
					mode='edit'
					topic={d.editTopic}
					categories={d.categories}
					rounds={d.rounds}
					departments={d.departments}
					onClose={() => d.setEditTopic(null)}
					onSave={d.handleEdit}
				/>
			)}
			{d.deleteTopic && (
				<DeleteModal
					topic={d.deleteTopic}
					onClose={() => d.setDeleteTopic(null)}
					onConfirm={d.handleDelete}
				/>
			)}
			{d.viewTopic && !d.editTopic && (
				<TopicDrawer
					topic={d.viewTopic}
					categories={d.categories}
					levels={d.levels}
					rounds={d.rounds}
					departments={d.departments}
					onClose={() => d.setViewTopic(null)}
					onEdit={() => {
						d.setEditTopic(d.viewTopic!);
						d.setViewTopic(null);
					}}
				/>
			)}
			{bulkModal === 'edit' && (
				<TopicBulkEditModal
					count={rowSel.selectedCount}
					categories={d.categories}
					departments={d.departments}
					loading={d.bulkBusy}
					onClose={() => setBulkModal(null)}
					onSave={async (patch) => {
						await d.handleBulkEdit([...rowSel.selectedIds], patch);
						rowSel.clearSelection();
						setBulkModal(null);
					}}
				/>
			)}
			<BulkDeleteModal
				open={bulkModal === 'delete'}
				count={rowSel.selectedCount}
				itemLabel='đề tài'
				loading={d.bulkBusy}
				note='Toàn bộ thành viên, tiến độ và tài liệu của các đề tài này cũng bị xóa.'
				onClose={() => setBulkModal(null)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setBulkModal(null);
				}}
			/>
		</AdminLayout>
	);
}
