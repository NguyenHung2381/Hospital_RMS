import { useState } from 'react';
import { CheckSvg, DocSvg, EditSvg, PlusSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { BulkButton, BulkDeleteModal, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { LessonDocumentsModal } from '../components/LessonDocumentsModal';
import { LessonFormModal } from '../components/LessonFormModal';
import { useLessons } from '../hooks/useLessons';
import styles from './TrainingPrograms.module.css';

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 0] as const;

export default function Lessons() {
	const d = useLessons();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
	const [docsLesson, setDocsLesson] = useState<{ id: string; title: string } | null>(null);

	const headerActions = (
		<button
			className={styles.btnAddHeader}
			onClick={() => d.setFormModal({ mode: 'add' })}
		>
			<PlusSvg /> Thêm bài học
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Bài học'
			pageSubtitle='Quản lý toàn bộ bài học dùng chung cho các chương trình đào tạo'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách bài học</span>
						{rowSel.selectedCount > 0 ? (
							<span className={styles.tableCount}>
								Đã chọn {rowSel.selectedCount}
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
							<span className={styles.tableCount}>{d.filtered.length} bài học</span>
						)}
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên/mã bài học...'
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
								<th className={styles.th}>Mã</th>
								<th className={styles.th}>Bài học</th>
								<th className={styles.th}>Chương trình đang dùng</th>
								<th className={styles.th}>Số tiết</th>
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
											<div className={styles.emptyTitle}>Không tìm thấy bài học</div>
											<div className={styles.emptyDesc}>
												{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có bài học nào'}
											</div>
										</div>
									</td>
								</tr>
							) : (
								d.paged.map((l, i) => {
									const rowNum = (d.safePage - 1) * (d.pageSize || d.filtered.length) + i + 1;
									return (
										<tr
											key={l.id}
											className={`${styles.tr} ${rowSel.isSelected(l.id) ? sel.rowSelected : ''}`}
										>
											<td className={sel.checkCol}>
												<SelectCheckbox
													title='Chọn bài học'
													checked={rowSel.isSelected(l.id)}
													onChange={() => rowSel.toggleSelect(l.id)}
												/>
											</td>
											<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
											<td className={styles.td}>
												<span className={styles.descText}>{l.code || '—'}</span>
											</td>
											<td className={styles.td}>
												<span className={styles.itemName}>{l.title}</span>
											</td>
											<td className={styles.td}>
												<span className={styles.descText}>{l.program_names ?? '—'}</span>
											</td>
											<td className={styles.td}>
												<span className={styles.descText}>
													{l.theory_hours} LT · {l.practice_hours} TH · {l.total_hours} tổng
												</span>
											</td>
											<td className={styles.td}>
												{l.is_active ? (
													<span className={styles.badge}>Hoạt động</span>
												) : (
													<span
														className={styles.badge}
														style={{ background: 'var(--color-gray-100)', color: 'var(--color-gray-500)' }}
													>
														Ngưng hoạt động
													</span>
												)}
											</td>
											<td className={`${styles.td} ${styles.tdActions}`}>
												<div className={styles.actionBtns}>
													<div
														className={styles.actionBtn}
														title='Tài liệu'
														onClick={() => setDocsLesson({ id: l.id, title: l.title })}
													>
														<DocSvg />
													</div>
													<div
														className={styles.actionBtn}
														title='Chỉnh sửa'
														onClick={() => d.setFormModal({ mode: 'edit', lesson: l })}
													>
														<EditSvg />
													</div>
													<div
														className={`${styles.actionBtn} ${styles.danger}`}
														title='Xoá'
														onClick={() => d.setDeletingLesson(l)}
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
						itemLabel='bài học'
						hideSizeSelect
					/>
				)}
			</div>

			<BulkDeleteModal
				open={confirmBulkDelete}
				count={rowSel.selectedCount}
				itemLabel='bài học'
				loading={d.loading}
				note='Bài học đang được nhiều chương trình dùng chung sẽ bị gỡ khỏi tất cả các chương trình đó.'
				onClose={() => setConfirmBulkDelete(false)}
				onConfirm={async () => {
					await d.handleBulkDelete([...rowSel.selectedIds]);
					rowSel.clearSelection();
					setConfirmBulkDelete(false);
				}}
			/>

			{d.formModal && (
				<LessonFormModal
					mode={d.formModal.mode}
					lesson={
						d.formModal.lesson
							? {
									lesson_id: d.formModal.lesson.id,
									code: d.formModal.lesson.code,
									title: d.formModal.lesson.title,
									description: d.formModal.lesson.description,
									is_active: d.formModal.lesson.is_active,
									theory_hours: d.formModal.lesson.theory_hours,
									practice_hours: d.formModal.lesson.practice_hours,
									credits: d.formModal.lesson.credits,
								}
							: undefined
					}
					programs={d.programs}
					onClose={() => d.setFormModal(null)}
					onSaved={d.reload}
				/>
			)}

			{d.deletingLesson && (
				<div
					className={styles.modalBackdrop}
					onClick={(e) => e.target === e.currentTarget && d.setDeletingLesson(null)}
				>
					<div className={`${styles.modal} ${styles.modalSm}`}>
						<div className={styles.modalHeader}>
							<div className={styles.modalHeaderIconDanger}>
								<TrashSvg />
							</div>
							<div>
								<div className={styles.modalTitle}>Xoá bài học</div>
								<div className={styles.modalSub}>{d.deletingLesson.title}</div>
							</div>
							<button
								className={styles.modalClose}
								onClick={() => d.setDeletingLesson(null)}
							>
								<XSvg />
							</button>
						</div>
						<div className={styles.modalBody}>
							<p className={styles.deleteDesc}>
								Bài học sẽ bị xoá hẳn khỏi mọi chương trình đào tạo đang dùng chung (nếu có). Thao tác này không thể
								hoàn tác.
							</p>
						</div>
						<div className={styles.modalFooter}>
							<button
								className={styles.btnCancel}
								onClick={() => d.setDeletingLesson(null)}
								disabled={d.loading}
							>
								Huỷ
							</button>
							<button
								className={styles.btnDanger}
								onClick={d.handleDelete}
								disabled={d.loading}
							>
								{d.loading ? <span className={`${styles.spinner} ${styles.spinnerDark}`} /> : <TrashSvg />}
								Xoá bài học
							</button>
						</div>
					</div>
				</div>
			)}

			{docsLesson && (
				<LessonDocumentsModal
					lesson={docsLesson}
					onClose={() => setDocsLesson(null)}
				/>
			)}

			{d.toast && (
				<div
					className={`${styles.toast} ${
						styles[`toast${d.toast.type.charAt(0).toUpperCase() + d.toast.type.slice(1)}` as keyof typeof styles]
					}`}
				>
					{d.toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{d.toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
