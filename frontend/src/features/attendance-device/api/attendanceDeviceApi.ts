import { apiClient } from '../../../shared/api/axios';
import type {
	AttendanceDevice,
	CommandStatus,
	DeviceCommand,
	DeviceFormData,
	DevicePunch,
	DeviceStatus,
	PunchFilter,
} from '../types/attendanceDevice.type';

const qs = (params: Record<string, string | number | undefined | null>) => {
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
	const s = sp.toString();
	return s ? `?${s}` : '';
};

export const attendanceDeviceApi = {
	list: () => apiClient.get<AttendanceDevice[]>('/attendance-devices'),

	update: (id: number, data: Partial<DeviceFormData> & { status?: DeviceStatus }) =>
		apiClient.patch<null>(`/attendance-devices/${id}`, {
			...data,
			...(data.name !== undefined ? { name: data.name.trim() || null } : {}),
			...(data.location !== undefined ? { location: data.location.trim() || null } : {}),
		}),

	remove: (id: number) => apiClient.delete<null>(`/attendance-devices/${id}`),

	resync: (id: number) => apiClient.post<{ queued: number }>(`/attendance-devices/${id}/resync`, {}),

	pullAttlog: (id: number, from: string, to: string) =>
		apiClient.post<null>(`/attendance-devices/${id}/pull-attlog`, { from, to }),

	/** Máy gửi lại toàn bộ người dùng + vân tay đang có (lấy vân tay đăng ký từ trước) */
	pullFingerprints: (id: number) =>
		apiClient.post<{ queued: boolean }>(`/attendance-devices/${id}/pull-fingerprints`, {}),

	/** Đẩy tay học viên xuống mọi máy (giữ trên máy theo cài đặt "Dọn học viên khỏi máy sau") */
	pushTrainees: (traineeIds: string[]) =>
		apiClient.post<{ pushed: number; skipped: { id: string; reason: string }[]; queued: number }>(
			'/attendance-devices/push-trainees',
			{ trainee_ids: traineeIds },
		),

	syncAll: () => apiClient.post<{ queued: number }>('/attendance-devices/sync', {}),

	punches: (q: { status?: PunchFilter; from?: string; to?: string; device_id?: number | '' }) =>
		apiClient.get<DevicePunch[]>(`/attendance-devices/punches${qs(q)}`),

	rematch: (days = 7) =>
		apiClient.post<{ matched: number; total: number }>('/attendance-devices/punches/rematch', { days }),

	commands: (q: { device_id?: number | ''; status?: CommandStatus | '' }) =>
		apiClient.get<DeviceCommand[]>(`/attendance-devices/commands${qs(q)}`),
};
