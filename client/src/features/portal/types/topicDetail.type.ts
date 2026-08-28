import type { DeadlineType } from '../../round/types/round.type';

/**
 * Những thao tác chủ nhiệm / thư ký được phép làm với đề tài, suy ra từ mốc
 * thời gian (round_deadlines) đang mở và vai trò của người dùng trong đề tài.
 */
export type TopicPermissions = {
	canEditTitle: boolean;
	canEditInfo: boolean; // mô tả + danh mục + cấp độ + khoa
	canEditMembers: boolean;
	canAddFiles: boolean;
	canDeleteFiles: boolean;
	activeType: DeadlineType | null;
	banner: { text: string; bg: string; color: string } | null;
};

export const NO_TOPIC_PERMISSIONS: TopicPermissions = {
	canEditTitle: false,
	canEditInfo: false,
	canEditMembers: false,
	canAddFiles: false,
	canDeleteFiles: false,
	activeType: null,
	banner: null,
};

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
	cancelled: {
		label: 'Đã hủy',
		dot: '#9ca3af',
		bg: '#f3f4f6',
		color: '#374151',
	},
} as const;

export const ROLE_BADGE = {
	leader: { label: 'Chủ nhiệm', bg: '#dcfce7', color: '#166534' },
	secretary: { label: 'Thư ký', bg: '#dbeafe', color: '#1e40af' },
	member: { label: 'Thành viên', bg: '#f3f4f6', color: '#374151' },
} as const;

export const EDIT_BANNER_STYLE: Record<
	DeadlineType,
	{ bg: string; color: string }
> = {
	edit: { bg: '#dcfce7', color: '#166534' },
	supplement: { bg: '#ede9fe', color: '#5b21b6' },
	report_submission: { bg: '#dbeafe', color: '#1e40af' },
};

export type InfoForm = {
	title: string;
	description: string;
	category_id: string;
	level_id: string;
};
