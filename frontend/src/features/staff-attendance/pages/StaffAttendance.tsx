import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { apiClient } from '@/shared/api/axios';
import { Pagination, TableEmpty } from '@/shared/components';
import tbl from '@/shared/components/Table/Table.module.css';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { toIsoDate, formatTimeVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';

interface Row {
	id: number;
	full_name: string;
	staff_number: string | null;
	department_name: string | null;
	check_in_at: string;
	check_in_ip: string | null;
	check_in_distance_m: number | null;
	check_out_at: string | null;
	check_out_ip: string | null;
	check_out_distance_m: number | null;
}

const place = (ip: string | null, m: number | null) => [ip, m != null ? `${m}m` : null].filter(Boolean).join(' · ');

export default function StaffAttendance() {
	const [date, setDate] = useState(() => toIsoDate(new Date()));
	const [rows, setRows] = useState<Row[]>([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState('');
	const [dept, setDept] = useState('');

	const load = useCallback(() => {
		apiClient
			.get<Row[]>(`/staff-attendance?date=${date}`)
			.then(setRows)
			.catch((e) => notify.error(e instanceof Error ? e.message : 'Không thể tải bảng chấm công'))
			.finally(() => setLoading(false));
	}, [date]);
	useEffect(load, [load]);
	useRealtimeUpdate(['staff_attendance'], load);

	const departments = useMemo(
		() => [...new Set(rows.map((r) => r.department_name).filter((d): d is string => !!d))].sort(),
		[rows],
	);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return rows.filter(
			(r) =>
				(!dept || r.department_name === dept) &&
				(!q || r.full_name.toLowerCase().includes(q) || String(r.staff_number ?? '') === q),
		);
	}, [rows, search, dept]);
	const pg = useClientPaging(filtered);

	return (
		<AdminLayout pageTitle='Bảng chấm công' pageSubtitle='Giờ vào/ra của nhân viên — chấm hợp lệ khi dùng mạng bệnh viện và ở trong bán kính cho phép'>
			<div className={tbl.tableCard}>
				<div className={tbl.tableHeader}>
					<div className={tbl.tableHeaderLeft}>
						<span className={tbl.tableTitle}>Chấm công ngày</span>
						<span className={tbl.tableCount}>{filtered.length} người</span>
					</div>
					<div className={tbl.tableControls}>
						<input
							type='date'
							className={tbl.filterSelect}
							value={date}
							max={toIsoDate(new Date())}
							onChange={(e) => {
								if (!e.target.value) return;
								setLoading(true);
								setDate(e.target.value);
							}}
							aria-label='Ngày'
						/>
						<select className={tbl.filterSelect} value={dept} onChange={(e) => setDept(e.target.value)} aria-label='Khoa/phòng'>
							<option value=''>Tất cả khoa/phòng</option>
							{departments.map((d) => (
								<option key={d} value={d}>
									{d}
								</option>
							))}
						</select>
						<SearchInput value={search} onChange={setSearch} placeholder='Tìm theo tên, MNV...' />
					</div>
				</div>

				<div className={tbl.tableWrap}>
					<table className={tbl.table}>
						<thead>
							<tr>
								<th className={`${tbl.th} ${tbl.thIdx}`}>STT</th>
								<th className={tbl.th}>Nhân viên</th>
								<th className={tbl.th}>Giờ vào</th>
								<th className={tbl.th}>Giờ ra</th>
							</tr>
						</thead>
						<tbody>
							{!loading && filtered.length === 0 ? (
								<TableEmpty
									colSpan={4}
									title={rows.length ? 'Không tìm thấy nhân viên phù hợp' : 'Chưa có ai chấm công trong ngày này'}
								/>
							) : (
								pg.paged.map((r, i) => (
									<tr key={r.id} className={tbl.tr}>
										<td className={`${tbl.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
										<td className={tbl.td}>
											<div className={tbl.cellTitle}>{r.full_name}</div>
											<div className={tbl.cellSub}>
												{r.staff_number ? `MNV ${r.staff_number}` : 'Chưa có MNV'}
												{r.department_name ? ` · ${r.department_name}` : ''}
											</div>
										</td>
										<td className={tbl.td}>
											<div className={tbl.cellTitle}>{formatTimeVN(r.check_in_at)}</div>
											<div className={tbl.cellSub}>{place(r.check_in_ip, r.check_in_distance_m)}</div>
										</td>
										<td className={tbl.td}>
											{r.check_out_at ? (
												<>
													<div className={tbl.cellTitle}>{formatTimeVN(r.check_out_at)}</div>
													<div className={tbl.cellSub}>{place(r.check_out_ip, r.check_out_distance_m)}</div>
												</>
											) : (
												<span className={tbl.cellSub}>Chưa chấm ra</span>
											)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				<Pagination {...pg.pagination} itemLabel='người' />
			</div>
		</AdminLayout>
	);
}
