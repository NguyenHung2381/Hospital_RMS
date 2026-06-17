import type { TopicMemberApiRole } from '../api/topicApi';
import type {
	MemberFormData,
	MemberRole,
	Topic,
	TopicMember,
	TopicStatus,
} from '../types/topicmember.type';

export const ROLE_CFG: Record<
	MemberRole,
	{ label: string; short: string; cls: string; avatarCls: string }
> = {
	chu_nhiem: {
		label: 'Chủ nhiệm',
		short: 'CN',
		cls: 'roleGreen',
		avatarCls: 'avatarGreen',
	},
	thu_ky: {
		label: 'Thư ký',
		short: 'TK',
		cls: 'roleBlue',
		avatarCls: 'avatarBlue',
	},
	thanh_vien: {
		label: 'Thành viên',
		short: 'TV',
		cls: 'roleGray',
		avatarCls: 'avatarGray',
	},
	co_van: {
		label: 'Cố vấn',
		short: 'CV',
		cls: 'rolePurple',
		avatarCls: 'avatarPurple',
	},
};

export const TOPIC_STATUS_CFG: Record<
	TopicStatus,
	{ label: string; cls: string }
> = {
	draft: { label: 'Bản nháp', cls: 'tsBadgeGray' },
	submitted: { label: 'Chờ duyệt', cls: 'tsBadgeAmber' },
	approved: { label: 'Đã phê duyệt', cls: 'tsBadgeGreen' },
	rejected: { label: 'Từ chối', cls: 'tsBadgeRed' },
	supplement: { label: 'Bổ sung', cls: 'tsBadgeBlue' },
	in_progress: { label: 'Đang thực hiện', cls: 'tsBadgeBlue' },
	completed: { label: 'Hoàn thành', cls: 'tsBadgeTeal' },
};

export const EMPTY_FORM: MemberFormData = {
	ho_ten: '',
	email: '',
	so_dien_thoai: '',
	chuc_vu: '',
	staff_number: '',
	role: 'thanh_vien',
};

export function normalizeStatus(status?: string | null): TopicStatus {
	switch (status) {
		case 'draft':
		case 'submitted':
		case 'approved':
		case 'rejected':
		case 'supplement':
		case 'in_progress':
		case 'completed':
			return status;
		default:
			return 'submitted';
	}
}

export function mapApiRoleToUi(role?: string | null): MemberRole {
	switch (role) {
		case 'leader':
			return 'chu_nhiem';
		case 'secretary':
			return 'thu_ky';
		case 'member':
			return 'thanh_vien';
		default:
			return 'thanh_vien';
	}
}

export function mapUiRoleToApi(role: MemberRole): TopicMemberApiRole {
	switch (role) {
		case 'chu_nhiem':
			return 'leader';
		case 'thu_ky':
			return 'secretary';
		default:
			return 'member';
	}
}

function formatDateLocal(value?: string | null) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat('vi-VN').format(date);
}

export function normalizeTopic(topic: Record<string, unknown>): Topic {
	return {
		id: String(topic.id ?? ''),
		title: String(topic.title ?? ''),
		status: normalizeStatus(topic.status as string | null | undefined),
		department_name: String(
			topic.department_name ?? topic.department_id ?? 'Chua gan khoa/phong',
		),
		round_name: String(topic.round_name ?? topic.round_id ?? 'Chua gan dot'),
		member_count: Number(topic.member_count ?? 0),
	};
}

export function normalizeMember(member: Record<string, unknown>): TopicMember {
	return {
		id: String(member.id ?? ''),
		topic_id: String(member.topic_id ?? ''),
		ho_ten: String(member.ho_ten ?? ''),
		email: String(member.email ?? ''),
		so_dien_thoai: (member.so_dien_thoai as string | null | undefined) ?? null,
		chuc_vu: (member.chuc_vu as string | null | undefined) ?? null,
		staff_number:
			member.staff_number != null && member.staff_number !== ''
				? String(member.staff_number)
				: null,
		role: mapApiRoleToUi(member.role as string | null | undefined),
		user_id: (member.user_id as string | null | undefined) ?? null,
		account_granted: Boolean(member.account_granted),
		account_granted_at: formatDateLocal(
			member.account_granted_at as string | null | undefined,
		),
		has_existing_account: Boolean(member.has_existing_account),
		created_at:
			formatDateLocal(member.created_at as string | null | undefined) ?? '',
		created_by: String(member.created_by ?? ''),
	};
}
