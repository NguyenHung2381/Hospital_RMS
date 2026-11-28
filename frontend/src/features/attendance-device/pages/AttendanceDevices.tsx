import { FingerprintSvg, RefreshSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Button } from '@/shared/components';
import base from '@/shared/components/Table/CrudPage.module.css';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { attendanceDeviceApi } from '../api/attendanceDeviceApi';
import { CommandsPanel } from '../components/CommandsPanel';
import { DevicesPanel } from '../components/DevicesPanel';
import { PunchesPanel } from '../components/PunchesPanel';
import type { AttendanceDevice } from '../types/attendanceDevice.type';
import styles from './AttendanceDevices.module.css';

type Tab = 'devices' | 'punches' | 'commands';
const TABS: { key: Tab; label: string }[] = [
	{ key: 'devices', label: 'Máy chấm công' },
	{ key: 'punches', label: 'Lượt chấm' },
	{ key: 'commands', label: 'Lệnh đồng bộ' },
];

/** Hướng dẫn cài máy — địa chỉ lấy theo chính trang đang mở */
function SetupGuide({ open }: { open: boolean }) {
	const host = window.location.hostname;
	const https = window.location.protocol === 'https:';
	return (
		<details
			className={styles.guide}
			open={open}
		>
			<summary className={styles.guideSummary}>Hướng dẫn cài máy chấm công</summary>
			<div className={styles.guideBody}>
				<p>
					Trên máy: <strong>Menu → Truyền thông (COMM) → Cài đặt máy chủ đám mây</strong>
				</p>
				<dl className={styles.guideList}>
					<dt>Kiểu máy chủ</dt>
					<dd>Tự động tải dữ liệu</dd>
					<dt>Khởi động tên miền</dt>
					<dd>ON</dd>
					<dt>Địa chỉ máy chủ</dt>
					<dd>
						<code>{host}</code>
					</dd>
					<dt>HTTPS</dt>
					<dd>{https ? 'ON (cổng 443 nếu máy hỏi)' : 'OFF'}</dd>
					<dt>Cho phép máy chủ ủy nhiệm</dt>
					<dd>OFF</dd>
				</dl>
				<p>
					Ở mục <strong>Mạng</strong> của máy phải có <strong>Gateway</strong> và{' '}
					<strong>DNS</strong> (lấy giống một máy tính cùng mạng — lệnh <code>ipconfig /all</code>).
					Máy kết nối được sẽ hiện ở bảng trên với trạng thái <strong>Chờ duyệt</strong>.
				</p>
				<p>
					<strong>Mã người dùng trên máy</strong> là mã học viên bỏ chữ HV (HV20260123 →{' '}
					<code>20260123</code>). Học viên đang học được hệ thống tự gửi xuống máy; học viên chỉ
					cần đăng ký vân tay một lần ở một máy, hệ thống chép sang máy còn lại.
				</p>
			</div>
		</details>
	);
}

export default function AttendanceDevices() {
	const { has } = usePermission();
	const canManage = has('attendance_devices:manage');
	const [params, setParams] = useSearchParams();
	const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'devices') as Tab;

	const [devices, setDevices] = useState<AttendanceDevice[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshKey, setRefreshKey] = useState(0);
	const [syncing, setSyncing] = useState(false);
	const reload = () => setRefreshKey((k) => k + 1);

	useRealtimeUpdate(['attendance_device', 'attendance_punch'], reload);

	// Trạng thái "đang kết nối" tính theo giờ hiện tại ⇒ vẽ lại mỗi phút
	useEffect(() => {
		const t = setInterval(reload, 60_000);
		return () => clearInterval(t);
	}, []);

	useEffect(() => {
		attendanceDeviceApi
			.list()
			.then(setDevices)
			.catch(() => showToast('error', 'Không tải được danh sách máy chấm công'))
			.finally(() => setLoading(false));
	}, [refreshKey]);

	const pendingCount = devices.filter((d) => d.status === 'pending').length;

	const syncAll = async () => {
		setSyncing(true);
		try {
			const r = await attendanceDeviceApi.syncAll();
			showToast(
				'success',
				r.queued ? `Đã xếp ${r.queued} lệnh, máy sẽ nhận trong ít phút` : 'Máy chấm công đã đủ học viên',
			);
			reload();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Đồng bộ thất bại');
		} finally {
			setSyncing(false);
		}
	};

	return (
		<AdminLayout
			pageTitle='Máy chấm công'
			pageSubtitle='Máy vân tay tự gửi lượt chấm lên — điểm danh buổi học được ghi tự động'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={
				canManage && devices.some((d) => d.status === 'active') ? (
					<Button
						icon={<RefreshSvg />}
						loading={syncing}
						onClick={syncAll}
					>
						Đồng bộ học viên xuống máy
					</Button>
				) : undefined
			}
		>
			<div
				className={base.tabs}
				role='tablist'
			>
				{TABS.map((t) => (
					<button
						key={t.key}
						role='tab'
						aria-selected={tab === t.key}
						className={`${base.tabBtn} ${tab === t.key ? base.tabBtnActive : ''}`}
						onClick={() => setParams(t.key === 'devices' ? {} : { tab: t.key }, { replace: true })}
					>
						{t.key === 'devices' && <FingerprintSvg />}
						{t.label}
						{t.key === 'devices' && pendingCount > 0 && (
							<span className={styles.pendingBadge}>{pendingCount}</span>
						)}
					</button>
				))}
			</div>

			<div className={base.tableCard}>
				{tab === 'devices' && (
					<DevicesPanel
						devices={devices}
						loading={loading}
						canManage={canManage}
						onChanged={reload}
					/>
				)}
				{tab === 'punches' && (
					<PunchesPanel
						devices={devices}
						canManage={canManage}
					/>
				)}
				{tab === 'commands' && <CommandsPanel devices={devices} />}
			</div>

			{tab === 'devices' && <SetupGuide open={!loading && devices.length === 0} />}
		</AdminLayout>
	);
}
