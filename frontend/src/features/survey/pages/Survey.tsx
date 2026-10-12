import { SearchInput, PageSizeSelect, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { BarChartSvg, LinkSvg, PlusSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { surveyApi } from '../api/surveyApi';
import { SurveyDeleteModal } from '../components/SurveyDeleteModal';
import { SurveyFormModal } from '../components/SurveyFormModal';
import { SurveyResultsModal } from '../components/SurveyResultsModal';
import { useSurvey } from '../hooks/useSurvey';
import type { SurveyStatus } from '../types/survey.type';
import styles from './Survey.module.css';

const STATUS_CLASS: Record<SurveyStatus, string> = {
	draft: 'statusDraft',
	active: 'statusActive',
	closed: 'statusCancelled',
};

export default function Survey() {
	const d = useSurvey();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setModal('add')}
		>
			<PlusSvg /> Tạo khảo sát
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Khảo sát'
			pageSubtitle='Tạo khảo sát, thu thập và xem kết quả phản hồi'
			breadcrumbs={[{ label: 'Hệ thống' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách khảo sát</span>
						<SelectionCount
							rowSel={rowSel}
							itemLabel='khảo sát'
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.filtered.length} khảo sát
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên...'
						/>
						<PageSizeSelect
							value={d.pageSize}
							onChange={d.handlePageSize}
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
								<th className={styles.th}>#</th>
								<th className={styles.th}>Khảo sát</th>
								<th className={styles.th}>Đối tượng</th>
								<th className={styles.th}>Câu hỏi</th>
								<th className={styles.th}>Phản hồi</th>
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
											<div className={styles.emptyTitle}>Không tìm thấy khảo sát</div>
											<div className={styles.emptyDesc}>
												{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có khảo sát nào'}
											</div>
										</div>
									</td>
								</tr>
							) : (
								d.paged.map((survey, i) => {
									const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
									return (
										<tr
											key={survey.id}
											className={`${styles.tr} ${rowSel.isSelected(survey.id) ? sel.rowSelected : ''}`}
										>
											<td className={sel.checkCol}>
												<SelectCheckbox
													title='Chọn dòng'
													checked={rowSel.isSelected(survey.id)}
													onChange={() => rowSel.toggleSelect(survey.id)}
												/>
											</td>
											<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
											<td className={styles.td}>
												<div className={styles.itemName}>{survey.title}</div>
												{survey.description && (
													<div className={styles.descText}>{survey.description}</div>
												)}
											</td>
											<td className={styles.td}>{survey.target_role_name ?? 'Tất cả'}</td>
											<td className={styles.td}>{survey.question_count}</td>
											<td className={styles.td}>{survey.response_count}</td>
											<td className={styles.td}>
												<span className={`${styles.statusBadge} ${styles[STATUS_CLASS[survey.status]]}`}>
													{d.statusLabel[survey.status]}
												</span>
											</td>
											<td className={`${styles.td} ${styles.tdActions}`}>
												<RowActions
													onEdit={async () => {
														const full = await surveyApi.getById(survey.id);
														d.setEditingItem(full);
														d.setModal('edit');
													}}
													onDelete={() => {
														d.setDeletingItem(survey);
														d.setModal('delete');
													}}
												>
													<RowAction
														title='Xem kết quả'
														onClick={() => d.openResults(survey)}
													>
														<BarChartSvg />
													</RowAction>
													<RowAction
														title='Sao chép link trả lời khảo sát'
														onClick={() => d.copyRespondLink(survey)}
													>
														<LinkSvg />
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

				{d.filtered.length > 0 && d.totalPages > 1 && (
					<Pagination
						page={d.safePage}
						totalPages={d.totalPages}
						total={d.filtered.length}
						rowsPerPage={d.pageSize}
						onPageChange={d.setPage}
						itemLabel='khảo sát'
						hideSizeSelect
					/>
				)}
			</div>


			{d.modal === 'add' && (
				<SurveyFormModal
					mode='add'
					roles={d.roles}
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingItem && (
				<SurveyFormModal
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
				<SurveyDeleteModal
					item={d.deletingItem}
					onClose={() => {
						d.setModal(null);
						d.setDeletingItem(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}
			{d.modal === 'results' && (
				<SurveyResultsModal
					results={d.results}
					onClose={() => d.setModal(null)}
				/>
			)}

		</AdminLayout>
	);
}
