import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarSvg, CheckSvg, EyeSvg, LayersSvg, PlusSvg, UploadSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Button, Pagination, RowAction, RowActions, SearchInput, SkeletonTable, TableEmpty } from '@/shared/components';
import crud from '@/shared/components/Table/CrudPage.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN, toIsoDate } from '@/shared/utils/formatDate';
import { removeDiacritics } from '@/shared/utils/helper';
import { autoArrangeCourse, decideEnrollment, getCourses, getPracticeRecords } from '../api/courseApi';
import { AddPracticeRecordModal } from '../components/AddPracticeRecordModal';
import { PracticeBookImportModal } from '../components/PracticeBookImportModal';
import {
	PRACTICE_STAGE_LABEL,
	TRAINING_TYPE,
	type Course,
	type PracticeRecordRow,
	type PracticeStage,
} from '../types/course.type';
import styles from './Courses.module.css';
import local from './PracticeRecords.module.css';

type StageTab = PracticeStage | 'all';
const STAGE_TABS: { key: StageTab; /** Ẩn tab khi không có hồ sơ nào. */ optional?: boolean }[] = [
	{ key: 'all' },
	{ key: 'pending' },
	{ key: 'unscheduled' },
	{ key: 'practicing' },
	{ key: 'completed' },
	{ key: 'dropped', optional: true },
	{ key: 'other', optional: true },
];
const isStageTab = (v: string | null): v is StageTab => STAGE_TABS.some((t) => t.key === v);
const stageLabel = (k: StageTab) => (k === 'all' ? 'Tất cả' : PRACTICE_STAGE_LABEL[k]);

