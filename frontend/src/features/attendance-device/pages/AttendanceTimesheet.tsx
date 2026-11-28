import AdminLayout from '@/layouts/AdminLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import base from '@/shared/components/Table/CrudPage.module.css';
import { showToast } from '@/shared/utils/feedback';
import { useEffect, useState } from 'react';
import { attendanceDeviceApi } from '../api/attendanceDeviceApi';
import { TimesheetPanel } from '../components/TimesheetPanel';
import type { AttendanceDevice } from '../types/attendanceDevice.type';

/** Trang Bảng công: lượt chấm vân tay gộp theo người / ngày, kèm điểm danh theo ca, xuất Excel */
export default function AttendanceTimesheet() {
	const [devices, setDevices] = useState<AttendanceDevice[]>([]);
	const [refreshKey, setRefreshKey] = useState(0);

	// Chỉ cần danh sách máy cho bộ lọc
	useRealtimeUpdate('attendance_device', () => setRefreshKey((k) => k + 1));

	useEffect(() => {
		attendanceDeviceApi
			.list()
			.then(setDevices)
			.catch(() => showToast('error', 'Không tải được danh sách máy chấm công'));
	}, [refreshKey]);

	return (
		<AdminLayout
			pageTitle='Bảng công'
			pageSubtitle='Giờ vào, giờ ra của từng người theo ngày từ máy chấm công vân tay, kèm ca và đi muộn / về sớm'
			breadcrumbs={[{ label: 'Đào tạo' }]}
		>
			<div className={base.tableCard}>
				<TimesheetPanel devices={devices} />
			</div>
		</AdminLayout>
	);
}
