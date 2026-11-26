import { Badge, TableEmpty } from '@/shared/components';
import { SkeletonTable } from '@/shared/components/Loading';
import base from '@/shared/components/Table/CrudPage.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { showToast } from '@/shared/utils/feedback';
import { formatDateTimeVN } from '@/shared/utils/formatDate';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { attendanceDeviceApi } from '../api/attendanceDeviceApi';
import type { AttendanceDevice, CommandStatus, DeviceCommand } from '../types/attendanceDevice.type';
import { timesheetHref } from '../utils/labels';
import { COMMAND_STATUS, deviceLabel } from '../utils/labels';
import styles from '../pages/AttendanceDevices.module.css';

/** Kết quả lệnh "Kéo lại lượt chấm": máy đã gửi về bao nhiêu lượt + mở bảng công đúng khoảng ngày */
function AttlogResultLine({ cmd }: { cmd: DeviceCommand }) {
	const a = cmd.attlog!;
	const text =
		cmd.status === 'pending' || cmd.status === 'sent'
			? `Hệ thống đang có ${a.in_range} lượt của máy trong khoảng này`
			: cmd.status === 'done'
				? a.received
					? `Máy đã gửi về ${a.received} lượt mới · tổng ${a.in_range} lượt trong khoảng`
					: a.in_range
						? `Không có lượt mới (máy gửi lại lượt đã có) · tổng ${a.in_range} lượt trong khoảng`
						: 'Máy báo xong nhưng chưa gửi lượt nào — khoảng ngày không có lượt chấm, hoặc máy chưa gửi xong'
				: null;
	if (!text) return null;
	return (
		<div className={tbl.cellSub}>
			{text}
			{a.in_range > 0 && (
				<>
					{' · '}
					<Link
						to={timesheetHref(a.from, a.to, cmd.device_id)}
						className={styles.link}
					>
						Xem bảng công
					</Link>
				</>
			)}
		</div>
	);
}

export function CommandsPanel({ devices }: { devices: AttendanceDevice[] }) {
	const [deviceId, setDeviceId] = useState<number | ''>('');
	const [status, setStatus] = useState<CommandStatus | ''>('');
	const [refreshKey, setRefreshKey] = useState(0);
	const loadKey = JSON.stringify([deviceId, status]);
	const [data, setData] = useState<{ key: string; rows: DeviceCommand[] } | null>(null);
	const rows = data?.rows ?? [];
	const loading = data?.key !== loadKey;

	useRealtimeUpdate('attendance_device', () => setRefreshKey((k) => k + 1));

	useEffect(() => {
		let alive = true;
		attendanceDeviceApi
			.commands({ device_id: deviceId, status })
			.then((r) => alive && setData({ key: loadKey, rows: r }))
			.catch(() => {
				if (!alive) return;
				showToast('error', 'Không tải được lệnh đồng bộ');
				setData({ key: loadKey, rows: [] });
			});
		return () => {
			alive = false;
		};
	}, [deviceId, status, refreshKey, loadKey]);

	return (
		<>
			<div className={styles.filterBar}>
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
				<select
					className={base.pageSizeSelect}
					value={status}
					onChange={(e) => setStatus(e.target.value as CommandStatus | '')}
					aria-label='Lọc theo trạng thái'
				>
					<option value=''>Mọi trạng thái</option>
					{(Object.keys(COMMAND_STATUS) as CommandStatus[]).map((s) => (
						<option
							key={s}
							value={s}
						>
							{COMMAND_STATUS[s].label}
						</option>
					))}
				</select>
				<span className={`${base.descText} ${styles.pushRight}`}>
					Máy tự hỏi lệnh khoảng 10–30 giây một lần khi đang kết nối.
				</span>
			</div>
			<div className={base.tableWrap}>
				<table className={base.table}>
					<thead>
						<tr>
							<th className={base.th}>Lệnh</th>
							<th className={base.th}>Máy</th>
							<th className={base.th}>Trạng thái</th>
							<th className={base.th}>Tạo lúc</th>
							<th className={base.th}>Máy báo xong</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={6}
								cols={5}
							/>
						) : rows.length === 0 ? (
							<TableEmpty
								colSpan={5}
								title='Chưa có lệnh nào'
								desc='Lệnh được tạo khi duyệt máy, khi học viên vào/ra khóa học hoặc khi có vân tay mới.'
							/>
						) : (
							rows.map((c) => {
								const st = COMMAND_STATUS[c.status];
								return (
									<tr
										key={c.id}
										className={base.tr}
									>
										<td className={base.td}>
											<div>{c.summary}</div>
											{c.trainee_name && <div className={tbl.cellSub}>{c.trainee_name}</div>}
											{c.attlog && <AttlogResultLine cmd={c} />}
										</td>
										<td className={base.td}>
											<span className={base.descText}>{c.device_name}</span>
										</td>
										<td className={base.td}>
											<Badge tone={st.tone}>{st.label}</Badge>
											{c.status === 'failed' && c.return_code !== null && (
												<div className={tbl.cellSub}>
													Mã lỗi {c.return_code} · thử {c.attempts} lần
												</div>
											)}
										</td>
										<td className={`${base.td} ${styles.nowrap}`}>{formatDateTimeVN(c.created_at)}</td>
										<td className={`${base.td} ${styles.nowrap}`}>
											{c.done_at ? formatDateTimeVN(c.done_at) : '—'}
										</td>
									</tr>
								);
							})
						)}
					</tbody>
				</table>
			</div>
		</>
	);
}
