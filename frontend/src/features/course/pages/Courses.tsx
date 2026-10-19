import { SearchInput, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { apiClient } from '@/shared/api/axios';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { dateText, isYes, matchLabel, nameMap, numText } from '@/shared/components/Excel/excelHelpers';
import { formatDateVN } from '@/shared/utils/formatDate';
import { createCourse, getCourses } from '../api/courseApi';
import { EMPTY_FORM, type Course } from '../types/course.type';
import { EyeSvg, PlusSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { DeleteAllButton, SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { formatDate } from '../../../shared/utils/formatDate';
import { CourseDeleteModal } from '../components/CourseDeleteModal';
import { CourseFormModal } from '../components/CourseFormModal';
import { useCourses } from '../hooks/useCourses';
import { DISPLAY_STATUS_CFG } from '../types/course.type';
import styles from './Courses.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

type Named = { id: string; name: string };

const EXCEL_COLS: ExcelColumn<Course>[] = [
	{ header: 'Tên khóa học', key: 'name', required: true, value: (x) => x.name },
	{ header: 'Loại khóa', value: (x) => x.training_type_name },
	{ header: 'Đợt số', value: (x) => x.batch_no },
	{ header: 'Chương trình', key: 'programs', value: (x) => (x.program_names ?? '').split(/,\s*/).filter(Boolean).join('; ') },
	{ header: 'Hình thức học', key: 'training_form', value: (x) => x.training_form_name },
	{ header: 'Ngày bắt đầu', key: 'start_date', value: (x) => formatDateVN(x.start_date) },
	{ header: 'Ngày kết thúc', key: 'end_date', value: (x) => formatDateVN(x.end_date) },
	{ header: 'Mở đăng ký từ', key: 'enrollment_start_date', value: (x) => formatDateVN(x.enrollment_start_date) },
	{ header: 'Mở đăng ký đến', key: 'enrollment_end_date', value: (x) => formatDateVN(x.enrollment_end_date) },
	{ header: 'Sĩ số', key: 'capacity', value: (x) => x.capacity },
	{ header: 'Đăng ký công khai', key: 'is_public_registration', value: (x) => (x.is_public_registration ? 'Có' : 'Không') },
	{ header: 'Mô tả', key: 'description', value: (x) => x.description },
	{ header: 'Trạng thái', value: (x) => DISPLAY_STATUS_CFG[x.display_status]?.label },
	{ header: 'Đã duyệt', value: (x) => x.approved_count },
	{ header: 'Chờ duyệt', value: (x) => x.pending_count },
];

export default function Courses() {
	const d = useCourses();
	const navigate = useNavigate();
	const openCourse = (id: string) => navigate(`/admin/courses/${id}`);
	const rowSel = useRowSelection(d.paged.map((x) => x.id));

	// Danh mục để khớp tên khi nhập — chỉ tải 1 lần khi bắt đầu nhập.
	const loadLookups = useMemo(() => {
		let p: Promise<{ forms: Record<string, string>; programs: Record<string, string> }> | null = null;
		return () =>
			(p ??= Promise.all([
				apiClient.get<{ data: Named[] }>('/training-forms?limit=0'),
				apiClient.get<{ data: Named[] }>('/training-programs?limit=0'),
			]).then(([f, pr]) => ({ forms: nameMap(f.data, (x) => x.name), programs: nameMap(pr.data, (x) => x.name) })));
	}, []);

	const headerActions = (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
			<ExcelActions
				fileName='khoa-hoc'
				itemLabel='khóa học'
				columns={EXCEL_COLS}
				getRows={async () => (await getCourses({ search: d.search || undefined })).data}
				importHint='Chương trình ghi tên, nhiều chương trình cách nhau bằng dấu chấm phẩy (;). Ngày ghi dd/mm/yyyy.'
				importRow={async (r) => {
					const { forms, programs } = await loadLookups();
					return createCourse({
						...EMPTY_FORM,
						name: r.name,
						program_ids: r.programs
							.split(/[;\n]/)
							.map((t) => matchLabel(programs, t, 'Chương trình'))
							.filter((id): id is string => !!id),
						training_form_id: matchLabel(forms, r.training_form, 'Hình thức học') ?? '',
						start_date: dateText(r.start_date, 'Ngày bắt đầu'),
						end_date: dateText(r.end_date, 'Ngày kết thúc'),
						enrollment_start_date: dateText(r.enrollment_start_date, 'Mở đăng ký từ'),
						enrollment_end_date: dateText(r.enrollment_end_date, 'Mở đăng ký đến'),
						capacity: numText(r.capacity),
						is_public_registration: isYes(r.is_public_registration),
						description: r.description,
					});
				}}
				onImported={d.refreshData}
			/>
			<button
				className={styles.btnAddHeader}
				onClick={() => d.setModal('add')}
			>
				<PlusSvg /> Thêm khóa học
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Quản lý Khóa học'
			pageSubtitle='Mở một khóa học để làm lần lượt: ghi danh → lịch học & giảng viên → tài liệu → thi → kết quả & chứng chỉ'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách khóa học</span>
						<SelectionCount
							rowSel={rowSel}
							itemLabel='khóa học'
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.total} khóa học
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder='Tìm theo tên khóa học...'
						/>
						<DeleteAllButton
							count={d.total}
							itemLabel='khóa học'
							getIds={d.fetchAllIds}
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
							<th className={styles.th}>Khóa học</th>
							<th className={styles.th}>Chương trình</th>
							<th className={styles.th}>Đăng ký</th>
							<th className={styles.th}>Sĩ số</th>
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
						) : d.total === 0 ? (
							<tr>
								<td colSpan={8}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>Không tìm thấy khóa học</div>
										<div className={styles.emptyDesc}>
											{d.search ? 'Thử thay đổi từ khoá tìm kiếm' : 'Chưa có khóa học nào'}
										</div>
									</div>
								</td>
							</tr>
						) : (
							d.paged.map((c, i) => {
								const rowNum = (d.safePage - 1) * (d.pageSize || d.total) + i + 1;
								const cfg = DISPLAY_STATUS_CFG[c.display_status];
								const isFull = c.capacity != null && c.approved_count >= c.capacity;
								return (
									<tr
										key={c.id}
										className={`${styles.tr} ${rowSel.isSelected(c.id) ? sel.rowSelected : ''}`}
									>
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn khóa học'
												checked={rowSel.isSelected(c.id)}
												onChange={() => rowSel.toggleSelect(c.id)}
											/>
										</td>
										<td className={`${styles.td} ${styles.tdIdx}`}>{rowNum}</td>
										<td className={styles.td}>
											<span
												className={styles.itemName}
												title='Mở khóa học'
												onClick={() => openCourse(c.id)}
											>
												{c.name}
											</span>
											{c.training_type_name && (
												<div className={styles.descText}>
													{c.training_type_name}
													{c.is_rolling ? ' · mở liên tục' : ''}
												</div>
											)}
											{c.pending_count > 0 && (
												<div className={styles.descText}>
													{c.pending_count} đăng ký chờ duyệt
												</div>
											)}
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>{c.program_names ?? '—'}</span>
											<div>
												<span
													className={styles.badge}
													style={
														c.is_public_registration
															? { background: '#e1f5ea', color: '#085028' }
															: { background: 'var(--color-gray-100)', color: 'var(--color-gray-600)' }
													}
												>
													{c.is_public_registration ? 'Công khai' : 'Nội bộ'}
												</span>
											</div>
										</td>
										<td className={styles.td}>
											<span className={styles.descText}>
												{c.enrollment_start_date || c.enrollment_end_date
													? `${formatDate(c.enrollment_start_date) ?? '—'} — ${formatDate(c.enrollment_end_date) ?? '—'}`
													: 'Luôn mở'}
												{' · '}
												<span style={{ color: c.enrollment_open ? '#085028' : '#791f1f' }}>
													{c.enrollment_open ? 'Đang mở' : 'Đã đóng'}
												</span>
											</span>
										</td>
										<td className={styles.td}>
											<span className={`${styles.capacityText} ${isFull ? styles.capacityFull : ''}`}>
												{c.approved_count}
												{c.capacity != null ? `/${c.capacity}` : ''}
											</span>
										</td>
										<td className={styles.td}>
											<span
												className={styles.badge}
												style={{ background: cfg.bg, color: cfg.color }}
											>
												{cfg.label}
											</span>
										</td>
										<td className={`${styles.td} ${styles.tdActions}`}>
											<RowActions
												onEdit={() => {
													d.setEditingCourse(c);
													d.setModal('edit');
												}}
												onDelete={() => {
													d.setDeletingCourse(c);
													d.setModal('delete');
												}}
											>
												<RowAction
													title='Mở khóa học'
													onClick={() => openCourse(c.id)}
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
					rowsPerPage={d.pageSize}
					onPageChange={d.setPage}
					itemLabel='khóa học'
					onRowsPerPageChange={d.handlePageSize}
				/>
			</div>


			{d.modal === 'add' && (
				<CourseFormModal
					mode='add'
					onClose={() => d.setModal(null)}
					onSave={d.handleAdd}
					loading={d.loading}
				/>
			)}
			{d.modal === 'edit' && d.editingCourse && (
				<CourseFormModal
					mode='edit'
					course={d.editingCourse}
					onClose={() => {
						d.setModal(null);
						d.setEditingCourse(null);
					}}
					onSave={d.handleEdit}
					loading={d.loading}
				/>
			)}
			{d.modal === 'delete' && d.deletingCourse && (
				<CourseDeleteModal
					course={d.deletingCourse}
					onClose={() => {
						d.setModal(null);
						d.setDeletingCourse(null);
					}}
					onConfirm={d.handleDelete}
					loading={d.loading}
				/>
			)}

		</AdminLayout>
	);
}
