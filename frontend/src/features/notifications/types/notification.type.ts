export type NotifCategory = 'approval' | 'topic' | 'system' | 'warning';

export const NOTIF_TYPES: { value: string; label: string; category: NotifCategory }[] = [
	{ value: 'broadcast', label: 'Thông báo chung', category: 'system' },
	{ value: 'warning', label: 'Cảnh báo', category: 'warning' },
	{ value: 'deadline_reminder', label: 'Nhắc hạn nộp', category: 'warning' },
	{ value: 'topic_approved', label: 'Duyệt đề tài', category: 'approval' },
	{ value: 'topic_rejected', label: 'Từ chối đề tài', category: 'approval' },
	{ value: 'topic_submitted', label: 'Nộp đề tài', category: 'approval' },
	{ value: 'topic_supplement_requested', label: 'Yêu cầu bổ sung thông tin', category: 'approval' },
	{ value: 'supplement_opened', label: 'Mở đợt bổ sung thông tin', category: 'approval' },
	{ value: 'supplement_closed', label: 'Đóng đợt bổ sung thông tin', category: 'approval' },
	{ value: 'member_added', label: 'Thêm thành viên', category: 'topic' },
	{ value: 'account_granted', label: 'Cấp tài khoản', category: 'system' },
	{ value: 'leave_request_submitted', label: 'Đơn xin phép', category: 'approval' },
	{ value: 'leave_request_reviewed', label: 'Kết quả đơn xin phép', category: 'approval' },
	{ value: 'tuition_submitted', label: 'Học viên báo đã nộp học phí', category: 'approval' },
	{ value: 'tuition_confirmed', label: 'Xác nhận học phí', category: 'approval' },
	{ value: 'tuition_rejected', label: 'Từ chối khoản học phí', category: 'warning' },
	{ value: 'tuition_bank_unmatched', label: 'Giao dịch ngân hàng chưa khớp học phí', category: 'approval' },
	{ value: 'sign_request', label: 'Văn bản cần ký', category: 'approval' },
	{ value: 'sign_request_completed', label: 'Văn bản đã ký xong', category: 'approval' },
	{ value: 'sign_request_rejected', label: 'Văn bản bị từ chối ký', category: 'warning' },
	{ value: 'sign_request_cancelled', label: 'Hồ sơ trình ký đã hủy', category: 'system' },
	{ value: 'signing_account', label: 'Chứng thư số', category: 'system' },
];

export type TargetType = 'all' | 'department' | 'users';

export const TARGET_LABELS: Record<TargetType, string> = {
	all: 'Tất cả người dùng',
	department: 'Theo phòng ban',
	users: 'Người dùng cụ thể',
};
