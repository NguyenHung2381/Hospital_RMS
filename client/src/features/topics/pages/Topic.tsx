import {
	ApproveSvg,
	CheckSvg,
	DocSvg,
	DownloadSvg,
	EditSvg,
	EyeSvg,
	PlusSvg,
	ProgressSvg,
	SearchSvg,
	TrashSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { MultiSelect } from '../../../shared/components/Input/MultiSelect';
import { Pagination } from '../../../shared/components/Table/Pagination';
import { Badge } from '../components/Badge';
import { DeleteModal } from '../components/DeleteModal';
import { ExportExcelModal } from '../components/ExportExcelModal';
import { TopicDrawer } from '../components/TopicDrawer';
import { TopicModal } from '../components/TopicModal';
import { useTopicPage } from '../hooks/useTopicPage';
import { STATUS_CFG, lookup } from '../utils/topicHelpers';
import styles from './Topic.module.css';

export default function TopicPage() {
	const d = useTopicPage();

	const headerActions = (
		<>
			<button
				className={styles.btnSecondary}
				onClick={() => d.setShowExport(true)}
			>
				<DownloadSvg style={{ width: 14, height: 14 }} />
				Xuất Excel
			</button>
			<button
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
			pageTitle='Quản lý Đề tài Nghiên cứu'
			pageSubtitle='Danh sách và theo dõi tất cả đề tài NCKH'
			headerActions={headerActions}
		>
			{/* ── STATS ── */}
			<div className={styles.statsRow}>
				<div className={`${styles.statCard} ${styles.green}`}>
					<div className={`${styles.statIcon} ${styles.iconGreen}`}>
						<DocSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{d.stats.total}</div>
						<div className={styles.statLabel}>Tổng đề tài</div>
						<div className={`${styles.statDelta} ${styles.deltaUp}`}>
							Đợt 1/2026 + lịch sử
						</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.blue}`}>
					<div className={`${styles.statIcon} ${styles.iconBlue}`}>
						<ProgressSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{d.stats.approved}</div>
						<div className={styles.statLabel}>Đã được duyệt</div>
						<div className={`${styles.statDelta} ${styles.deltaNeutral}`}>
							{d.stats.total > 0
								? Math.round((d.stats.approved / d.stats.total) * 100)
								: 0}
							% tổng đề tài
						</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.amber}`}>
					<div className={`${styles.statIcon} ${styles.iconAmber}`}>
						<ApproveSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{d.stats.submitted}</div>
						<div className={styles.statLabel}>Chờ phê duyệt</div>
						<div className={`${styles.statDelta} ${styles.deltaDown}`}>
							Cần xử lý sớm
						</div>
					</div>
				</div>
				<div className={`${styles.statCard} ${styles.pink}`}>
					<div className={`${styles.statIcon} ${styles.iconPink}`}>
						<CheckSvg />
					</div>
					<div className={styles.statBody}>
						<div className={styles.statValue}>{d.stats.rejected}</div>
						<div className={styles.statLabel}>Bị từ chối</div>
						<div className={`${styles.statDelta} ${styles.deltaDown}`}>
							{d.stats.total > 0
								? Math.round((d.stats.rejected / d.stats.total) * 100)
								: 0}
							% tổng đề tài
						</div>
					</div>
				</div>
			</div>

			{/* ── TABLE CARD ── */}
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách đề tài</span>
						<span className={styles.tableCount}>
							{d.filtered.length} đề tài
						</span>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchWrap}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
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
								{ id: 'bai_bao', label: 'Bài báo & Tập san' },
							]}
							selected={d.articleTypeFilters}
							onChange={(next) => {
								d.setArticleTypeFilters(next);
								d.setPage(1);
							}}
							placeholder='Loại'
						/>
					</div>
				</div>

				<div className={styles.tabsRow}>
					{d.TABS.map((t) => (
						<div
							key={t.key}
							className={`${styles.tab} ${d.activeTab === t.key ? styles.tabActive : ''}`}
							onClick={() => {
								d.setActiveTab(t.key);
								d.resetPage();
							}}
						>
							{t.label}
							<span className={styles.tabBadge}>{t.count}</span>
						</div>
					))}
				</div>

				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th className={styles.colId}>Mã đề tài</th>
								<th className={styles.colTitle}>Tên đề tài</th>
								<th className={styles.colRound}>Đợt NC</th>
								<th className={styles.colLevel}>Cấp độ</th>
								<th className={styles.colCategory}>Phân loại</th>
								<th className={styles.colDept}>Phòng ban</th>
								<th className={styles.colStatus}>Trạng thái</th>
								<th className={styles.colDate}>Ngày đăng ký</th>
								<th className={styles.colActions}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{d.isLoadingData ? (
								<tr>
									<td
										colSpan={10}
										style={{
											textAlign: 'center',
											padding: '40px',
											color: 'var(--color-gray-400)',
											fontSize: 13,
										}}
									>
										Đang tải dữ liệu...
									</td>
								</tr>
							) : d.loadError ? (
								<tr>
									<td
										colSpan={10}
										style={{
											textAlign: 'center',
											padding: '40px',
											color: 'var(--color-red-600)',
											fontSize: 13,
										}}
									>
										{d.loadError}
									</td>
								</tr>
							) : d.pageSlice.length === 0 ? (
								<tr>
									<td colSpan={10}>
										<div className={styles.emptyState}>
											<DocSvg className={styles.emptyIcon} />
											<p className={styles.emptyTitle}>
												Không tìm thấy đề tài nào
											</p>
											<p className={styles.emptyDesc}>
												Thử thay đổi bộ lọc hoặc từ khoá tìm kiếm
											</p>
										</div>
									</td>
								</tr>
							) : (
								d.pageSlice.map((t) => {
									const sc = STATUS_CFG[t.status];
									return (
										<tr key={t.id}>
											<td>
												<div className={styles.topicId}>{t.id}</div>
											</td>
											<td>
												<div
													className={styles.topicTitle}
													title={t.title}
													onClick={() => d.setViewTopic(t)}
												>
													{t.article_type === 'bai_bao' && (
														<Badge cls='badgeBlue'>Bài báo</Badge>
													)}{' '}
													{t.title}
												</div>
												<div className={styles.topicMeta}>
													{lookup(d.departments, t.department_id)} ·{' '}
													{t.member_count} thành viên
												</div>
											</td>
											<td>
												<span className={styles.dateText}>
													{lookup(d.rounds, t.round_id)}
												</span>
											</td>
											<td>
												<Badge
													cls={
														t.level_id === 'CD04'
															? 'badgePink'
															: t.level_id === 'CD03'
																? 'badgePurple'
																: 'badgeTeal'
													}
												>
													{lookup(d.levels, t.level_id)}
												</Badge>
											</td>
											<td>
												<span
													style={{
														fontSize: 12,
														color: 'var(--color-gray-600)',
													}}
												>
													{lookup(d.categories, t.category_id)}
												</span>
											</td>
											<td>
												<span style={{ fontSize: 12 }}>
													{lookup(d.departments, t.department_id)}
												</span>
											</td>
											<td>
												<Badge
													cls={sc.cls}
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
											<td>
												<div className={styles.actionBtns}>
													<div
														className={styles.actionBtn}
														title='Xem chi tiết'
														onClick={() => d.setViewTopic(t)}
													>
														<EyeSvg />
													</div>
													<div
														className={styles.actionBtn}
														title='Chỉnh sửa'
														onClick={() => {
															d.setEditTopic(t);
															d.setViewTopic(null);
														}}
													>
														<EditSvg />
													</div>
													<div
														className={`${styles.actionBtn} ${styles.danger}`}
														title='Xoá'
														onClick={() => d.setDeleteTopic(t)}
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

				<Pagination
					page={d.safePage}
					totalPages={d.totalPages}
					total={d.filtered.length}
					rowsPerPage={d.rowsPerPage}
					pageSizeOptions={d.PAGE_SIZE_OPTIONS}
					onPageChange={d.setPage}
					onRowsPerPageChange={(n) => {
						d.setRowsPerPage(n);
						d.setPage(1);
					}}
					itemLabel='đề tài'
				/>
			</div>

			{/* ── MODALS & DRAWER ── */}
			{d.showExport && (
				<ExportExcelModal
					topics={d.topics}
					filtered={d.filtered}
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
					levels={d.levels}
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
					levels={d.levels}
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
		</AdminLayout>
	);
}
