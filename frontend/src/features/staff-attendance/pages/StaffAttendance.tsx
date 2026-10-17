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
	user_id: string;
	full_name: string;
	staff_number: string | null;
	department_name: string | null;
	/** checked = đã chấm; pending = có ca chưa hết mà chưa chấm; absent = hết ca không chấm */
	status: 'checked' | 'pending' | 'absent';
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

type StatusFilter = '' | 'late' | 'early' | 'absent' | 'pending' | 'no_out';
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
	{ value: '', label: 'Tất cả trạng thái' },
	{ value: 'late', label: 'Đi muộn' },
	{ value: 'early', label: 'Về sớm' },
	{ value: 'no_out', label: 'Chưa chấm ra' },
	{ value: 'absent', label: 'Vắng (có ca, không chấm)' },
	{ value: 'pending', label: 'Chưa tới giờ / chưa chấm' },
];
const matches = (r: Row, f: StatusFilter) =>
	!f ||
	(f === 'late' && !!r.late_min) ||
	(f === 'early' && !!r.early_min) ||
	(f === 'no_out' && r.status === 'checked' && !r.check_out_at) ||
	(f === 'absent' && r.status === 'absent') ||
	(f === 'pending' && r.status === 'pending');

const place = (ip?: string | null, m?: number | null) => [ip, m != null ? `${m}m` : null].filter(Boolean).join(' · ');

const STATUS_TEXT: Record<Row['status'], string> = { checked: 'Đã chấm', pending: 'Chưa chấm', absent: 'Vắng' };
const EXCEL_COLS: ExcelColumn<Row>[] = [
	{ header: 'Mã nhân viên', value: (r) => r.staff_number },
	{ header: 'Họ và tên', value: (r) => r.full_name },
	{ header: 'Khoa/phòng', value: (r) => r.department_name },
	{ header: 'Ca', value: (r) => r.shift_name },
	{ header: 'Giờ ca', value: (r) => (r.shift_start_at ? `${formatTimeVN(r.shift_start_at)}–${formatTimeVN(r.shift_end_at)}` : '') },
	{ header: 'Giờ vào', value: (r) => formatTimeVN(r.check_in_at) },
	{ header: 'Giờ ra', value: (r) => formatTimeVN(r.check_out_at) },
	{ header: 'Đi muộn (phút)', value: (r) => r.late_min || '' },
	{ header: 'Về sớm (phút)', value: (r) => r.early_min || '' },
	{ header: 'Trạng thái', value: (r) => STATUS_TEXT[r.status] },
	{ header: 'Nơi chấm vào', value: (r) => place(r.check_in_ip, r.check_in_distance_m) },
	{ header: 'Nơi chấm ra', value: (r) => place(r.check_out_ip, r.check_out_distance_m) },
];

export default function StaffAttendance() {
	const [date, setDate] = useState(() => toIsoDate(new Date()));
	const [rows, setRows] = useState<Row[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [dept, setDept] = useState('');
	const [status, setStatus] = useState<StatusFilter>('');

	const load = useCallback(() => {
		apiClient
			.get<Row[]>(`/staff-attendance?date=${date}`)
			.then(setRows)
			.catch((e) => notify.error(e instanceof Error ? e.message : 'Không thể tải bảng chấm công'))
			.finally(() => setLoading(false));
	}, [date]);
	useEffect(load, [load]);
	useRealtimeUpdate(['staff_attendance', 'shift_assignments', 'work_shifts'], load);

	const departments = useMemo(
		() => [...new Set(rows.map((r) => r.department_name).filter((d): d is string => !!d))].sort(),
		[rows],
	);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return rows.filter(
			(r) =>
				matches(r, status) &&
				(!dept || r.department_name === dept) &&
				(!q || r.full_name.toLowerCase().includes(q) || String(r.staff_number ?? '') === q),
		);
	}, [rows, search, dept, status]);
	const pg = useClientPaging(filtered);
	const counts = useMemo(
		() => ({
			checked: rows.filter((r) => r.status === 'checked').length,
			absent: rows.filter((r) => r.status === 'absent').length,
			late: rows.filter((r) => r.late_min).length,
		}),
		[rows],
	);

	return (
		<AdminLayout
			pageTitle='Bảng chấm công'
			pageSubtitle='Giờ vào/ra theo ca — ca qua đêm tính vào ngày bắt đầu ca'
			headerActions={
				<ExcelActions
					fileName={`cham-cong-${date}`}
					itemLabel='lượt chấm công'
					columns={EXCEL_COLS}
					getRows={() => filtered}
				/>
			}
		>
			<div className={tbl.tableCard}>
				<div className={tbl.tableHeader}>
					<div className={tbl.tableHeaderLeft}>
						<span className={tbl.tableTitle}>Chấm công ngày</span>
						<span className={tbl.tableCount}>
							{counts.checked} lượt chấm · {counts.late} muộn · {counts.absent} vắng
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
						{/* Xem phạm vi khoa: server chỉ trả nhân viên khoa mình ⇒ không cần lọc khoa */}
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
						<SearchInput value={search} onChange={setSearch} placeholder='Tìm theo tên, MNV...' />
					</div>
				</div>

				<div className={tbl.tableWrap}>
					<table className={tbl.table}>
						<thead>
							<tr>
								<th className={`${tbl.th} ${tbl.thIdx}`}>STT</th>
								<th className={tbl.th}>Nhân viên</th>
								<th className={tbl.th}>Ca</th>
								<th className={tbl.th}>Giờ vào</th>
								<th className={tbl.th}>Giờ ra</th>
								<th className={tbl.th}>Trạng thái</th>
							</tr>
						</thead>
						<tbody>
							{!loading && filtered.length === 0 ? (
								<TableEmpty
									colSpan={6}
									title={rows.length ? 'Không có dòng phù hợp bộ lọc' : 'Chưa có ca hay lượt chấm công nào trong ngày này'}
								/>
							) : (
								pg.paged.map((r, i) => (
									<tr key={r.key} className={tbl.tr}>
										<td className={`${tbl.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
										<td className={tbl.td}>
											<div className={tbl.cellTitle}>{r.full_name}</div>
											<div className={tbl.cellSub}>
												{r.staff_number ? `MNV ${r.staff_number}` : 'Chưa có MNV'}
												{r.department_name ? ` · ${r.department_name}` : ''}
											</div>
										</td>
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
												<span className={tbl.cellSub}>{r.status === 'checked' ? 'Chưa chấm ra' : '—'}</span>
											)}
										</td>
										<td className={tbl.td}>
											{r.status === 'absent' ? (
												<Badge tone='red'>Vắng</Badge>
											) : r.status === 'pending' ? (
												<Badge tone='gray'>Chưa chấm</Badge>
											) : r.late_min || r.early_min ? (
												<span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
													{!!r.late_min && <Badge tone='amber'>Muộn {r.late_min}′</Badge>}
													{!!r.early_min && <Badge tone='amber'>Sớm {r.early_min}′</Badge>}
												</span>
											) : (
												<Badge tone='green'>{r.shift_id != null ? 'Đúng giờ' : 'Đã chấm'}</Badge>
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
