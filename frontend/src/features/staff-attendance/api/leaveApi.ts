import { apiClient } from '@/shared/api/axios';
import type { LeaveRequest, LeaveStatus } from '@/features/portal/api/meApi';

// Đơn xin nghỉ / xin đi muộn của học viên — phía quản trị (staff_attendance:approve)

export interface AdminLeaveRequest extends LeaveRequest {
	/** Mã học viên. */
	trainee_id: string;
	full_name: string;
	department_id: string | null;
	department_name: string | null;
}

export const listLeaveRequests = (f: { status?: LeaveStatus | ''; from?: string; to?: string }) => {
	const qs = new URLSearchParams();
	if (f.status) qs.set('status', f.status);
	if (f.from) qs.set('from', f.from);
	if (f.to) qs.set('to', f.to);
	return apiClient.get<AdminLeaveRequest[]>(`/staff-attendance/leave-requests?${qs}`);
};

export const reviewLeaveRequest = (id: number, body: { decision: 'approved' | 'rejected'; note: string | null }) =>
	apiClient.put<AdminLeaveRequest>(`/staff-attendance/leave-requests/${id}/review`, body);
