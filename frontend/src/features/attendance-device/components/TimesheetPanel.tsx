import { DownloadSvg, SearchSvg } from '@/assets/icons';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Button, DatePicker, TableEmpty } from '@/shared/components';
import { SkeletonTable } from '@/shared/components/Loading';
import base from '@/shared/components/Table/CrudPage.module.css';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN, toIsoDate } from '@/shared/utils/formatDate';
import { saveBlob } from '@/shared/utils/saveBlob';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { attendanceDeviceApi } from '../api/attendanceDeviceApi';
import type { AttendanceDevice, Timesheet } from '../types/attendanceDevice.type';
import { deviceLabel } from '../utils/labels';
import styles from '../pages/AttendanceDevices.module.css';

const MAX_DAYS = 93;
const DAY_MS = 24 * 3600 * 1000;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

const addDays = (iso: string, n: number) => toIsoDate(new Date(Date.parse(`${iso}T00:00:00`) + n * DAY_MS));
const spanDays = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
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
		setParams(
			{ from: f, to: t, ...(d ? { device: String(d) } : {}) },
			{ replace: true },
		);
	};

	const preset: Preset | null =
		to !== today ? null : from === today ? 'today' : from === addDays(today, -6) ? 'week' : from === `${today.slice(0, 8)}01` ? 'month' : null;
	const PRESETS: { key: Preset; label: string; from: string }[] = [
		{ key: 'today', label: 'Hôm nay', from: today },
		{ key: 'week', label: '7 ngày', from: addDays(today, -6) },
		{ key: 'month', label: 'Tháng này', from: `${today.slice(0, 8)}01` },
	];

	const [search, setSearch] = useState('');
	const [refreshKey, setRefreshKey] = useState(0);
	const loadKey = JSON.stringify([from, to, deviceId]);
	const [data, setData] = useState<{ key: string; sheet: Timesheet | null } | null>(null);
	const loading = !tooLong && data?.key !== loadKey;
	const sheet = data?.key === loadKey ? data.sheet : null;
	const [exporting, setExporting] = useState(false);

	// Máy gửi lượt chấm lên (kể cả khi kéo lại) ⇒ bảng tự cập nhật
	useRealtimeUpdate('attendance_punch', () => setRefreshKey((k) => k + 1));

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

	const rows = useMemo(() => {
		const all = sheet?.rows ?? [];
		const q = norm(search.trim());
		if (!q) return all;
		return all.filter((r) => norm(`${r.trainee_name ?? ''} ${r.trainee_id ?? ''} ${r.pin}`).includes(q));
	}, [sheet, search]);
	const pg = useClientPaging(rows, 50);

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
					title='Tải file Excel: Tổng hợp theo người · Bảng công theo ngày · Chi tiết lượt chấm'
				>
					Xuất Excel
				</Button>
			</div>

			<p
				className={styles.timesheetSummary}
				aria-live='polite'
			>
				{tooLong ? (
					`Chỉ xem tối đa ${MAX_DAYS} ngày một lần — thu hẹp khoảng ngày.`
				) : loading || !s ? (
					`Đang tải bảng công ${rangeLabel}…`
				) : s.punches === 0 ? (
					`Chưa có lượt chấm nào ${rangeLabel}.`
				) : (
					<>
						<strong>{s.punches}</strong> lượt chấm · <strong>{s.people}</strong> người ·{' '}
						{from === to ? (
							rangeLabel
						) : (
							<>
								<strong>{s.days}</strong> ngày có chấm ({rangeLabel})
							</>
						)}
						{s.unknown_pins > 0 && (
							<>
								{' '}
								· <strong>{s.unknown_pins}</strong> mã trên máy không khớp học viên
							</>
						)}
					</>
				)}
			</p>

			<div className={base.tableWrap}>
				<table className={base.table}>
					<thead>
						<tr>
							<th className={base.th}>Ngày</th>
							<th className={base.th}>Học viên</th>
							<th className={base.th}>Mã trên máy</th>
							<th className={base.th}>Giờ vào</th>
							<th className={base.th}>Giờ ra</th>
							<th className={base.th}>Số lượt</th>
							<th className={base.th}>Khóa học đã ghép</th>
							<th className={base.th}>Máy</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={6}
								cols={8}
							/>
						) : rows.length === 0 ? (
							<TableEmpty
								colSpan={8}
								title={search ? 'Không tìm thấy học viên' : 'Chưa có lượt chấm'}
								desc={
									search
										? 'Thử tìm bằng mã học viên hoặc mã trên máy.'
										: 'Máy gửi lượt chấm lên là bảng tự cập nhật. Thiếu lượt thì dùng nút "Kéo lại lượt chấm" ở trang Máy chấm công.'
								}
							/>
						) : (
							pg.paged.map((r) => {
								const hasOut = r.punch_count > 1;
								return (
									<tr
										key={`${r.work_date}|${r.pin}`}
										className={base.tr}
									>
										<td className={`${base.td} ${styles.nowrap}`}>
											{formatDateVN(r.work_date)}
											<div className={tbl.cellSub}>{weekday(r.work_date)}</div>
										</td>
										<td className={`${base.td} ${styles.personCell}`}>
											{r.trainee_name ?? <span className={base.descText}>Không khớp học viên</span>}
											{r.trainee_id && <div className={tbl.cellSub}>{r.trainee_id}</div>}
										</td>
										<td className={`${base.td} ${styles.mono}`}>{r.pin}</td>
										<td className={`${base.td} ${styles.nowrap}`}>
											<strong>{r.first_time.slice(0, 5)}</strong>
										</td>
										<td className={`${base.td} ${styles.nowrap}`}>
											{hasOut ? (
												<>
													<strong>{r.last_time.slice(0, 5)}</strong>
													<div className={tbl.cellSub}>{spanText(r.span_minutes)}</div>
												</>
											) : (
												<span
													className={base.descText}
													title='Chỉ chấm 1 lần trong ngày'
												>
													—
												</span>
											)}
										</td>
										<td className={`${base.td} ${styles.nowrap}`}>
											{r.punch_count}
											{r.punch_count > 2 && <div className={tbl.cellSub}>{r.times}</div>}
										</td>
										<td className={base.td}>
											{r.courses ?? <span className={base.descText}>—</span>}
										</td>
										<td className={base.td}>
											<span className={base.descText}>{r.devices}</span>
										</td>
									</tr>
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
