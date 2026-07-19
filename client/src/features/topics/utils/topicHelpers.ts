import type { MemberRole, TopicStatus } from '../types/topic.type';

export const STATUS_CFG: Record<TopicStatus, { label: string; cls: string }> = {
	submitted: { label: 'Chờ phê duyệt', cls: 'badgeAmber' },
	approved: { label: 'Đã phê duyệt', cls: 'badgeGreen' },
	rejected: { label: 'Không phê duyệt', cls: 'badgeRed' },
	supplement: { label: 'Yêu cầu bổ sung', cls: 'badgeBlue' },
	cancelled: { label: 'Đã hủy', cls: 'badgeGray' },
};

export const MEMBER_ROLE_CFG: Record<
	MemberRole,
	{ label: string; cls: string }
> = {
	leader: { label: 'Chủ nhiệm', cls: 'badgeGreen' },
	secretary: { label: 'Thư ký', cls: 'badgeBlue' },
	member: { label: 'Thành viên', cls: 'badgeGray' },
};

// Chủ nhiệm phải là người được thêm đầu tiên; mỗi đề tài chỉ có tối đa 1 Chủ nhiệm và 1 Thư ký
export function isAddRoleAllowed(
	pendingMembers: { role: MemberRole }[],
	role: MemberRole,
): boolean {
	if (pendingMembers.length === 0) return role === 'leader';
	if (role === 'leader' || role === 'secretary')
		return !pendingMembers.some((m) => m.role === role);
	return true;
}

export function isEditRoleAllowed(
	pendingMembers: { tempId: string; role: MemberRole }[],
	tempId: string,
	role: MemberRole,
): boolean {
	if (role === 'leader' || role === 'secretary')
		return !pendingMembers.some(
			(m) => m.tempId !== tempId && m.role === role,
		);
	return true;
}

export function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const MIME_EXT: Record<string, string> = {
	'application/pdf': 'pdf',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
		'docx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/zip': 'zip',
	'application/x-rar-compressed': 'rar',
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/gif': 'gif',
};

export function getMimeExtension(mimeType: string | null | undefined): string {
	if (!mimeType) return 'file';
	return MIME_EXT[mimeType] ?? mimeType.split('/').pop() ?? 'file';
}

export function getFileTypeColor(ext: string): string {
	const map: Record<string, string> = {
		pdf: '#E24B4A',
		doc: '#378ADD',
		docx: '#378ADD',
		xls: '#2EB87A',
		xlsx: '#2EB87A',
		zip: '#8B5CF6',
		rar: '#8B5CF6',
		png: '#EF9F27',
		jpg: '#EF9F27',
		jpeg: '#EF9F27',
	};
	return map[ext.toLowerCase()] ?? '#9CA3AF';
}

export function lookup<T extends { id: string; name: string }>(
	arr: T[],
	id: string,
) {
	return arr.find((x) => x.id === id)?.name ?? id;
}


export function genMemberUsername(
	fullName: string | null | undefined,
	staffNumber: string | number | null | undefined,
): string {
	if (!fullName || !staffNumber) return '';
	const initials = fullName
		.replace(
			/^(BS\.|TS\.|PGS\.|GS\.|ĐD\.|DS\.|CN\.|KS\.|ThS\.|BSCK\d*\.)\s*/i,
			'',
		)
		.split(/\s+/)
		.map((w) => w.charAt(0))
		.filter(Boolean)
		.join('')
		.toUpperCase();
	return `${initials}_${String(staffNumber).padStart(4, '0')}`;
}
