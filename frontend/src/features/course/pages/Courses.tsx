import { SearchInput, SelectionCount, RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useNavigate } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { apiClient } from '@/shared/api/axios';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { dateText, isYes, matchLabel, nameMap } from '@/shared/components/Excel/excelHelpers';
import { formatDateVN } from '@/shared/utils/formatDate';
import { createCourse, getCourses } from '../api/courseApi';
import { EMPTY_FORM, TRAINING_TYPE, type Course } from '../types/course.type';
import { CopySvg, EyeSvg, LayersSvg, ListSvg, PlusSvg, QrSvg } from '@/assets/icons';
import { CourseCloneModal } from '../components/CourseCloneModal';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge, Button, InlineLoading, TableEmpty } from '@/shared/components';
import { CourseRegisterLinkModal } from '../components/CourseRegisterLinkModal';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { SelectCheckbox } from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { formatDate } from '../../../shared/utils/formatDate';
import { CourseDeleteModal } from '../components/CourseDeleteModal';
import { CourseFormModal } from '../components/CourseFormModal';
import ProgramTags from '../components/ProgramTags';
import { CourseCards } from '../components/CourseCards';
import { courseTypeFilter, useCourses } from '../hooks/useCourses';
import { DISPLAY_STATUS_CFG } from '../types/course.type';
import styles from './Courses.module.css';
import tbl from '@/shared/components/Table/Table.module.css';

type Named = { id: string; name: string };

const dateRange = (a: string | null, b: string | null) =>
	a || b ? `${formatDate(a) ?? '?'} → ${formatDate(b) ?? '?'}` : null;

// Tiêu đề / đơn vị đếm theo loại — mỗi loại đào tạo 1 trang riêng (mục menu riêng).
const TYPE_TEXT: Record<string, { title: string; unit: string; subtitle: string }> = {
	[TRAINING_TYPE.DTLT]: {
		title: 'Khóa đào tạo liên tục',
		unit: 'khóa học',
		subtitle: 'Bấm vào một khóa để quản lý học viên, lịch học, tài liệu, thi và chứng chỉ',
	},
	[TRAINING_TYPE.CTCV]: {
		title: 'Khóa cầm tay chỉ việc',
		unit: 'khóa học',
		subtitle: 'Bấm vào một khóa để quản lý học viên, lịch học, tài liệu, thi và chứng chỉ',
	},
	[TRAINING_TYPE.GPHN]: {
		title: 'Đợt thực hành GPHN',
		unit: 'đợt thực hành',
		subtitle: 'Tạo đợt, gắn chương trình và mở đăng ký — hồ sơ của từng học viên xử lý ở tab Hồ sơ thực hành',
	},
};

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
	{ header: 'Đăng ký công khai', key: 'is_public_registration', value: (x) => (x.is_public_registration ? 'Có' : 'Không') },
	{ header: 'Mô tả', key: 'description', value: (x) => x.description },
	{ header: 'Trạng thái', value: (x) => DISPLAY_STATUS_CFG[x.display_status]?.label },
	{ header: 'Đã duyệt', value: (x) => x.approved_count },
	{ header: 'Chờ duyệt', value: (x) => x.pending_count },
];

