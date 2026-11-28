import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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
	periodOn,
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
	const [course, setCourse] = useState('');
	const [ttype, setTtype] = useState('');
	const [search, setSearch] = useState('');
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(null);
	const [editing, setEditing] = useState(false);
	// Ô đang nằm trong thứ tự Tab (roving tabindex); null = ô đầu tiên chọn được
	const [rove, setRove] = useState<{ row: number; col: number } | null>(null);
	const gridRef = useRef<HTMLTableElement>(null);

	const days = useMemo(() => monthDays(month), [month]);
	const today = todayVN();

	// Đổi tháng: ô đã chọn thuộc tháng cũ, bỏ hết để không xếp ca vào ô không còn nhìn thấy
	const changeMonth = (next: string) => {
		setMonth(next);
		setSelected(new Set());
		setAnchor(null);
	};

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
	const courses = useMemo(() => {
		const map = new Map<string, string>();
		for (const u of data?.users ?? [])
			for (const p of u.periods) if (!ttype || p.training_type_name === ttype) map.set(p.course_id, p.course_name);
		return [...map].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
	}, [data, ttype]);
	// Loại hình đào tạo (chỉ khóa chấm công theo ca mới có ở đây)
	const trainingTypes = useMemo(() => {
		const set = new Set<string>();
		for (const u of data?.users ?? []) for (const p of u.periods) if (p.training_type_name) set.add(p.training_type_name);
		return [...set].sort((a, b) => a.localeCompare(b, 'vi'));
	}, [data]);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return (data?.users ?? []).filter(
			(u) =>
				(!dept || u.department_name === dept) &&
				(!ttype || u.periods.some((p) => p.training_type_name === ttype)) &&
				(!course || u.periods.some((p) => p.course_id === course)) &&
				(!q || u.full_name.toLowerCase().includes(q) || u.trainee_id.toLowerCase() === q),
		);
	}, [data, dept, ttype, course, search]);
	// Ô của ngày học viên không học khóa nào thì không chọn được
	const studying = (u: ShiftUser, date: string) => periodOn(u.periods, date) != null;
	const cellTitle = (u: ShiftUser, date: string) => {
		const p = periodOn(u.periods, date);
		return p ? [p.course_name, p.training_type_name].filter(Boolean).join(' · ') : undefined;
	};
	const pg = useClientPaging(filtered, 30);
	const rows = pg.paged;

	// Học viên đang lọc (mọi trang) — chọn cả cột phủ hết, không chỉ trang đang xem
	const filteredById = useMemo(() => new Map(filtered.map((u) => [u.id, u])), [filtered]);
	const daySet = useMemo(() => new Set(days), [days]);
	// Chỉ ô của học viên đang lọc, trong tháng đang xem mới được tính và xếp ca:
	// đổi bộ lọc thì ô của học viên bị ẩn tạm không tính (lọc lại thì hiện lại)
	const visibleSelected = useMemo(
		() =>
			[...selected].filter((k) => {
				const [userId, date] = k.split('|');
				return filteredById.has(userId) && daySet.has(date);
			}),
		[selected, filteredById, daySet],
	);

	const toggleKeys = (all: string[]) => {
		const keys = all.filter((k) => {
			const [userId, date] = k.split('|');
			const u = filteredById.get(userId);
			return !!u && studying(u, date);
		});
		if (!keys.length) return;
		setSelected((s) => {
			const next = new Set(s);
			const allOn = keys.every((k) => next.has(k));
			for (const k of keys) {
				if (allOn) next.delete(k);
				else next.add(k);
			}
			return next;
		});
	};
	const clickCell = (row: number, col: number, shift: boolean) => {
		if (!studying(rows[row], days[col])) return;
		if (shift && anchor) {
			const keys: string[] = [];
			for (let r = Math.min(anchor.row, row); r <= Math.max(anchor.row, row); r++)
				for (let c = Math.min(anchor.col, col); c <= Math.max(anchor.col, col); c++)
					if (studying(rows[r], days[c])) keys.push(key(rows[r].id, days[c]));
			setSelected((s) => new Set([...s, ...keys]));
		} else toggleKeys([key(rows[row].id, days[col])]);
		setAnchor({ row, col });
	};

	// Ô đầu tiên chọn được: giữ tabIndex=0 khi chưa ô nào được focus, để cả lưới chỉ chiếm một nhịp Tab
	const firstCell = useMemo(() => {
		for (let r = 0; r < rows.length; r++)
			for (let c = 0; c < days.length; c++) if (studying(rows[r], days[c])) return { row: r, col: c };
		return null;
	}, [rows, days]);
	const roveCell = rove && rove.row < rows.length && rove.col < days.length ? rove : firstCell;

	// Mũi tên di chuyển giữa các ô chọn được (bỏ qua ô ngoài thời gian khóa học); Home/End về đầu/cuối hàng
	const onCellKeyDown = (e: KeyboardEvent<HTMLButtonElement>, row: number, col: number) => {
		let dr = 0;
		let dc = 0;
		if (e.key === 'ArrowRight') dc = 1;
		else if (e.key === 'ArrowLeft') dc = -1;
		else if (e.key === 'ArrowDown') dr = 1;
		else if (e.key === 'ArrowUp') dr = -1;
		else if (e.key === 'Home') {
			dc = 1;
			col = -1;
		} else if (e.key === 'End') {
			dc = -1;
			col = days.length;
		} else return;
		e.preventDefault();
		let r = row + dr;
		let c = col + dc;
		while (r >= 0 && r < rows.length && c >= 0 && c < days.length) {
			if (studying(rows[r], days[c])) {
				setRove({ row: r, col: c });
				gridRef.current?.querySelector<HTMLButtonElement>(`[data-r="${r}"][data-c="${c}"]`)?.focus();
				return;
			}
			r += dr;
			c += dc;
		}
	};

	const cells: RosterCell[] = visibleSelected.map((k) => {
		const [user_id, date] = k.split('|');
		return { user_id, date };
	});

	const renderCell = (u: ShiftUser, date: string) => {
		const period = periodOn(u.periods, date);
		if (!period) return null;
		// Mẫu ca tuần của khóa đang học ngày đó; khóa chưa gán mẫu → mẫu mặc định
		const pattern = (period.shift_pattern_id ? patternById.get(period.shift_pattern_id) : undefined) ?? defaultPattern;
		const day = shiftsForDay(pattern, byCell.get(key(u.id, date)) ?? [], date);
		if (!day) return null;
		const list = day.shiftIds
			.map((id) => shiftById.get(id))
			.filter((s): s is WorkShift => !!s)
			.sort((a, b) => a.start_time.localeCompare(b.start_time));
		if (!list.length) return day.source === 'roster' ? <span className={styles.offMark}>N</span> : null;
		return (
			<span className={cx(styles.cellInner, day.source === 'pattern' && styles.fromPattern)}>
				{list.map((s) => (
					<ShiftBadge key={s.id} shift={s} />
				))}
			</span>
		);
	};

	return (
		<AdminLayout pageTitle='Phân ca học viên' pageSubtitle='Xếp ca theo ngày cho học viên trong thời gian khóa học — ghi đè mẫu ca tuần của khóa'>
			<div className={tbl.tableCard}>
				<div className={tbl.tableHeader}>
					<div className={styles.controls}>
						<Button variant='secondary' size='sm' onClick={() => changeMonth(shiftMonth(month, -1))} aria-label='Tháng trước'>
							‹
						</Button>
						<input
							type='month'
							className={tbl.filterSelect}
							value={month}
							onChange={(e) => e.target.value && changeMonth(e.target.value)}
							aria-label='Tháng'
						/>
						<Button variant='secondary' size='sm' onClick={() => changeMonth(shiftMonth(month, 1))} aria-label='Tháng sau'>
							›
						</Button>
					</div>
					<div className={tbl.tableControls}>
						{(trainingTypes.length > 1 || ttype) && (
							<select
								className={tbl.filterSelect}
								value={ttype}
								onChange={(e) => {
									setTtype(e.target.value);
									setCourse('');
									pg.setPage(1);
								}}
								aria-label='Loại hình đào tạo'
							>
								<option value=''>Tất cả loại hình</option>
								{trainingTypes.map((t) => (
									<option key={t} value={t}>
										{t}
									</option>
								))}
							</select>
						)}
						<select
							className={tbl.filterSelect}
							value={course}
							onChange={(e) => {
								setCourse(e.target.value);
								pg.setPage(1);
							}}
							aria-label='Khóa học'
						>
							<option value=''>Tất cả khóa học</option>
							{courses.map(([id, name]) => (
								<option key={id} value={id}>
									{name}
								</option>
							))}
						</select>
						{/* Phân ca phạm vi khoa: server chỉ trả học viên khoa mình ⇒ không cần lọc khoa */}
						{(departments.length > 1 || dept) && (
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
						)}
						<SearchInput value={search} onChange={setSearch} placeholder='Tìm theo tên, mã học viên...' />
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
					<span className={cx(styles.legendItem, styles.fromPattern)}>Mờ = theo mẫu tuần của khóa</span>
					<span className={styles.legendItem}>Ô trống = không có ca (điểm danh tự do)</span>
					<span className={styles.legendItem}>
						<span className={cx(styles.legendSwatch, styles.outside)} /> Ngoài thời gian khóa học
					</span>
					<span className={styles.legendItem}>· Bấm ô để chọn, Shift+bấm chọn vùng, bấm ngày/tên để chọn cả cột/hàng</span>
				</div>

				{cells.length > 0 && (
					<div className={styles.actionBar}>
						<span>
							Đã chọn <b>{cells.length}</b> ô{pg.pagination.totalPages > 1 ? ' (gồm cả các trang khác)' : ''}
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
					<EmptyState
						title={data.users.length ? 'Không có học viên phù hợp' : 'Không có học viên nào đang học trong tháng này'}
						desc={data.users.length ? undefined : 'Chỉ học viên đã được cấp tài khoản, có ghi danh đã duyệt vào khóa có thời gian học trong tháng mới hiện ở đây.'}
					/>
				) : (
					<div className={styles.gridWrap}>
						<table ref={gridRef} className={styles.grid}>
							<thead>
								<tr>
									<th className={styles.nameCell}>Học viên</th>
									{days.map((d) => {
										const wd = weekdayOf(d);
										return (
											<th
												key={d}
												scope='col'
												className={cx(wd >= 6 && styles.weekend, d === today && styles.today)}
											>
												<button
													type='button'
													className={styles.headBtn}
													onClick={() => toggleKeys(filtered.map((u) => key(u.id, d)))}
													title={`Chọn cả ngày ${d.split('-').reverse().join('/')} cho mọi học viên đang lọc`}
													aria-label={`Chọn cả ngày ${d.split('-').reverse().join('/')} cho mọi học viên đang lọc`}
												>
													<span className={styles.headLine}>{WEEKDAYS[wd - 1].label}</span>
													<span className={cx(styles.headLine, styles.dayNum)}>{Number(d.slice(8))}</span>
												</button>
											</th>
										);
									})}
								</tr>
							</thead>
							<tbody>
								{rows.map((u, row) => (
									<tr key={u.id}>
										<th scope='row' className={styles.nameCell}>
											<button
												type='button'
												className={styles.headBtn}
												onClick={() => toggleKeys(days.map((d) => key(u.id, d)))}
												title='Chọn cả tháng của học viên này'
												aria-label={`Chọn cả tháng của ${u.full_name}`}
											>
												<span className={cx(styles.headLine, styles.name)}>{u.full_name}</span>
												<span className={cx(styles.headLine, styles.sub)}>
													{u.trainee_id}
													{u.department_name ? ` · ${u.department_name}` : ''}
												</span>
											</button>
										</th>
										{days.map((d, col) => {
											const isStudying = studying(u, d);
											const isSelected = selected.has(key(u.id, d));
											return (
												<td
													key={d}
													className={cx(
														styles.cell,
														weekdayOf(d) >= 6 && styles.weekend,
														!isStudying && styles.outside,
														isSelected && styles.selected,
													)}
													title={cellTitle(u, d)}
												>
													{/* Ô ngoài thời gian khóa học không chọn được nên không có nút */}
													{isStudying ? (
														<button
															type='button'
															className={styles.cellBtn}
															data-r={row}
															data-c={col}
															tabIndex={roveCell && roveCell.row === row && roveCell.col === col ? 0 : -1}
															aria-pressed={isSelected}
															aria-label={`${u.full_name}, ngày ${d.split('-').reverse().join('/')}`}
															onFocus={() => setRove({ row, col })}
															onKeyDown={(e) => onCellKeyDown(e, row, col)}
															onClick={(e) => clickCell(row, col, e.shiftKey)}
														>
															{renderCell(u, d)}
														</button>
													) : (
														renderCell(u, d)
													)}
												</td>
											);
										})}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				<Pagination {...pg.pagination} itemLabel='học viên' />
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
