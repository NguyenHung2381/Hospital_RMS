import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { apiClient } from '@/shared/api/axios';
import { Badge, Pagination, TableEmpty } from '@/shared/components';
import tbl from '@/shared/components/Table/Table.module.css';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { toIsoDate, formatTimeVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';

interface Row {
	key: string;
	/** Tài khoản học viên. */
	user_id: string;
	/** Mã học viên. */
	trainee_id: string;
	full_name: string;
	department_name: string | null;
	course_id: string | null;
	course_name: string | null;
	/** checked = đã điểm danh; pending = có ca chưa hết mà chưa điểm danh; absent = hết ca không điểm danh */
	status: 'checked' | 'pending' | 'absent' | 'excused';
	/** Đơn xin phép chờ duyệt / đã duyệt phủ dòng này (đơn cả ngày khớp mọi ca). */
	leave?: {
		id: number;
		type: 'absent' | 'late';
		status: 'pending' | 'approved';
		arrive_time: string | null;
		shift_name: string | null;
		reason: string;
	} | null;
	shift_id: number | null;
	shift_name: string | null;
	shift_code: string | null;
	shift_start_at: string | null;
	shift_end_at: string | null;
	check_in_at: string | null;
	check_in_ip?: string | null;
	check_in_distance_m?: number | null;
	check_out_at: string | null;
	check_out_ip?: string | null;
	check_out_distance_m?: number | null;
	late_min?: number | null;
	early_min?: number | null;
}

type StatusFilter = '' | 'late' | 'early' | 'absent' | 'pending' | 'no_out' | 'excused' | 'leave';
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: '', label: 'Tất cả trạng thái' },
	{ value: 'late', label: 'Đi muộn' },
	{ value: 'early', label: 'Về sớm' },
	{ value: 'no_out', label: 'Chưa điểm danh ra' },
	{ value: 'absent', label: 'Vắng (có ca, không điểm danh)' },
	{ value: 'pending', label: 'Chưa tới giờ / chưa điểm danh' },
	{ value: 'excused', label: 'Nghỉ có phép' },
	{ value: 'leave', label: 'Có đơn xin phép' },
];
const matches = (r: Row, f: StatusFilter) =>
	!f ||
	(f === 'late' && !!r.late_min) ||
	(f === 'early' && !!r.early_min) ||
	(f === 'no_out' && r.status === 'checked' && !r.check_out_at) ||
	(f === 'absent' && r.status === 'absent') ||
	(f === 'pending' && r.status === 'pending') ||
	(f === 'excused' && r.status === 'excused') ||
	(f === 'leave' && !!r.leave);

/** "Nghỉ có phép" / "Muộn có phép (08:30)" / "Đơn xin nghỉ chờ duyệt" */
const leaveText = (l: NonNullable<Row['leave']>) =>
	l.status === 'approved'
		? `${l.type === 'absent' ? 'Nghỉ' : 'Muộn'} có phép${l.arrive_time ? ` (${l.arrive_time})` : ''}`
		: `Đơn xin ${l.type === 'absent' ? 'nghỉ' : 'đi muộn'} chờ duyệt`;

const place = (ip?: string | null, m?: number | null) => [ip, m != null ? `${m}m` : null].filter(Boolean).join(' · ');

const STATUS_TEXT: Record<Row['status'], string> = {
	checked: 'Đã điểm danh',
	pending: 'Chưa điểm danh',
	absent: 'Vắng',
	excused: 'Nghỉ có phép',
};
const EXCEL_COLS: ExcelColumn<Row>[] = [
	{ header: 'Mã học viên', value: (r) => r.trainee_id },
	{ header: 'Họ và tên', value: (r) => r.full_name },
	{ header: 'Khóa học', value: (r) => r.course_name },
	{ header: 'Khoa/phòng', value: (r) => r.department_name },
	{ header: 'Ca', value: (r) => r.shift_name },
	{ header: 'Giờ ca', value: (r) => (r.shift_start_at ? `${formatTimeVN(r.shift_start_at)}–${formatTimeVN(r.shift_end_at)}` : '') },
	{ header: 'Giờ vào', value: (r) => formatTimeVN(r.check_in_at) },
	{ header: 'Giờ ra', value: (r) => formatTimeVN(r.check_out_at) },
	{ header: 'Đi muộn (phút)', value: (r) => r.late_min || '' },
	{ header: 'Về sớm (phút)', value: (r) => r.early_min || '' },
	{ header: 'Trạng thái', value: (r) => STATUS_TEXT[r.status] },
	{ header: 'Đơn xin phép', value: (r) => (r.leave ? `${leaveText(r.leave)} — ${r.leave.reason}` : '') },
	{ header: 'Nơi điểm danh vào', value: (r) => place(r.check_in_ip, r.check_in_distance_m) },
	{ header: 'Nơi điểm danh ra', value: (r) => place(r.check_out_ip, r.check_out_distance_m) },
];

