export type EditMode = 'full' | 'supplement' | 'file-only' | 'none';
export type TopicDetailTabKey = 'info' | 'members' | 'files';

export type MemberFormState = {
	ho_ten: string;
	email: string;
	so_dien_thoai: string;
	chuc_vu: string;
	staff_number: string;
	role: 'leader' | 'secretary' | 'member';
};

export const blankMember: MemberFormState = {
	ho_ten: '',
	email: '',
	so_dien_thoai: '',
	chuc_vu: '',
	staff_number: '',
	role: 'member',
};

export const STATUS_CFG = {
	submitted: {
		label: 'Chờ duyệt',
		dot: '#f59e0b',
		bg: '#fef3c7',
		color: '#92400e',
	},
	approved: {
		label: 'Đã duyệt',
		dot: '#22c55e',
		bg: '#dcfce7',
		color: '#166534',
	},
	rejected: {
		label: 'Từ chối',
		dot: '#ef4444',
		bg: '#fee2e2',
		color: '#991b1b',
	},
	supplement: {
		label: 'Bổ sung',
		dot: '#8b5cf6',
		bg: '#ede9fe',
		color: '#5b21b6',
	},
} as const;

export const ROLE_BADGE = {
	leader: { label: 'Chủ nhiệm', bg: '#dcfce7', color: '#166534' },
	secretary: { label: 'Thư ký', bg: '#dbeafe', color: '#1e40af' },
	member: { label: 'Thành viên', bg: '#f3f4f6', color: '#374151' },
} as const;

export const EDIT_MODE_INFO: Record<
	EditMode,
	{ text: string; bg: string; color: string } | null
> = {
	full: {
		text: 'Đang trong thời gian đăng ký — có thể chỉnh sửa thông tin và tải lên tài liệu.',
		bg: '#dcfce7',
		color: '#166534',
	},
	supplement: {
		text: 'Đang trong cửa sổ bổ sung thông tin — có thể chỉnh sửa tên, thành viên và tài liệu.',
		bg: '#ede9fe',
		color: '#5b21b6',
	},
	'file-only': {
		text: 'Đang trong thời hạn nộp báo cáo — chỉ có thể tải lên tài liệu.',
		bg: '#dbeafe',
		color: '#1e40af',
	},
	none: null,
};

export type InfoForm = {
	title: string;
	description: string;
	category_id: string;
	level_id: string;
};
