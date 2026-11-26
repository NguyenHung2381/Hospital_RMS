import type { DeadlineType } from '../../round/types/round.type';
import type { CustomValues } from '../../../shared/formConfig/types';

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

export type MemberFormState = {
	ho_ten: string;
	email: string;
	so_dien_thoai: string;
	chuc_vu: string;
	staff_number: string;
	role: 'leader' | 'secretary' | 'member';
	/** Trường tùy chỉnh (Cấu hình form 'topic_member') */
	custom: CustomValues;
	/** Chọn từ gợi ý: email đã che của tài khoản. Ô email để trống thì server tự
	 * điền email thật theo mã NV — không gửi lên server. */
	accountEmailHint?: string | null;
};

export const blankMember: MemberFormState = {
	ho_ten: '',
	email: '',
	so_dien_thoai: '',
	chuc_vu: '',
	staff_number: '',
	role: 'member',
	custom: {},
};

// Nhãn trạng thái ở tab Thông tin — màu đi qua <Badge tone>.
export const STATUS_CFG = {
	submitted: { label: 'Chờ duyệt', tone: 'amber' },
	approved: { label: 'Đã duyệt', tone: 'green' },
	rejected: { label: 'Từ chối', tone: 'red' },
	supplement: { label: 'Bổ sung', tone: 'blue' },
	cancelled: { label: 'Đã hủy', tone: 'gray' },
} as const;

export const ROLE_BADGE = {
	leader: { label: 'Chủ nhiệm', bg: 'var(--tone-green-bg)', color: 'var(--tone-green-fg)' },
	secretary: { label: 'Thư ký', bg: 'var(--tone-blue-bg)', color: 'var(--tone-blue-fg)' },
	member: { label: 'Thành viên', bg: 'var(--tone-gray-bg)', color: 'var(--tone-gray-fg)' },
} as const;

export const EDIT_BANNER_STYLE: Record<
	DeadlineType,
	{ bg: string; color: string }
> = {
	topic_registration: { bg: 'var(--tone-green-bg)', color: 'var(--tone-green-fg)' },
	edit: { bg: 'var(--tone-green-bg)', color: 'var(--tone-green-fg)' },
	supplement: { bg: 'var(--tone-blue-bg)', color: 'var(--tone-blue-fg)' },
	report_submission: { bg: 'var(--tone-blue-bg)', color: 'var(--tone-blue-fg)' },
};

export type InfoForm = {
	title: string;
	description: string;
	category_id: string;
	level_id: string;
};
