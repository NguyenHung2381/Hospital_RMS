import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { useState } from 'react';
import { attendanceDeviceApi } from '../api/attendanceDeviceApi';

/**
 * Đẩy tay học viên xuống máy chấm công (trang Tất cả học viên). Học viên được giữ trên máy
 * theo cài đặt "Dọn học viên khỏi máy sau" kể từ hôm nay, dù chưa có khóa đang học.
 */
export function usePushToDevices() {
	const canPush = usePermission().has('attendance_devices:manage');
	const [pushing, setPushing] = useState(false);

	const push = async (traineeIds: string[]) => {
		if (!traineeIds.length || pushing) return false;
		setPushing(true);
		try {
			const r = await attendanceDeviceApi.pushTrainees(traineeIds);
			if (r.pushed) {
				showToast(
					'success',
					`Đã đẩy ${r.pushed} học viên xuống máy chấm công — máy nhận trong ít phút` +
						(r.skipped.length ? `. Bỏ qua ${r.skipped.length}: ${r.skipped[0].reason}` : ''),
				);
			} else {
				showToast('error', r.skipped[0]?.reason ?? 'Không có học viên nào đẩy được');
			}
			return r.pushed > 0;
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Đẩy xuống máy chấm công thất bại');
			return false;
		} finally {
			setPushing(false);
		}
	};

	return { canPush, pushing, push };
}