const fold = (s: string) => removeDiacritics(s).toLowerCase();
const DAY_MS = 86_400_000;
const daysUntil = (iso: string | null) =>
	iso ? Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`).getTime() - new Date(`${toIsoDate(new Date())}T00:00:00`).getTime()) / DAY_MS) : null;

/** Lựa chọn của 1 bộ lọc lấy từ chính danh sách (chỉ hiện giá trị đang có hồ sơ). */
const optionsOf = (rows: PracticeRecordRow[], key: (r: PracticeRecordRow) => [string, string] | null) => {
	const map = new Map<string, string>();
	rows.forEach((r) => {
		const kv = key(r);
		if (kv && !map.has(kv[0])) map.set(kv[0], kv[1]);
	});
	return [...map].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
};

interface Filters {
	program: string;
	department: string;
	mentor: string;
	course: string;
	unit: string;
}
const NO_FILTERS: Filters = { program: '', department: '', mentor: '', course: '', unit: '' };

/**
 * Hồ sơ thực hành GPHN — Phòng Đào tạo làm việc theo hồ sơ trên mọi đợt:
 * duyệt → xếp lịch (khoa · ngày · người hướng dẫn) → theo dõi vòng → kết thúc.
 * Khóa GPHN chỉ còn là "đợt" (nhãn, bộ lọc); quản lý đợt ở trang Khóa học.
 */
export default function PracticeRecords() {
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const stageParam = params.get('stage');
	const stage: StageTab = isStageTab(stageParam) ? stageParam : 'all';
	const [rows, setRows] = useState<PracticeRecordRow[] | null>(null);
	const [courses, setCourses] = useState<Course[]>([]);
	const [error, setError] = useState('');
	const [search, setSearch] = useState('');
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [refreshKey, setRefreshKey] = useState(0);
	const [busy, setBusy] = useState(false);
	const [adding, setAdding] = useState(false);
	const [importing, setImporting] = useState(false);
	const perm = usePermission();
	const canEdit = perm.has('courses:update');
	const canCreate = perm.has('courses:create');
	const canApprove = perm.has('courses:approve');

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate(['course_enrollment', 'course'], refresh);

	useEffect(() => {
		let cancelled = false;
		Promise.all([getPracticeRecords(), getCourses({ training_type_id: TRAINING_TYPE.GPHN })])
			.then(([r, c]) => {
				if (cancelled) return;
				setRows(r);
				setCourses(c.data.filter((x) => x.status !== 'cancelled'));
				setError('');
			})
			.catch((e: Error) => !cancelled && setError(e.message || 'Không thể tải hồ sơ thực hành'));
		return () => {
			cancelled = true;
		};
	}, [refreshKey]);

	const all = useMemo(() => rows ?? [], [rows]);
	const q = fold(search.trim());
	// Lọc theo từ khóa + bộ lọc (chưa theo giai đoạn) — để đếm số hồ sơ trên mỗi tab
	const scoped = useMemo(
		() =>
			all.filter(
				(r) =>
					(!q ||
						fold(
							[r.trainee_name, r.practice_code, r.trainee_phone, r.program_code, r.program_name, r.current_mentor]
								.filter(Boolean)
								.join(' '),
						).includes(q)) &&
					(!filters.program || (r.program_id ?? '') === filters.program) &&
					(!filters.department || r.current_department_id === filters.department) &&
					(!filters.mentor || r.current_mentor_user_id === filters.mentor) &&
					(!filters.course || r.course_id === filters.course) &&
					(!filters.unit || (r.sending_unit ?? '') === filters.unit),
			),
		[all, q, filters],
	);
	const counts = useMemo(() => {
		const c: Record<string, number> = { all: scoped.length };
		scoped.forEach((r) => (c[r.stage] = (c[r.stage] ?? 0) + 1));
		return c;
	}, [scoped]);
	const filtered = useMemo(() => (stage === 'all' ? scoped : scoped.filter((r) => r.stage === stage)), [scoped, stage]);
	const pg = useClientPaging(filtered);

	const opts = useMemo(
		() => ({
			program: optionsOf(all, (r) => (r.program_id ? [r.program_id, r.program_code || r.program_name || r.program_id] : null)),
			department: optionsOf(all, (r) =>
				r.current_department_id ? [r.current_department_id, r.current_department || r.current_department_id] : null,
			),
			mentor: optionsOf(all, (r) => (r.current_mentor_user_id ? [r.current_mentor_user_id, r.current_mentor || '—'] : null)),
			course: optionsOf(all, (r) => [r.course_id, r.course_name]),
			unit: optionsOf(all, (r) => (r.sending_unit ? [r.sending_unit, r.sending_unit] : null)),
		}),
		[all],
	);

	const changeStage = (k: StageTab) => {
		setParams(k === 'all' ? {} : { stage: k }, { replace: true });
		pg.setPage(1);
	};
	const setFilter = (k: keyof Filters) => (e: React.ChangeEvent<HTMLSelectElement>) => {
		setFilters((f) => ({ ...f, [k]: e.target.value }));
		pg.setPage(1);
	};
	const filterActive = !!search.trim() || Object.values(filters).some(Boolean);

	const open = (r: PracticeRecordRow, tab?: string) =>
		navigate(`/admin/practice-records/${r.id}${tab ? `?tab=${tab}` : ''}`);

	const decide = async (r: PracticeRecordRow, status: 'approved' | 'rejected') => {
		if (status === 'rejected' && !window.confirm(`Từ chối hồ sơ của ${r.trainee_name}?`)) return;
		setBusy(true);
		try {
			await decideEnrollment(r.id, status);
			showToast('success', status === 'approved' ? 'Đã duyệt — bước tiếp: xếp lịch thực hành' : 'Đã từ chối hồ sơ');
			refresh();
		} catch (e) {
			showToast('error', (e as Error).message || 'Cập nhật thất bại');
		} finally {
			setBusy(false);
		}
	};

	// Xếp lịch mọi hồ sơ đã duyệt chưa có vòng (đang hiện sau bộ lọc) — gọi theo từng đợt
	const unscheduled = scoped.filter((r) => r.stage === 'unscheduled' && r.program_id);
	const arrangeAll = async () => {
		const courseIds = [...new Set(unscheduled.map((r) => r.course_id))];
		setBusy(true);
		let arranged = 0;
		const failed: string[] = [];
		try {
			for (const id of courseIds) {
				const out = await autoArrangeCourse(id);
				arranged += out.arranged;
				failed.push(...out.failed);
			}
			showToast(
				failed.length ? 'info' : 'success',
				`Đã xếp lịch ${arranged} hồ sơ${failed.length ? ` · ${failed.length} hồ sơ không xếp được: ${failed[0]}` : ''}`,
			);
		} catch (e) {
			showToast('error', (e as Error).message || 'Xếp lịch thất bại');
		} finally {
			setBusy(false);
			refresh();
		}
	};

	// Nhập sổ Excel vào 1 đợt: đợt đang lọc, hoặc đợt duy nhất
	const importCourseId = filters.course || (courses.length === 1 ? courses[0].id : '');

	const headerActions = (
		<div className={local.headerActions}>
			<Button
				variant='ghost'
				icon={<LayersSvg />}
				onClick={() => navigate(`/admin/courses?type=${TRAINING_TYPE.GPHN}`)}
				title='Tạo / sửa đợt thực hành (khóa GPHN), chương trình áp dụng, đăng ký công khai'
			>
				Quản lý đợt
			</Button>
			{canEdit && (
				<Button
					variant='secondary'
					icon={<UploadSvg />}
					disabled={!importCourseId}
					onClick={() => setImporting(true)}
					title={importCourseId ? 'Nhập sổ thực hành (Excel mẫu 3) vào đợt đang chọn' : 'Chọn đợt ở bộ lọc trước khi nhập sổ'}
				>
					Nhập sổ Excel
				</Button>
			)}
			{canCreate && (
				<Button
					icon={<PlusSvg />}
					disabled={!courses.length}
					title={courses.length ? undefined : 'Chưa có đợt thực hành nào — tạo đợt trước'}
					onClick={() => setAdding(true)}
				>
					Thêm hồ sơ
				</Button>
			)}
		</div>
	);

	const placeCell = (r: PracticeRecordRow) => {
		if (r.current_department || r.current_round)
			return (
				<>
					{r.current_department || <span className={local.muted}>Chưa chọn khoa</span>}
					{r.current_round && <div className={styles.descText}>{r.current_round}</div>}
				</>
			);
		if (r.next_start_date)
			return (
				<span className={local.muted}>
					Sắp: {r.next_department || r.next_round || 'vòng kế'}
					<div className={styles.descText}>từ {formatDateVN(r.next_start_date)}</div>
				</span>
			);
		return <span className={local.muted}>—</span>;
	};

	const timeCell = (r: PracticeRecordRow) => {
		if (!r.start_date && !r.end_date) return <span className={local.muted}>—</span>;
		const left = r.stage === 'practicing' ? daysUntil(r.end_date) : null;
		return (
			<>
				{formatDateVN(r.start_date) || '…'} – {formatDateVN(r.end_date) || '…'}
				{left != null && (
					<div className={styles.descText}>{left >= 0 ? `còn ${left} ngày` : `quá hạn ${-left} ngày`}</div>
				)}
			</>
		);
	};

	const progressCell = (r: PracticeRecordRow) => {
		if (r.stage === 'pending') return <span className={local.warn}>Chờ duyệt</span>;
		if (!r.rotation_total)
			return r.stage === 'unscheduled' ? (
				<span className={local.warn}>Chưa xếp lịch</span>
			) : (
				<span className={local.muted}>{PRACTICE_STAGE_LABEL[r.stage]}</span>
			);
		return (
			<>
				<span
					className={local.nowrap}
					title='Số vòng đạt / tổng số vòng'
				>
					{r.rotation_passed}/{r.rotation_total} vòng đạt
				</span>
				{(r.rotation_awaiting > 0 || r.rotation_failed > 0) && (
					<div className={styles.descText}>
						{r.rotation_awaiting > 0 && <span className={local.warn}>{r.rotation_awaiting} vòng chờ đánh giá</span>}
						{r.rotation_awaiting > 0 && r.rotation_failed > 0 && ' · '}
						{r.rotation_failed > 0 && <span className={local.danger}>{r.rotation_failed} không đạt</span>}
					</div>
				)}
				{r.stage !== 'practicing' && <div className={styles.descText}>{PRACTICE_STAGE_LABEL[r.stage]}</div>}
			</>
		);
	};

	const filterSelect = (k: keyof Filters, label: string, options: [string, string][]) =>
		options.length > 0 && (
			<select
				className={`${tbl.filterSelect} ${local.filter} ${filters[k] ? tbl.filterActive : ''}`}
				aria-label={label}
				value={filters[k]}
				onChange={setFilter(k)}
			>
				<option value=''>{label}: tất cả</option>
				{options.map(([v, name]) => (
					<option
						key={v}
						value={v}
					>
						{name}
					</option>
				))}
			</select>
		);

	return (
		<AdminLayout
			pageTitle='Hồ sơ thực hành GPHN'
			pageSubtitle='Duyệt hồ sơ → xếp lịch khoa · ngày · người hướng dẫn → theo dõi từng vòng đến khi hoàn thành'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={headerActions}
		>
			<div
				className={crud.tabs}
				role='tablist'
			>
				{STAGE_TABS.filter((t) => !t.optional || counts[t.key] || stage === t.key).map((t) => (
					<button
						key={t.key}
						type='button'
						role='tab'
						aria-selected={stage === t.key}
						className={`${crud.tabBtn} ${stage === t.key ? crud.tabBtnActive : ''}`}
						onClick={() => changeStage(t.key)}
					>
						{stageLabel(t.key)}
						<span>({counts[t.key] ?? 0})</span>
					</button>
				))}
			</div>

			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>{stageLabel(stage)}</span>
						<span className={styles.descText}>{filtered.length} hồ sơ</span>
					</div>
					{canEdit && unscheduled.length > 0 && (stage === 'all' || stage === 'unscheduled') && (
						<Button
							size='sm'
							icon={<CalendarSvg />}
							loading={busy}
							onClick={arrangeAll}
							title='Tự xếp khoa · lịch · người hướng dẫn cho mọi hồ sơ đã duyệt chưa có vòng (theo bộ lọc đang chọn)'
						>
							Xếp lịch {unscheduled.length} hồ sơ đã duyệt
						</Button>
					)}
				</div>

				<div className={styles.enrFilters}>
					<div className={styles.enrFilterRow}>
						<div className={styles.enrSearch}>
							<SearchInput
								value={search}
								onChange={(v) => {
									setSearch(v);
									pg.setPage(1);
								}}
								placeholder='Tìm theo tên, mã thực hành, SĐT, chương trình, người hướng dẫn...'
							/>
						</div>
					</div>
					<div className={styles.enrFilterRow}>
						{filterSelect('program', 'Chương trình', opts.program)}
						{filterSelect('department', 'Khoa hiện tại', opts.department)}
						{filterSelect('mentor', 'Người hướng dẫn', opts.mentor)}
						{filterSelect('unit', 'Đơn vị cử đi', opts.unit)}
						{filterSelect('course', 'Đợt', opts.course)}
						{filterActive && (
							<button
								type='button'
								className={styles.enrClear}
								onClick={() => {
									setSearch('');
									setFilters(NO_FILTERS);
									pg.setPage(1);
								}}
							>
								Xoá bộ lọc
							</button>
						)}
					</div>
				</div>

				{error ? (
					<div className={styles.errorBanner}>{error}</div>
				) : (
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={`${styles.th} ${styles.tdIdx}`}>STT</th>
									<th className={styles.th}>Học viên</th>
									<th className={styles.th}>Chương trình · đợt</th>
									<th className={styles.th}>Đang ở khoa</th>
									<th className={styles.th}>Người hướng dẫn</th>
									<th className={styles.th}>Thời gian</th>
									<th className={styles.th}>Tiến độ</th>
									<th className={`${styles.th} ${styles.tdActions}`}>Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{!rows ? (
									<SkeletonTable cols={8} />
								) : pg.paged.length === 0 ? (
									<TableEmpty
										colSpan={8}
										title={filterActive ? 'Không có hồ sơ khớp bộ lọc' : `Không có hồ sơ ${stageLabel(stage).toLowerCase()}`}
										desc={
											filterActive
												? 'Thử đổi từ khoá hoặc bộ lọc.'
												: all.length === 0
													? 'Bấm “Thêm hồ sơ”, hoặc chọn đợt rồi “Nhập sổ Excel”.'
													: undefined
										}
									/>
								) : (
									pg.paged.map((r, i) => (
										<tr
											key={r.id}
											className={styles.tr}
										>
											<td className={`${styles.td} ${styles.tdIdx}`}>{pg.offset + i + 1}</td>
											<td className={styles.td}>
												<span
													className={styles.itemName}
													onClick={() => open(r)}
												>
													{r.trainee_name}
												</span>
												<div className={styles.descText}>
													{[r.practice_code, r.is_internal ? 'Nội viện' : 'Ngoại viện', r.trainee_phone]
														.filter(Boolean)
														.join(' · ')}
												</div>
											</td>
											<td className={styles.td}>
												{r.program_code || r.program_name || <span className={local.muted}>Chưa chọn chương trình</span>}
												<div className={styles.descText}>{r.course_name}</div>
											</td>
											<td className={styles.td}>{placeCell(r)}</td>
											<td className={styles.td}>{r.current_mentor || <span className={local.muted}>—</span>}</td>
											<td className={`${styles.td} ${local.nowrap}`}>{timeCell(r)}</td>
											<td className={styles.td}>{progressCell(r)}</td>
											<td className={`${styles.td} ${styles.tdActions}`}>
												<RowActions>
													{canApprove && r.stage === 'pending' && (
														<>
															<RowAction
																title='Duyệt hồ sơ'
																disabled={busy}
																onClick={() => void decide(r, 'approved')}
															>
																<CheckSvg />
															</RowAction>
															<RowAction
																title='Từ chối'
																danger
																disabled={busy}
																onClick={() => void decide(r, 'rejected')}
															>
																<XSvg />
															</RowAction>
														</>
													)}
													{canEdit && r.stage === 'unscheduled' && (
														<RowAction
															title='Xếp lịch thực hành'
															onClick={() => open(r, 'rotations')}
														>
															<CalendarSvg />
														</RowAction>
													)}
													<RowAction
														title='Mở hồ sơ'
														onClick={() => open(r)}
													>
														<EyeSvg />
													</RowAction>
												</RowActions>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
				)}
				<Pagination
					{...pg.pagination}
					itemLabel='hồ sơ'
				/>
			</div>

			{adding && (
				<AddPracticeRecordModal
					courses={courses}
					defaultCourseId={filters.course || undefined}
					onClose={() => setAdding(false)}
					onAdded={(id) => navigate(`/admin/practice-records/${id}`)}
				/>
			)}
			{importing && importCourseId && (
				<PracticeBookImportModal
					courseId={importCourseId}
					onClose={() => setImporting(false)}
					onImported={refresh}
				/>
			)}
		</AdminLayout>
	);
}
