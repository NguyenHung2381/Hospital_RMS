import type { RoundDeadline } from '../../round/types/round.type';
import {
	SUPPLEMENT_FIELD_LABELS,
	type SupplementField,
} from '../../round/types/round.type';
import type { MemberRole } from '../../topics/types/topic.type';
import { parseDate as parseDdMmYyyy } from '../../../shared/utils/formatDate';
import {
	EDIT_BANNER_STYLE,
	NO_TOPIC_PERMISSIONS,
	type TopicPermissions,
} from '../types/topicDetail.type';

export function fmtDate(iso: string): string {
	return new Date(iso).toLocaleString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

/** Hôm nay có nằm trong [start_date, deadline_date] của mốc không. start_date rỗng ⇒ mở từ đầu. */
function isWithin(d: RoundDeadline, today: Date): boolean {
	const start = d.start_date ? parseDdMmYyyy(d.start_date) : null;
	const end = parseDdMmYyyy(d.deadline_date);
	if (!end) return false;
	return (!start || today >= start) && today <= end;
}

const ALL_TOPIC_PERMISSIONS: TopicPermissions = {
	canEditTitle: true,
	canEditInfo: true,
	canEditMembers: true,
	canAddFiles: true,
	canDeleteFiles: true,
	activeType: null,
	banner: null,
};

/**
 * Quyền thao tác của chủ nhiệm / thư ký với đề tài, dựa trên mốc thời gian đang
 * mở của đợt. Không phụ thuộc trạng thái đề tài. Người dùng không phải
 * leader/secretary ⇒ không có quyền nào.
 *
 * `bypass` = true cho tài khoản admin — phía server cũng không chặn admin theo
 * mốc thời gian.
 */
export function getTopicPermissions(
	myRole: MemberRole | null | undefined,
	deadlines: RoundDeadline[],
	bypass = false,
): TopicPermissions {
	if (bypass) return ALL_TOPIC_PERMISSIONS;

	if (myRole !== 'leader' && myRole !== 'secretary') {
		return NO_TOPIC_PERMISSIONS;
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const active = deadlines.find(
		(d) =>
			(d.deadline_type === 'edit' ||
				d.deadline_type === 'supplement' ||
				d.deadline_type === 'report_submission') &&
			isWithin(d, today),
	);
	if (!active || !active.deadline_type) return NO_TOPIC_PERMISSIONS;

	const type = active.deadline_type;
	const style = EDIT_BANNER_STYLE[type];

	if (type === 'edit') {
		return {
			canEditTitle: true,
			canEditInfo: true,
			canEditMembers: true,
			canAddFiles: true,
			canDeleteFiles: true,
			activeType: 'edit',
			banner: {
				text: 'Đang trong cửa sổ "Sửa" — chủ nhiệm/thư ký có thể chỉnh sửa toàn bộ thông tin, thành viên và tài liệu.',
				...style,
			},
		};
	}

	if (type === 'report_submission') {
		return {
			canEditTitle: false,
			canEditInfo: false,
			canEditMembers: false,
			canAddFiles: true,
			canDeleteFiles: false,
			activeType: 'report_submission',
			banner: {
				text: 'Đang trong thời hạn nộp báo cáo — chỉ có thể tải lên tài liệu mới, không xoá được tài liệu cũ.',
				...style,
			},
		};
	}

	// supplement — chỉ những mục đã tick (null/[] ⇒ tất cả)
	const allowed: SupplementField[] =
		active.supplement_fields && active.supplement_fields.length
			? active.supplement_fields
			: ['title', 'description', 'members', 'files'];
	const has = (f: SupplementField) => allowed.includes(f);
	return {
		canEditTitle: has('title'),
		canEditInfo: has('description'),
		canEditMembers: has('members'),
		canAddFiles: has('files'),
		canDeleteFiles: has('files'),
		activeType: 'supplement',
		banner: {
			text: `Đang trong cửa sổ "Bổ sung" — chỉ được chỉnh sửa: ${allowed
				.map((f) => SUPPLEMENT_FIELD_LABELS[f])
				.join(', ')}.`,
			...style,
		},
	};
}