export default function StaffAttendance() {
	const [date, setDate] = useState(() => toIsoDate(new Date()));
	const [rows, setRows] = useState<Row[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [dept, setDept] = useState('');
	const [course, setCourse] = useState('');
	const [status, setStatus] = useState<StatusFilter>('');

	const load = useCallback(() => {
		apiClient
			.get<Row[]>(`/staff-attendance?date=${date}`)
			.then(setRows)
			.catch((e) => notify.error(e instanceof Error ? e.message : 'Không thể tải bảng điểm danh'))
			.finally(() => setLoading(false));
	}, [date]);
	useEffect(load, [load]);
	useRealtimeUpdate(['staff_attendance', 'shift_assignments', 'work_shifts', 'attendance_leave'], load);

	const departments = useMemo(
		() => [...new Set(rows.map((r) => r.department_name).filter((d): d is string => !!d))].sort(),
		[rows],
	);
	const courses = useMemo(() => {
		const map = new Map<string, string>();
		for (const r of rows) if (r.course_id) map.set(r.course_id, r.course_name ?? r.course_id);
		return [...map].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
	}, [rows]);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return rows.filter(
			(r) =>
				matches(r, status) &&
				(!dept || r.department_name === dept) &&
				(!course || r.course_id === course) &&
				(!q || r.full_name.toLowerCase().includes(q) || r.trainee_id.toLowerCase() === q),
		);
	}, [rows, search, dept, course, status]);
	const pg = useClientPaging(filtered);
	const counts = useMemo(
		() => ({
			checked: rows.filter((r) => r.status === 'checked').length,
			absent: rows.filter((r) => r.status === 'absent').length,
			excused: rows.filter((r) => r.status === 'excused').length,
			late: rows.filter((r) => r.late_min).length,
		}),
		[rows],
	);

	return (
		<AdminLayout
			pageTitle='Bảng điểm danh học viên'
			pageSubtitle='Giờ vào/ra theo ca của học viên trong thời gian khóa học — ca qua đêm tính vào ngày bắt đầu ca'
			headerActions={
				<ExcelActions
					fileName={`cham-cong-${date}`}
					itemLabel='lượt điểm danh'
					columns={EXCEL_COLS}
					getRows={() => filtered}
				/>
			}
		>
			<div className={tbl.tableCard}>
				<div className={tbl.tableHeader}>
					<div className={tbl.tableHeaderLeft}>
						<span className={tbl.tableTitle}>Điểm danh ngày</span>
						<span className={tbl.tableCount}>
							{counts.checked} lượt điểm danh · {counts.late} muộn · {counts.absent} vắng · {counts.excused} nghỉ có phép
						</span>
					</div>
					<div className={tbl.tableControls}>
						<input
							type='date'
							className={tbl.filterSelect}
							value={date}
							onChange={(e) => {
								if (!e.target.value) return;
								setLoading(true);
								setDate(e.target.value);
							}}
							aria-label='Ngày'
						/>
						<select className={tbl.filterSelect} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)} aria-label='Trạng thái'>
							{STATUS_FILTERS.map((s) => (
								<option key={s.value} value={s.value}>
									{s.label}
								</option>
							))}
						</select>
						{courses.length > 0 && (
							<select className={tbl.filterSelect} value={course} onChange={(e) => setCourse(e.target.value)} aria-label='Khóa học'>
								<option value=''>Tất cả khóa học</option>
								{courses.map(([id, name]) => (
									<option key={id} value={id}>
										{name}
									</option>
								))}
							</select>
						)}
						{/* Xem phạm vi khoa: server chỉ trả học viên khoa mình ⇒ không cần lọc khoa */}
						{(departments.length > 1 || dept) && (
							<select className={tbl.filterSelect} value={dept} onChange={(e) => setDept(e.target.value)} aria-label='Khoa/phòng'>
								<option value=''>Tất cả khoa/phòng</option>
								{departments.map((d) => (
									<option key={d} value={d}>
										{d}
									</option>
								))}
							</select>
						)}
						<SearchInput value={search} onChange={setSearch} placeholder='Tìm theo tên, mã học viên...' />
					</div>
				</div>

				<div className={tbl.tableWrap}>
					<table className={tbl.table}>
						<thead>
							<tr>
								<th className={`${tbl.th} ${tbl.thIdx}`}>STT</th>
								<th className={tbl.th}>Học viên</th>
								<th className={tbl.th}>Khóa học</th>
								<th className={tbl.th}>Ca</th>
								<th className={tbl.th}>Giờ vào</th>
								<th className={tbl.th}>Giờ ra</th>
								<th className={tbl.th}>Trạng thái</th>
							</tr>
						</thead>
						<tbody>
							{!loading && filtered.length === 0 ? (
								<TableEmpty
									colSpan={7}
									title={rows.length ? 'Không có dòng phù hợp bộ lọc' : 'Chưa có ca hay lượt điểm danh nào của học viên trong ngày này'}
								/>
							) : (
								pg.paged.map((r, i) => (
									<tr key={r.key} className={tbl.tr}>
										<td className={`${tbl.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
										<td className={tbl.td}>
											<div className={tbl.cellTitle}>{r.full_name}</div>
											<div className={tbl.cellSub}>
												{r.trainee_id}
												{r.department_name ? ` · ${r.department_name}` : ''}
											</div>
										</td>
										<td className={tbl.td}>{r.course_name ?? <span className={tbl.cellSub}>—</span>}</td>
										<td className={tbl.td}>
											{r.shift_id != null || r.shift_name ? (
												<>
													<div className={tbl.cellTitle}>{r.shift_name}</div>
													<div className={tbl.cellSub}>
														{formatTimeVN(r.shift_start_at)}–{formatTimeVN(r.shift_end_at)}
													</div>
												</>
											) : (
												<span className={tbl.cellSub}>Tự do</span>
											)}
										</td>
										<td className={tbl.td}>
											{r.check_in_at ? (
												<>
													<div className={tbl.cellTitle}>{formatTimeVN(r.check_in_at)}</div>
													<div className={tbl.cellSub}>{place(r.check_in_ip, r.check_in_distance_m)}</div>
												</>
											) : (
												<span className={tbl.cellSub}>—</span>
											)}
										</td>
										<td className={tbl.td}>
											{r.check_out_at ? (
												<>
													<div className={tbl.cellTitle}>{formatTimeVN(r.check_out_at)}</div>
													<div className={tbl.cellSub}>{place(r.check_out_ip, r.check_out_distance_m)}</div>
												</>
											) : (
												<span className={tbl.cellSub}>{r.status === 'checked' ? 'Chưa điểm danh ra' : '—'}</span>
											)}
										</td>
										<td className={tbl.td}>
											{r.status === 'excused' ? (
												<Badge tone='blue'>Nghỉ có phép</Badge>
											) : r.status === 'absent' ? (
												<Badge tone='red'>Vắng</Badge>
											) : r.status === 'pending' ? (
												<Badge tone='gray'>Chưa điểm danh</Badge>
											) : r.late_min || r.early_min ? (
												<span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
													{!!r.late_min && <Badge tone='amber'>Muộn {r.late_min}′</Badge>}
													{!!r.early_min && <Badge tone='amber'>Sớm {r.early_min}′</Badge>}
												</span>
											) : (
												<Badge tone='green'>{r.shift_id != null ? 'Đúng giờ' : 'Đã điểm danh'}</Badge>
											)}
											{r.leave && r.status !== 'excused' && (
												<div className={tbl.cellSub} title={r.leave.reason}>
													{leaveText(r.leave)}
												</div>
											)}
											{r.leave && r.status === 'excused' && (
												<div className={tbl.cellSub} title={r.leave.reason}>
													{r.leave.reason}
												</div>
											)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				<Pagination {...pg.pagination} itemLabel='dòng' />
			</div>
		</AdminLayout>
	);
}
