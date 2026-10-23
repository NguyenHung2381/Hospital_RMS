import { Modal, TableEmpty } from '@/shared/components';
import { SearchInput, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useState } from 'react';
import { DocSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { isYes, matchLabel, nameMap, numText } from '@/shared/components/Excel/excelHelpers';
import { createLesson, setLessonPrograms } from '../api/trainingProgramApi';
import {
	EMPTY_LESSON_FORM,
	formatDuration,
	LESSON_KIND_LABEL,
	type Lesson,
} from '../types/trainingProgram.type';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { DeleteAllButton, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { LessonDocumentsModal } from '../components/LessonDocumentsModal';
import { LessonFormModal } from '../components/LessonFormModal';
import { useLessons } from '../hooks/useLessons';
import styles from './TrainingPrograms.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

export default function Lessons() {
	const d = useLessons();
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	const [docsLesson, setDocsLesson] = useState<{ id: string; title: string } | null>(null);

	const programNames = nameMap(d.programs, (p) => p.name);
	const excelCols: ExcelColumn<Lesson>[] = [
		{ header: 'Mã bài học', key: 'code', required: true, value: (x) => x.code },
		{ header: 'Tên bài học', key: 'title', required: true, value: (x) => x.title },
		{ header: 'Giờ lý thuyết', key: 'theory_hours', value: (x) => x.theory_hours },
		{ header: 'Giờ thực hành', key: 'practice_hours', value: (x) => x.practice_hours },
		{ header: 'Tín chỉ', key: 'credits', value: (x) => x.credits },
		{ header: 'Loại', value: (x) => LESSON_KIND_LABEL[x.lesson_kind] },
		{ header: 'Thời lượng', value: (x) => formatDuration(x.duration_value, x.duration_unit) },
		{ header: 'Khoa được chọn', value: (x) => x.department_names },
		{
			header: 'Chương trình',
			key: 'programs',
			value: (x) => (x.program_ids ?? '').split(',').filter(Boolean).map((id) => programNames[id] ?? id).join('; '),
		},
		{ header: 'Hoạt động', key: 'is_active', value: (x) => (x.is_active ? 'Có' : 'Không') },
		{ header: 'Mô tả', key: 'description', value: (x) => x.description },
	];

	const headerActions = (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
			<ExcelActions
				fileName='bai-hoc'
				itemLabel='bài học'
				columns={excelCols}
				getRows={() => d.filtered}
				importRow={async (r) => {
					const programIds = r.programs
						.split(/[;\n]/)
						.map((t) => matchLabel(programNames, t, 'Chương trình'))
						.filter((id): id is string => !!id);
					const { id } = await createLesson({
						...EMPTY_LESSON_FORM,
						code: r.code,
						title: r.title,
						description: r.description,
						is_active: isYes(r.is_active, true),
						theory_hours: numText(r.theory_hours),
						practice_hours: numText(r.practice_hours),
						credits: numText(r.credits),
						program_ids: programIds,
					});
					if (programIds.length) await setLessonPrograms(id, programIds);
				}}
				onImported={d.refreshData}
			/>
			<button
				className={styles.btnAddHeader}
				onClick={() => d.setFormModal({ mode: 'add' })}
			>
				<PlusSvg /> Thêm bài học
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Bài học'
			pageSubtitle='Bài học dùng chung cho các chương trình đào tạo — lọc theo chương trình để xem nội dung từng chương trình'
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
							{d.unusedCount > 0 && (
								<button
									type='button'
									className={styles.clearSelectionBtn}
									title='Bài học chưa gắn vào chương trình nào'
									onClick={() => d.handleProgramFilter('none')}
								>
									{d.unusedCount} chưa dùng
								</button>
							)}
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên/mã bài học...'
						/>
						<select
							className={`${styles.filterSelect} ${d.programFilter ? styles.filterActive : ''}`}
							data-active={d.programFilter ? 'true' : undefined}
							value={d.programFilter}
							onChange={(e) => d.handleProgramFilter(e.target.value)}
						>
							<option value=''>Tất cả chương trình</option>
							{d.programs.map((p) => (
								<option
									key={p.id}
									value={p.id}
								>
									{p.name}
								</option>
							))}
							<option value='none'>Chưa thuộc chương trình nào</option>
						</select>
						<select
							className={`${styles.filterSelect} ${d.statusFilter ? styles.filterActive : ''}`}
							data-active={d.statusFilter ? 'true' : undefined}
							value={d.statusFilter}
							onChange={(e) => d.handleStatusFilter(e.target.value as '' | 'active' | 'inactive')}
						>
							<option value=''>Tất cả trạng thái</option>
							<option value='active'>Hoạt động</option>
							<option value='inactive'>Ngưng hoạt động</option>
						</select>
						{d.hasFilter && (
							<button
								type='button'
								className={styles.clearSelectionBtn}
								onClick={d.clearFilters}
							>
								Xoá lọc
							</button>
						)}
						<DeleteAllButton
							count={d.filtered.length}
							itemLabel='bài học'
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
								<TableEmpty
									colSpan={8}
									title='Không tìm thấy bài học'
									desc={d.hasFilter ? 'Thử thay đổi từ khoá hoặc bộ lọc' : 'Chưa có bài học nào'}
								/>
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
												{l.lesson_kind === 'rotation' && (
													<div className={styles.descText}>
														{[
															LESSON_KIND_LABEL.rotation,
															formatDuration(l.duration_value, l.duration_unit),
															l.department_names,
														]
															.filter(Boolean)
															.join(' · ')}
													</div>
												)}
											</td>
											<td className={styles.td}>
												{l.program_names ? (
													<span className={styles.descText}>{l.program_names}</span>
												) : (
													<span
														className={styles.badge}
														style={{ background: '#faeeda', color: '#633806' }}
													>
														Chưa dùng
													</span>
												)}
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

								<Pagination
					page={d.safePage}
					totalPages={d.totalPages}
					total={d.filtered.length}
					rowsPerPage={d.pageSize}
					onPageChange={d.setPage}
					itemLabel='bài học'
					onRowsPerPageChange={d.handlePageSize}
				/>
			</div>


			{d.formModal && (
				<LessonFormModal
					mode={d.formModal.mode}
					lesson={
						d.formModal.lesson
							? { ...d.formModal.lesson, lesson_id: d.formModal.lesson.id }
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
