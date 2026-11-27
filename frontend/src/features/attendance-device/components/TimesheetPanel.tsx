import { DownloadSvg, SearchSvg } from '@/assets/icons';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Badge, Button, DatePicker, TableEmpty } from '@/shared/components';
import { SkeletonTable } from '@/shared/components/Loading';
import base from '@/shared/components/Table/CrudPage.module.css';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN, toIsoDate } from '@/shared/utils/formatDate';
import { saveBlob } from '@/shared/utils/saveBlob';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { attendanceDeviceApi } from '../api/attendanceDeviceApi';
import type { AttendanceDevice, Timesheet, TimesheetRow, TimesheetShift } from '../types/attendanceDevice.type';
import { deviceLabel } from '../utils/labels';
import styles from '../pages/AttendanceDevices.module.css';

const MAX_DAYS = 93;
const DAY_MS = 24 * 3600 * 1000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
// Chấm lại trong vài phút sau lượt đầu = chấm lặp, chưa phải giờ ra
// (backend utils/attendanceShift.REPEAT_PUNCH_MIN)
const REPEAT_PUNCH_MIN = 5;
// Số giờ chấm hiện sẵn trong 1 dòng; còn lại bấm "+N" để mở
const TIMES_SHOWN = 6;

const addDays = (iso: string, n: number) => toIsoDate(new Date(Date.parse(`${iso}T00:00:00`) + n * DAY_MS));
const spanDays = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const WEEKDAY = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const weekday = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00`).getDay()];

/** 553 → "9 giờ 13 phút" */
const spanText = (min: number) => {
	if (min < 1) return '';
	const h = Math.floor(min / 60);
	const m = min % 60;
	return h ? `${h} giờ ${String(m).padStart(2, '0')} phút` : `${m} phút`;
};

const norm = (s: string) =>
	s
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/đ/gi, 'd')
		.toLowerCase();

const hasOut = (r: TimesheetRow) => r.span_minutes >= REPEAT_PUNCH_MIN;

/** "09:15 · 09:15 · 09:15 · 09:22" → [{ t: '09:15', n: 3 }, { t: '09:22', n: 1 }] */
const groupTimes = (times: string) => {
	const out: { t: string; n: number }[] = [];
	for (const t of times.split(' · ').filter(Boolean)) {
		const last = out[out.length - 1];
		if (last?.t === t) last.n += 1;
		else out.push({ t, n: 1 });
	}
	return out;
};

type Issue = 'late' | 'early' | 'no_out' | 'unknown';
const ISSUES: { key: Issue; label: string }[] = [
	{ key: 'late', label: 'Đi muộn' },
	{ key: 'early', label: 'Về sớm' },
	{ key: 'no_out', label: 'Chưa chấm ra' },
	{ key: 'unknown', label: 'Mã không khớp học viên' },
];
const hasIssue = (r: TimesheetRow, k: Issue, today: string) => {
	if (k === 'unknown') return !r.trainee_id;
	if (k === 'late') return r.shifts.some((s) => !!s.late_min);
	if (k === 'early') return r.shifts.some((s) => !!s.early_min);
	// Có ca: hết ca chưa chấm ra. Không có ca: ngày đã qua mà chỉ chấm 1 lần / chấm lặp
	return r.shifts.length ? r.shifts.some((s) => s.missing_out) : !!r.trainee_id && !hasOut(r) && r.work_date < today;
};

function ShiftStatus({ s }: { s: TimesheetShift }) {
	if (s.late_min || s.early_min || s.missing_out)
		return (
			<span className={styles.badgeRow}>
				{!!s.late_min && <Badge tone='amber'>Muộn {s.late_min}′</Badge>}
				{!!s.early_min && <Badge tone='amber'>Sớm {s.early_min}′</Badge>}
				{s.missing_out && <Badge tone='red'>Chưa chấm ra</Badge>}
			</span>
		);
	if (!s.check_out) return <Badge tone='gray'>Đang trong ca</Badge>;
	return <Badge tone='green'>{s.shift_id != null ? 'Đúng giờ' : 'Đủ vào, ra'}</Badge>;
}

type Preset = 'today' | 'week' | 'month';

export function TimesheetPanel({ devices }: { devices: AttendanceDevice[] }) {
	const today = toIsoDate(new Date());
	const [params, setParams] = useSearchParams();
	// Khoảng ngày nằm trên URL ⇒ lệnh "Kéo lại lượt chấm" mở thẳng đúng ngày
	const pFrom = params.get('from') ?? '';
	const pTo = params.get('to') ?? '';
	const from = ISO_RE.test(pFrom) ? pFrom : today;
	const to = ISO_RE.test(pTo) && pTo >= from ? pTo : from > today ? from : today;
	const deviceId = Number(params.get('device')) || '';
	const tooLong = spanDays(from, to) >= MAX_DAYS;

	const setFilter = (next: { from?: string; to?: string; device?: number | '' }) => {
		const f = next.from ?? from;
		let t = next.to ?? to;
		if (t < f) t = f;
		const d = next.device !== undefined ? next.device : deviceId;
		setParams({ from: f, to: t, ...(d ? { device: String(d) } : {}) }, { replace: true });
	};

	const preset: Preset | null =
		to !== today ? null : from === today ? 'today' : from === addDays(today, -6) ? 'week' : from === `${today.slice(0, 8)}01` ? 'month' : null;
	const PRESETS: { key: Preset; label: string; from: string }[] = [
		{ key: 'today', label: 'Hôm nay', from: today },
		{ key: 'week', label: '7 ngày', from: addDays(today, -6) },
		{ key: 'month', label: 'Tháng này', from: `${today.slice(0, 8)}01` },
	];

	const [search, setSearch] = useState('');
	const [issue, setIssue] = useState<Issue | ''>('');
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
	const [refreshKey, setRefreshKey] = useState(0);
	const loadKey = JSON.stringify([from, to, deviceId]);
	const [data, setData] = useState<{ key: string; sheet: Timesheet | null } | null>(null);
	const loading = !tooLong && data?.key !== loadKey;
	const sheet = data?.key === loadKey ? data.sheet : null;
	const [exporting, setExporting] = useState(false);

	// Máy gửi lượt chấm lên (kể cả khi kéo lại) ⇒ bảng tự cập nhật; điểm danh ca ghi xong cũng vậy
	useRealtimeUpdate(['attendance_punch', 'staff_attendance'], () => setRefreshKey((k) => k + 1));

	useEffect(() => {
		if (tooLong) return;
		let alive = true;
		attendanceDeviceApi
			.timesheet({ from, to, device_id: deviceId })
			.then((r) => alive && setData({ key: loadKey, sheet: r }))
			.catch((e) => {
				if (!alive) return;
				showToast('error', e instanceof Error ? e.message : 'Không tải được bảng công');
				setData({ key: loadKey, sheet: null });
			});
		return () => {
			alive = false;
		};
	}, [from, to, deviceId, refreshKey, loadKey, tooLong]);

	const all = useMemo(() => (sheet?.rows ?? []).map((r) => ({ ...r, shifts: r.shifts ?? [] })), [sheet]);
	// Không bọc useMemo: phụ thuộc `today` (tính mỗi lần render) — React Compiler tự ghi nhớ
	const issueCounts: Record<Issue, number> = { late: 0, early: 0, no_out: 0, unknown: 0 };
	for (const r of all) for (const i of ISSUES) if (hasIssue(r, i.key, today)) issueCounts[i.key] += 1;
	const q = norm(search.trim());
	const rows = all.filter(
		(r) =>
			(!issue || hasIssue(r, issue, today)) &&
			(!q || norm(`${r.trainee_name ?? ''} ${r.trainee_id ?? ''} ${r.pin}`).includes(q)),
	);
	// Số người / lượt của từng ngày (theo bộ lọc) cho dòng tiêu đề ngày
	const dayTotals = new Map<string, { people: number; punches: number }>();
	for (const r of rows) {
		const d = dayTotals.get(r.work_date) ?? { people: 0, punches: 0 };
		d.people += 1;
		d.punches += r.punch_count;
		dayTotals.set(r.work_date, d);
	}
	const showShifts = all.some((r) => r.shifts.length > 0);
	const colCount = showShifts ? 6 : 5;
	const pg = useClientPaging(rows, 50);

	const pickIssue = (k: Issue | '') => {
		setIssue(k);
		pg.setPage(1);
	};

	const exportExcel = async () => {
		setExporting(true);
		try {
			const blob = await attendanceDeviceApi.exportTimesheet({ from, to, device_id: deviceId });
			saveBlob(blob, from === to ? `bang-cong-${from}.xlsx` : `bang-cong-${from}-den-${to}.xlsx`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	const s = sheet?.summary;
	const rangeLabel = from === to ? `ngày ${formatDateVN(from)}` : `${formatDateVN(from)} – ${formatDateVN(to)}`;
	const anyIssue = ISSUES.some((i) => issueCounts[i.key] > 0);

	const renderRow = (r: TimesheetRow) => {
		const key = `${r.work_date}|${r.pin}`;
		const out = hasOut(r);
		const groups = groupTimes(r.times);
		const open = expanded.has(key);
		const shown = open ? groups : groups.slice(0, TIMES_SHOWN);
		return (
			<tr
				key={key}
				className={base.tr}
			>
				<td className={`${base.td} ${styles.personCell}`}>
					{r.trainee_name ? (
						<>
							<div className={tbl.cellTitle}>{r.trainee_name}</div>
							<div className={tbl.cellSub}>{r.trainee_id}</div>
						</>
					) : (
						<>
							<div className={tbl.cellTitle}>
								Mã máy <span className={styles.mono}>{r.pin}</span>
							</div>
							<div
								className={styles.warnText}
								title='Mã trên máy phải là mã học viên bỏ chữ HV (HV20260123 → 20260123). Sửa hoặc xóa người dùng này trên máy.'
							>
								Không khớp học viên
							</div>
						</>
					)}
				</td>
				{showShifts && (
					<td className={`${base.td} ${styles.shiftCell}`}>
						{r.shifts.length ? (
							<ul className={styles.shiftList}>
								{r.shifts.map((sh) => (
									<li key={`${sh.shift_id ?? 'free'}`}>
										<div className={styles.shiftHead}>
											<span className={styles.shiftName}>{sh.shift_name ?? 'Tự do'}</span>
											{sh.shift_start && (
												<span className={styles.shiftTime}>
													{sh.shift_start}–{sh.shift_end}
												</span>
											)}
										</div>
										<ShiftStatus s={sh} />
									</li>
								))}
							</ul>
						) : (
							<span className={base.descText}>—</span>
						)}
					</td>
				)}
				<td className={`${base.td} ${styles.timeCell}`}>
					<span className={styles.timeBig}>{r.first_time.slice(0, 5)}</span>
				</td>
				<td className={`${base.td} ${styles.timeCell}`}>
					{out ? (
						<>
							<span className={styles.timeBig}>{r.last_time.slice(0, 5)}</span>
							<div className={tbl.cellSub}>{spanText(r.span_minutes)}</div>
						</>
					) : (
						<>
							<span className={styles.timeNone}>—</span>
							<div className={tbl.cellSub}>{r.punch_count > 1 ? 'Chỉ chấm lặp' : 'Chấm 1 lần'}</div>
						</>
					)}
				</td>
				<td className={`${base.td} ${styles.punchCell}`}>
					<div className={styles.punchCount}>{r.punch_count} lượt</div>
					{r.punch_count > 1 && (
						<div className={styles.chips}>
							{shown.map((g, i) => (
								<span
									key={`${g.t}-${i}`}
									className={styles.chip}
									title={g.n > 1 ? `Chấm ${g.n} lần lúc ${g.t}` : undefined}
								>
									{g.t}
									{g.n > 1 && <span className={styles.chipTimes}>×{g.n}</span>}
								</span>
							))}
							{groups.length > TIMES_SHOWN && (
								<button
									type='button'
									className={styles.chipMore}
									aria-expanded={open}
									onClick={() =>
										setExpanded((prev) => {
											const next = new Set(prev);
											if (open) next.delete(key);
											else next.add(key);
											return next;
										})
									}
								>
									{open ? 'Thu gọn' : `+${groups.length - TIMES_SHOWN}`}
								</button>
							)}
						</div>
					)}
				</td>
				<td className={`${base.td} ${styles.courseCell}`}>
					{r.courses ? <div>{r.courses}</div> : <div className={base.descText}>Chưa ghép buổi học</div>}
					<div className={tbl.cellSub}>{r.devices}</div>
				</td>
			</tr>
		);
	};

	return (
		<>
			<div className={styles.filterBar}>
				<div
					className={styles.segment}
					role='group'
					aria-label='Chọn nhanh khoảng ngày'
				>
					{PRESETS.map((p) => (
						<button
							key={p.key}
							aria-pressed={preset === p.key}
							className={preset === p.key ? styles.segmentActive : styles.segmentBtn}
							onClick={() => setFilter({ from: p.from, to: today })}
						>
							{p.label}
						</button>
					))}
				</div>
				<DatePicker
					value={from}
					max={to}
					// Xóa ngày ⇒ xem 1 ngày (ngày còn lại)
					onChange={(v) => setFilter({ from: v || to })}
					placeholder='Từ ngày'
					aria-label='Từ ngày'
					className={styles.dateFilter}
				/>
				<DatePicker
					value={to}
					min={from}
					onChange={(v) => setFilter({ to: v || from })}
					placeholder='Đến ngày'
					aria-label='Đến ngày'
					className={styles.dateFilter}
				/>
				<select
					className={base.pageSizeSelect}
					value={deviceId}
					onChange={(e) => setFilter({ device: e.target.value ? Number(e.target.value) : '' })}
					aria-label='Lọc theo máy'
				>
					<option value=''>Tất cả máy</option>
					{devices.map((d) => (
						<option
							key={d.id}
							value={d.id}
						>
							{deviceLabel(d)}
						</option>
					))}
				</select>
				<div className={`${base.searchBox} ${styles.timesheetSearch}`}>
					<SearchSvg className={base.searchIcon} />
					<input
						className={base.searchInput}
						aria-label='Tìm theo tên, mã học viên hoặc mã trên máy'
						placeholder='Tìm tên, mã học viên...'
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							pg.setPage(1);
						}}
					/>
				</div>
				<Button
					variant='secondary'
					size='sm'
					icon={<DownloadSvg />}
					loading={exporting}
					disabled={tooLong || loading || !s?.punches}
					onClick={exportExcel}
					className={styles.pushRight}
					title='Tải file Excel: Tổng hợp theo người · Bảng công theo ngày (kèm điểm danh theo ca) · Chi tiết lượt chấm'
				>
					Xuất Excel
				</Button>
			</div>

			<div
				className={styles.timesheetSummary}
				aria-live='polite'
			>
				<p className={styles.summaryText}>
					{tooLong ? (
						`Chỉ xem tối đa ${MAX_DAYS} ngày một lần — thu hẹp khoảng ngày.`
					) : loading || !s ? (
						`Đang tải bảng công ${rangeLabel}…`
					) : s.punches === 0 ? (
						`Chưa có lượt chấm nào ${rangeLabel}.`
					) : (
						<>
							<strong>{s.punches}</strong> lượt chấm · <strong>{s.people}</strong> người
							{from !== to && (
								<>
									{' '}
									· <strong>{s.days}</strong> ngày có chấm
								</>
							)}
						</>
					)}
				</p>
				{!loading && anyIssue && (
					<div
						className={styles.issueChips}
						role='group'
						aria-label='Lọc dòng cần xem lại'
					>
						{issue && (
							<button
								type='button'
								className={styles.issueChip}
								onClick={() => pickIssue('')}
							>
								Tất cả
							</button>
						)}
						{ISSUES.filter((i) => issueCounts[i.key] > 0).map((i) => (
							<button
								key={i.key}
								type='button'
								aria-pressed={issue === i.key}
								className={issue === i.key ? styles.issueChipActive : styles.issueChip}
								onClick={() => pickIssue(issue === i.key ? '' : i.key)}
							>
								{i.label} <span className={styles.issueCount}>{issueCounts[i.key]}</span>
							</button>
						))}
					</div>
				)}
			</div>

			<div className={base.tableWrap}>
				<table className={`${base.table} ${styles.timesheetTable}`}>
					<thead>
						<tr>
							<th className={base.th}>Học viên</th>
							{showShifts && <th className={base.th}>Ca</th>}
							<th className={base.th}>Vào</th>
							<th className={base.th}>Ra</th>
							<th className={base.th}>Lượt chấm</th>
							<th className={base.th}>Khóa học · máy</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={6}
								cols={colCount}
							/>
						) : rows.length === 0 ? (
							<TableEmpty
								colSpan={colCount}
								title={search || issue ? 'Không có dòng phù hợp' : 'Chưa có lượt chấm'}
								desc={
									search || issue
										? 'Thử tìm bằng mã học viên hoặc mã trên máy, hoặc bỏ bộ lọc.'
										: 'Máy gửi lượt chấm lên là bảng tự cập nhật. Thiếu lượt thì dùng nút "Kéo lại lượt chấm" ở trang Máy chấm công.'
								}
							/>
						) : (
							pg.paged.map((r, i) => {
								const prev = pg.paged[i - 1];
								const total = dayTotals.get(r.work_date);
								return (
									<Fragment key={`${r.work_date}|${r.pin}`}>
										{prev?.work_date !== r.work_date && (
											<tr className={styles.dayRow}>
												<th
													colSpan={colCount}
													scope='colgroup'
												>
													<span className={styles.dayName}>
														{weekday(r.work_date)}, {formatDateVN(r.work_date)}
													</span>
													{total && (
														<span className={styles.dayMeta}>
															{total.people} người · {total.punches} lượt
														</span>
													)}
												</th>
											</tr>
										)}
										{renderRow(r)}
									</Fragment>
								);
							})
						)}
					</tbody>
				</table>
			</div>
			{!loading && rows.length > 0 && (
				<Pagination
					{...pg.pagination}
					itemLabel='dòng'
				/>
			)}
			{sheet?.truncated && (
				<p className={styles.footNote}>
					Chỉ hiện 5.000 dòng đầu — thu hẹp khoảng ngày hoặc chọn một máy. File Excel cũng giới hạn như vậy.
				</p>
			)}
		</>
	);
}
