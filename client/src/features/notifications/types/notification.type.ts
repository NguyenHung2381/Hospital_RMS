export type NotifCategory = 'approval' | 'topic' | 'system' | 'warning';

export const NOTIF_TYPES: { value: string; label: string; category: NotifCategory }[] = [
	{ value: 'broadcast', label: 'Thông báo chung', category: 'system' },
	{ value: 'warning', label: 'Cảnh báo', category: 'warning' },
	{ value: 'deadline_reminder', label: 'Nhắc nhở deadline', category: 'warning' },
	{ value: 'topic_approved', label: 'Duyệt đề tài', category: 'approval' },
	{ value: 'topic_rejected', label: 'Từ chối đề tài', category: 'approval' },
	{ value: 'topic_submitted', label: 'Nộp đề tài', category: 'approval' },
	{ value: 'topic_supplement_requested', label: 'Yêu cầu bổ sung thông tin', category: 'approval' },
	{ value: 'supplement_opened', label: 'Mở đợt bổ sung thông tin', category: 'approval' },
	{ value: 'supplement_closed', label: 'Đóng đợt bổ sung thông tin', category: 'approval' },
	{ value: 'member_added', label: 'Thêm thành viên', category: 'topic' },
	{ value: 'account_granted', label: 'Cấp tài khoản', category: 'system' },
];

export type TargetType = 'all' | 'department' | 'users';

export const TARGET_LABELS: Record<TargetType, string> = {
	all: 'Tất cả người dùng',
	department: 'Theo phòng ban',
	users: 'Người dùng cụ thể',
};