/** Danh sách khóa của 1 loại đào tạo (ĐTLT / CTCV / GPHN — với GPHN là các đợt thực hành). */
export default function Courses({ typeId }: { typeId: string }) {
	const d = useCourses(typeId);
	const navigate = useNavigate();
	const practice = typeId === TRAINING_TYPE.GPHN;
	const text = TYPE_TEXT[typeId] ?? TYPE_TEXT[TRAINING_TYPE.DTLT];
	const unit = text.unit;
	// Khóa thêm mới mang sẵn loại của trang (GPHN mở liên tục).
	const addInitial = { training_type_id: typeId, is_rolling: practice };
	const openCourse = (id: string) => navigate(`/admin/courses/${id}`);
	const filtered = !!(d.search || d.statusFilter);
	const rowSel = useRowSelection(d.paged.map((x) => x.id));
	// Link + QR đăng ký: null = đóng, 'all' = link chung, Course = link riêng 1 khóa
	const [shareLink, setShareLink] = useState<Course | 'all' | null>(null);
	const [cloneFrom, setCloneFrom] = useState<Course | null>(null);
	// Dạng bảng (mặc định) hoặc thẻ — nhớ theo trình duyệt
	const [view, setViewState] = useState<'cards' | 'table'>(() => {
		try {
			return localStorage.getItem('courses.view') === 'cards' ? 'cards' : 'table';
		} catch {
			return 'table';
		}
	});
	const setView = (v: 'cards' | 'table') => {
		setViewState(v);
		try {
			localStorage.setItem('courses.view', v);
		} catch {
			/* trình duyệt chặn lưu — chỉ nhớ trong phiên */
		}
	};

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
				getRows={async () =>
					(await getCourses({ search: d.search || undefined, ...courseTypeFilter(typeId) })).data
				}
				importHint='Chương trình ghi tên, nhiều chương trình cách nhau bằng dấu chấm phẩy (;). Ngày ghi dd/mm/yyyy.'
				importRow={async (r) => {
					const { forms, programs } = await loadLookups();
					return createCourse({
						...EMPTY_FORM,
						...addInitial,
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
						is_public_registration: isYes(r.is_public_registration),
						description: r.description,
					});
				}}
				onImported={d.refreshData}
			/>
			<Button
				variant='secondary'
				icon={<QrSvg />}
				onClick={() => setShareLink('all')}
				title='Link & mã QR trang đăng ký cho học viên'
			>
				Link đăng ký
			</Button>
			<button
				className={styles.btnAddHeader}
				onClick={() => d.setModal('add')}
			>
				<PlusSvg /> {practice ? 'Thêm đợt' : 'Thêm khóa học'}
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle={text.title}
			pageSubtitle={text.subtitle}
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách {unit}</span>
						<SelectionCount
							rowSel={rowSel}
							itemLabel='khóa học'
							loading={d.loading}
							onBulkDelete={d.handleBulkDelete}
						>
							{d.total} {unit}
						</SelectionCount>
					</div>
					<div className={styles.tableControls}>
						<div
							className={styles.viewToggle}
							role='group'
							aria-label='Kiểu hiển thị'
						>
							<button
								type='button'
								aria-pressed={view === 'table'}
								title='Dạng bảng'
								onClick={() => setView('table')}
							>
								<ListSvg />
							</button>
							<button
								type='button'
								aria-pressed={view === 'cards'}
								title='Dạng thẻ'
								onClick={() => setView('cards')}
							>
								<LayersSvg />
							</button>
						</div>
						{/* Đợt GPHN luôn "đang học" (mở liên tục) — lọc trạng thái không có nghĩa */}
						{!practice && (
							<select
								className={`${tbl.filterSelect} ${d.statusFilter ? tbl.filterActive : ''}`}
								aria-label='Lọc theo trạng thái'
								value={d.statusFilter}
								onChange={(e) => d.handleStatusFilter(e.target.value)}
							>
								<option value=''>Tất cả trạng thái</option>
								{Object.entries(DISPLAY_STATUS_CFG).map(([v, s]) => (
									<option
										key={v}
										value={v}
									>
										{s.label}
									</option>
								))}
							</select>
						)}
						<SearchInput
							value={d.search}
							onChange={d.handleSearch}
							placeholder={`Tìm theo tên ${unit}...`}
						/>
					</div>
				</div>

				{view === 'cards' ? (
					d.isLoadingData ? (
						<InlineLoading />
					) : (
						<CourseCards
							items={d.paged}
							onOpen={(c) => openCourse(c.id)}
							onEdit={(c) => {
								d.setEditingCourse(c);
								d.setModal('edit');
							}}
							onDelete={(c) => {
								d.setDeletingCourse(c);
								d.setModal('delete');
							}}
							onShareLink={setShareLink}
							onClone={setCloneFrom}
							emptyDesc={filtered ? 'Thử đổi từ khóa hoặc bộ lọc trạng thái' : `Bấm "${practice ? 'Thêm đợt' : 'Thêm khóa học'}" để bắt đầu`}
						/>
					)
				) : (
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
							<th className={styles.th}>{practice ? 'Đợt thực hành' : 'Khóa học'}</th>
							<th className={styles.th}>Thời gian học</th>
							<th className={styles.th}>Chương trình</th>
							<th className={styles.th}>Đăng ký</th>
							<th className={styles.th}>Học viên</th>
							<th className={styles.th}>Trạng thái</th>
							<th className={`${styles.th} ${styles.thRight}`}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{d.isLoadingData ? (
							<SkeletonTable
								rows={d.pageSize || 8}
								cols={9}
							/>
						) : d.total === 0 ? (
							<TableEmpty
								colSpan={9}
								title={`Không tìm thấy ${unit}`}
								desc={filtered ? 'Thử đổi từ khóa hoặc bộ lọc trạng thái' : `Chưa có ${unit} nào`}
							/>
						) : (
							d.paged.map((c, i) => {
								const rowNum = (d.safePage - 1) * (d.pageSize || d.total) + i + 1;
								const cfg = DISPLAY_STATUS_CFG[c.display_status];
								const meta = [
									c.batch_no ? `Đợt ${c.batch_no}` : null,
									c.training_form_name,
									c.is_rolling ? 'Mở liên tục' : null,
								].filter(Boolean);
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
											{meta.length > 0 && <div className={styles.descText}>{meta.join(' · ')}</div>}
										</td>
										<td className={`${styles.td} ${styles.nowrap}`}>
											<span className={styles.descText}>
												{c.is_rolling
													? 'Theo lịch từng học viên'
													: dateRange(c.start_date, c.end_date) ?? 'Chưa đặt ngày'}
											</span>
										</td>
										<td className={styles.td}>
											<ProgramTags names={c.program_names} />
										</td>
										<td className={styles.td}>
											<Badge
												tone={c.enrollment_open ? 'green' : 'gray'}
												dot
											>
												{c.enrollment_open ? 'Đang mở' : 'Đã đóng'}
											</Badge>
											<div className={`${styles.descText} ${styles.nowrap}`}>
												{c.is_public_registration ? 'Công khai' : 'Nội bộ'}
												{!c.is_rolling &&
													(c.enrollment_start_date || c.enrollment_end_date) &&
													` · ${dateRange(c.enrollment_start_date, c.enrollment_end_date)}`}
											</div>
										</td>
										<td className={`${styles.td} ${styles.nowrap}`}>
											<span className={styles.capacityText}>
												<strong>{c.approved_count}</strong> học viên
											</span>
											{c.pending_count > 0 && (
												<div>
													<Badge
														tone='amber'
														title='Đăng ký đang chờ duyệt — mở khóa học để duyệt'
													>
														{c.pending_count} chờ duyệt
													</Badge>
												</div>
											)}
											{c.waitlisted_count > 0 && (
												<div className={styles.descText}>{c.waitlisted_count} trong danh sách chờ</div>
											)}
										</td>
										<td className={styles.td}>
											<Badge tone={cfg.tone}>{cfg.label}</Badge>
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
												{c.is_public_registration && (
													<RowAction
														title='Link & QR đăng ký'
														onClick={() => setShareLink(c)}
													>
														<QrSvg />
													</RowAction>
												)}
												<RowAction
													title='Nhân bản khóa học'
													onClick={() => setCloneFrom(c)}
												>
													<CopySvg />
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
				)}

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
					initial={addInitial}
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
			{cloneFrom && (
				<CourseCloneModal
					course={cloneFrom}
					onClose={() => setCloneFrom(null)}
				/>
			)}
			{shareLink && (
				<CourseRegisterLinkModal
					course={shareLink === 'all' ? null : shareLink}
					onClose={() => setShareLink(null)}
				/>
			)}

		</AdminLayout>
	);
}
