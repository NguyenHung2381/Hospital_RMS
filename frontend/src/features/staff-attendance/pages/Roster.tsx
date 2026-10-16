import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/layouts/AdminLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Button, EmptyState, InlineLoading, Pagination } from '@/shared/components';
import tbl from '@/shared/components/Table/Table.module.css';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { cx } from '@/shared/utils/cx';
import { notify } from '@/shared/utils/feedback';
import {
	WEEKDAYS,
	addDays,
	patternApi,
	rosterApi,
	shiftApi,
	shiftsForDay,
	weekdayOf,
	type Assignment,
	type ShiftPattern,
	type ShiftUser,
	type WorkShift,
} from '../api/shiftApi';
import { RosterEditModal, type RosterCell } from '../components/RosterEditModal';
import { ShiftBadge } from '../components/ShiftBadge';
import styles from './Roster.module.css';

const todayVN = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const monthDays = (month: string) => {
	const first = `${month}-01`;
	const n = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
	return Array.from({ length: n }, (_, i) => addDays(first, i));
};
const shiftMonth = (month: string, delta: number) => {
	const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + delta, 1));
	return d.toISOString().slice(0, 7);
};
const key = (userId: string, date: string) => `${userId}|${date}`;

export default function Roster() {
	const [month, setMonth] = useState(() => todayVN().slice(0, 7));
	const [data, setData] = useState<{ users: ShiftUser[]; assignments: Assignment[] } | null>(null);
	const [shifts, setShifts] = useState<WorkShift[]>([]);
	const [patterns, setPatterns] = useState<ShiftPattern[]>([]);
	const [dept, setDept] = useState('');
	const [search, setSearch] = useState('');
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(null);
	const [editing, setEditing] = useState(false);

	const days = useMemo(() => monthDays(month), [month]);
	const today = todayVN();

	const load = useCallback(() => {
		Promise.all([rosterApi.get(days[0], days[days.length - 1]), shiftApi.list(), patternApi.list()])
			.then(([r, s, p]) => {
				setData(r);
				setShifts(s);
				setPatterns(p);
			})
			.catch((e) => notify.error(e instanceof Error ? e.message : 'Không thể tải bảng phân ca'));
	}, [days]);
	useEffect(load, [load]);
	useRealtimeUpdate(['shift_assignments', 'work_shifts'], load);

	const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);
	const patternById = useMemo(() => new Map(patterns.map((p) => [p.id, p])), [patterns]);
	const defaultPattern = patterns.find((p) => p.is_default) ?? null;
	const byCell = useMemo(() => {
		const map = new Map<string, Assignment[]>();
		for (const a of data?.assignments ?? []) map.set(key(a.user_id, a.work_date), [...(map.get(key(a.user_id, a.work_date)) ?? []), a]);
		return map;
	}, [data]);

	const departments = useMemo(
		() => [...new Set((data?.users ?? []).map((u) => u.department_name).filter((d): d is string => !!d))].sort(),
		[data],
	);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (data?.users ?? []).filter(
			(u) => (!dept || u.department_name === dept) && (!q || u.full_name.toLowerCase().includes(q) || (u.staff_number ?? '').toLowerCase() === q),
		);
	}, [data, dept, search]);
	const pg = useClientPaging(filtered, 30);
	const rows = pg.paged;

	const toggleKeys = (keys: string[]) =>
		setSelected((s) => {
			const next = new Set(s);
			const allOn = keys.every((k) => next.has(k));
			for (const k of keys) {
				if (allOn) next.delete(k);
				else next.add(k);
			}
			return next;
		});
	const clickCell = (row: number, col: number, shift: boolean) => {
		if (shift && anchor) {
			const keys: string[] = [];
			for (let r = Math.min(anchor.row, row); r <= Math.max(anchor.row, row); r++)
				for (let c = Math.min(anchor.col, col); c <= Math.max(anchor.col, col); c++) keys.push(key(rows[r].id, days[c]));
			setSelected((s) => new Set([...s, ...keys]));
		} else toggleKeys([key(rows[row].id, days[col])]);
		setAnchor({ row, col });
	};

	const cells: RosterCell[] = [...selected].map((k) => {
		const [user_id, date] = k.split('|');
		return { user_id, date };
	});

	const renderCell = (u: ShiftUser, date: string) => {
		const pattern = u.shift_pattern_id ? (patternById.get(u.shift_pattern_id) ?? null) : defaultPattern;
		const day = shiftsForDay(pattern, byCell.get(key(u.id, date)) ?? [], date);
		if (!day) return null;
		const list = day.shiftIds
			.map((id) => shiftById.get(id))
			.filter((s): s is WorkShift => !!s)
			.sort((a, b) => a.start_time.localeCompare(b.start_time));
		if (!list.length) return day.source === 'roster' ? <span className={styles.offMark}>N</span> : null;
		return (
			<div className={cx(styles.cellInner, day.source === 'pattern' && styles.fromPattern)}>
				{list.map((s) => (
					<ShiftBadge key={s.id} shift={s} />
				))}
			</div>
		);
	};

	return (
		<AdminLayout pageTitle='Phân ca' pageSubtitle='Xếp ca làm việc theo ngày — ghi đè mẫu ca tuần của từng người'>
			<div className={tbl.tableCard}>
				<div className={tbl.tableHeader}>
					<div className={styles.controls}>
						<Button variant='secondary' size='sm' onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label='Tháng trước'>
							‹
						</Button>
						<input
							type='month'
							className={tbl.filterSelect}
							value={month}
							onChange={(e) => e.target.value && setMonth(e.target.value)}
							aria-label='Tháng'
						/>
						<Button variant='secondary' size='sm' onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label='Tháng sau'>
							›
						</Button>
					</div>
					<div className={tbl.tableControls}>
						<select
							className={tbl.filterSelect}
							value={dept}
							onChange={(e) => {
								setDept(e.target.value);
								pg.setPage(1);
							}}
							aria-label='Khoa/phòng'
						>
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

				<div className={styles.legend}>
					{shifts
						.filter((s) => s.is_active)
						.map((s) => (
							<span key={s.id} className={styles.legendItem}>
								<ShiftBadge shift={s} /> {s.name} {s.start_time}–{s.end_time}
							</span>
						))}
					<span className={styles.legendItem}>
						<span className={styles.offMark}>N</span> Nghỉ
					</span>
					<span className={cx(styles.legendItem, styles.fromPattern)}>Mờ = theo mẫu tuần</span>
					<span className={styles.legendItem}>Ô trống = không có ca</span>
					<span className={styles.legendItem}>· Bấm ô để chọn, Shift+bấm chọn vùng, bấm ngày/tên để chọn cả cột/hàng</span>
				</div>

				{selected.size > 0 && (
					<div className={styles.actionBar}>
						<span>
							Đã chọn <b>{selected.size}</b> ô
						</span>
						<Button variant='secondary' size='sm' onClick={() => setSelected(new Set())}>
							Bỏ chọn
						</Button>
						<Button size='sm' onClick={() => setEditing(true)} disabled={!shifts.some((s) => s.is_active)}>
							Xếp ca…
						</Button>
					</div>
				)}
				{!data ? (
					<InlineLoading />
				) : filtered.length === 0 ? (
					<EmptyState title='Không có nhân viên phù hợp' />
				) : (
					<div className={styles.gridWrap}>
						<table className={styles.grid}>
							<thead>
								<tr>
									<th className={styles.nameCell}>Nhân viên</th>
									{days.map((d) => {
										const wd = weekdayOf(d);
										return (
											<th
												key={d}
												className={cx(wd >= 6 && styles.weekend, d === today && styles.today)}
												onClick={() => toggleKeys(rows.map((u) => key(u.id, d)))}
												title={`Chọn cả ngày ${d.split('-').reverse().join('/')}`}
											>
												<div>{WEEKDAYS[wd - 1].label}</div>
												<div className={styles.dayNum}>{Number(d.slice(8))}</div>
											</th>
										);
									})}
								</tr>
							</thead>
							<tbody>
								{rows.map((u, row) => (
									<tr key={u.id}>
										<th className={styles.nameCell} onClick={() => toggleKeys(days.map((d) => key(u.id, d)))} title='Chọn cả tháng của người này'>
											<div className={styles.name}>{u.full_name}</div>
											<div className={styles.sub}>
												{u.staff_number ? `MNV ${u.staff_number}` : 'Chưa có MNV'}
												{u.department_name ? ` · ${u.department_name}` : ''}
											</div>
										</th>
										{days.map((d, col) => (
											<td
												key={d}
												className={cx(styles.cell, weekdayOf(d) >= 6 && styles.weekend, selected.has(key(u.id, d)) && styles.selected)}
												onClick={(e) => clickCell(row, col, e.shiftKey)}
											>
												{renderCell(u, d)}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				<Pagination {...pg.pagination} itemLabel='người' />
			</div>

			{editing && (
				<RosterEditModal
					cells={cells}
					shifts={shifts.filter((s) => s.is_active)}
					onClose={() => setEditing(false)}
					onSaved={() => {
						notify.success(`Đã cập nhật ${cells.length} ô phân ca`);
						setEditing(false);
						setSelected(new Set());
						load();
					}}
				/>
			)}
		</AdminLayout>
	);
}
