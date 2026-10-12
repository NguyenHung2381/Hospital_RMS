import { Modal } from '@/shared/components';
import { SearchInput, PageSizeSelect, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useState } from 'react';
import { DocSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { LessonDocumentsModal } from '../components/LessonDocumentsModal';
import { LessonFormModal } from '../components/LessonFormModal';
import { useLessons } from '../hooks/useLessons';
import styles from './TrainingPrograms.module.css';

export default function Lessons() {
	const d = useLessons();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
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
						<SelectionCount
							rowSel={rowSel}
							itemLabel='bài học'
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.filtered.length} bài học
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên/mã bài học...'
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
												<RowActions
													onEdit={() => d.setFormModal({ mode: 'edit', lesson: l })}
													onDelete={() => d.setDeletingLesson(l)}
												>
													<RowAction
														title='Tài liệu'
														onClick={() => setDocsLesson({ id: l.id, title: l.title })}
													>
														<DocSvg />
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
						itemLabel='bài học'
						hideSizeSelect
					/>
				)}
			</div>


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
				<Modal
					open
					onClose={() => d.setDeletingLesson(null)}
					icon={<TrashSvg />}
					tone='danger'
					title='Xoá bài học'
					subtitle={d.deletingLesson.title}
					className={`${styles.modal} ${styles.modalSm}`}
					bodyClassName={styles.modalBody}
					footer={
						<>
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
						</>
					}
				>
					<p className={styles.deleteDesc}>
						Bài học sẽ bị xoá hẳn khỏi mọi chương trình đào tạo đang dùng chung (nếu có). Thao tác này không thể
						hoàn tác.
					</p>
				</Modal>
			)}

			{docsLesson && (
				<LessonDocumentsModal
					lesson={docsLesson}
					onClose={() => setDocsLesson(null)}
				/>
			)}

		</AdminLayout>
	);
}
