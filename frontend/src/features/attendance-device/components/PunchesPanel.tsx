import { RefreshSvg } from '@/assets/icons';
import { Badge, Button, DatePicker, TableEmpty } from '@/shared/components';
import { SkeletonTable } from '@/shared/components/Loading';
import base from '@/shared/components/Table/CrudPage.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { showToast } from '@/shared/utils/feedback';
import { formatDateTimeVN, formatDateVN } from '@/shared/utils/formatDate';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { attendanceDeviceApi } from '../api/attendanceDeviceApi';
import type { AttendanceDevice, DevicePunch, PunchFilter } from '../types/attendanceDevice.type';
import { PUNCH_STATUS, deviceLabel } from '../utils/labels';
import styles from '../pages/AttendanceDevices.module.css';

const FILTERS: { key: PunchFilter; label: string }[] = [
	{ key: 'unmatched', label: 'Chưa khớp' },
	{ key: 'matched', label: 'Đã ghép' },
	{ key: 'skipped', label: 'Bỏ qua' },
	{ key: 'all', label: 'Tất cả' },
];

export function PunchesPanel({
	devices,
	canManage,
}: {
	devices: AttendanceDevice[];
	canManage: boolean;
}) {
	const [status, setStatus] = useState<PunchFilter>('unmatched');
	const [deviceId, setDeviceId] = useState<number | ''>('');
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [refreshKey, setRefreshKey] = useState(0);
	// Kết quả gắn với bộ lọc đã tải — đổi bộ lọc là "đang tải" cho tới khi có kết quả mới
	const loadKey = JSON.stringify([status, deviceId, from, to]);
	const [data, setData] = useState<{ key: string; rows: DevicePunch[] } | null>(null);
	const rows = data?.rows ?? [];
	const loading = data?.key !== loadKey;
	const [rematching, setRematching] = useState(false);

	useRealtimeUpdate('attendance_punch', () => setRefreshKey((k) => k + 1));

	useEffect(() => {
		let alive = true;
		attendanceDeviceApi
			.punches({ status, device_id: deviceId, from, to })
			.then((r) => alive && setData({ key: loadKey, rows: r }))
			.catch(() => {
				if (!alive) return;
				showToast('error', 'Không tải được lượt chấm');
				setData({ key: loadKey, rows: [] });
			});
		return () => {
			alive = false;
		};
	}, [status, deviceId, from, to, refreshKey, loadKey]);

	const rematch = async () => {
		setRematching(true);
		try {
			const r = await attendanceDeviceApi.rematch(7);
			showToast(
				r.matched ? 'success' : 'info',
				r.matched
					? `Đã ghép thêm ${r.matched}/${r.total} lượt chấm`
					: `Chưa ghép thêm được lượt nào (${r.total} lượt chưa khớp trong 7 ngày)`,
			);
			setRefreshKey((k) => k + 1);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Ghép lại thất bại');
		} finally {
			setRematching(false);
		}
	};

	return (
		<>
			<div className={styles.filterBar}>
				<div
					className={styles.segment}
					role='tablist'
					aria-label='Lọc theo kết quả ghép'
				>
					{FILTERS.map((f) => (
						<button
							key={f.key}
							role='tab'
							aria-selected={status === f.key}
							className={status === f.key ? styles.segmentActive : styles.segmentBtn}
							onClick={() => setStatus(f.key)}
						>
							{f.label}
						</button>
					))}
				</div>
				<select
					className={base.pageSizeSelect}
					value={deviceId}
					onChange={(e) => setDeviceId(e.target.value ? Number(e.target.value) : '')}
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
				<DatePicker
					value={from}
					max={to || undefined}
					onChange={setFrom}
					placeholder='Từ ngày'
					className={styles.dateFilter}
				/>
				<DatePicker
					value={to}
					min={from || undefined}
					onChange={setTo}
					placeholder='Đến ngày'
					className={styles.dateFilter}
				/>
				{canManage && (
					<Button
						variant='secondary'
						size='sm'
						icon={<RefreshSvg />}
						loading={rematching}
						onClick={rematch}
						className={styles.pushRight}
						title='Ghép lại các lượt chưa khớp 7 ngày gần nhất (sau khi thêm buổi học hoặc duyệt ghi danh)'
					>
						Ghép lại
					</Button>
				)}
			</div>

			<div className={base.tableWrap}>
				<table className={base.table}>
					<thead>
						<tr>
							<th className={base.th}>Giờ chấm</th>
							<th className={base.th}>Mã trên máy</th>
							<th className={base.th}>Học viên</th>
							<th className={base.th}>Buổi học</th>
							<th className={base.th}>Kết quả</th>
							<th className={base.th}>Máy</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={6}
								cols={6}
							/>
						) : rows.length === 0 ? (
							<TableEmpty
								colSpan={6}
								title={status === 'unmatched' ? 'Không có lượt chấm nào chưa khớp' : 'Không có lượt chấm'}
								desc={
									status === 'unmatched'
										? 'Mọi lượt chấm đều đã được ghép vào buổi học.'
										: 'Thử đổi bộ lọc hoặc khoảng ngày.'
								}
							/>
						) : (
							rows.map((p) => {
								const st = PUNCH_STATUS[p.match_status];
								return (
									<tr
										key={p.id}
										className={base.tr}
									>
										<td className={`${base.td} ${styles.nowrap}`}>{formatDateTimeVN(p.punched_at)}</td>
										<td className={`${base.td} ${styles.mono}`}>{p.pin}</td>
										<td className={base.td}>
											{p.trainee_name ?? <span className={base.descText}>—</span>}
											{p.trainee_id && <div className={tbl.cellSub}>{p.trainee_id}</div>}
										</td>
										<td className={base.td}>
											{p.session_id && p.course_id ? (
												<>
													<Link
														to={`/admin/courses/${encodeURIComponent(p.course_id)}?tab=sessions`}
														className={styles.link}
													>
														{p.course_name}
													</Link>
													<div className={tbl.cellSub}>
														{formatDateVN(p.session_date)} · {p.start_time}
														{p.end_time ? `–${p.end_time}` : ''}
													</div>
												</>
											) : (
												<span className={base.descText}>—</span>
											)}
										</td>
										<td className={base.td}>
											<Badge
												tone={st.tone}
												title={st.hint}
											>
												{st.label}
											</Badge>
										</td>
										<td className={base.td}>
											<span className={base.descText}>{p.device_name}</span>
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
			{rows.length >= 500 && (
				<p className={styles.footNote}>Chỉ hiện 500 lượt gần nhất — thu hẹp khoảng ngày để xem thêm.</p>
			)}
		</>
	);
}
