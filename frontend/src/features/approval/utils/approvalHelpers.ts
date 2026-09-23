import { formatDate } from '../../../shared/utils/formatDate';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';
import type { TopicFile } from '../../topics/types/topic.type';
import type {
	ApprovalRecord,
	ApvHistoryItem,
	ApvStatus,
	TopicLevel,
} from '../types/approval.type';
import type {
	Approval as ApprovalHistory,
	TopicApprovalDetail,
	TopicApprovalItem,
} from '../api/approval';

export const STATUS_CFG: Record<ApvStatus, { label: string; tone: BadgeTone }> = {
	pending: { label: 'Chờ phê duyệt', tone: 'amber' },
	approved: { label: 'Đã phê duyệt', tone: 'green' },
	rejected: { label: 'Từ chối', tone: 'red' },
	info_requested: { label: 'Yêu cầu bổ sung', tone: 'blue' },
};

export const LEVEL_CFG: Record<TopicLevel, { label: string; tone: BadgeTone }> = {
	'LV-BV': { label: 'Cấp bệnh viện', tone: 'teal' },
	'LV-BO': { label: 'Cấp bộ', tone: 'purple' },
	'LV-NN': { label: 'Nhà nước', tone: 'amber' },
	'LV-CS': { label: 'Cơ sở', tone: 'gray' },
};

export const APV_HISTORY_CFG: Record<ApvStatus, string> = {
	pending: 'Nộp hồ sơ',
	approved: 'Phê duyệt',
	rejected: 'Không phê duyệt',
	info_requested: 'Yêu cầu bổ sung',
};

const FALLBACK_LEVEL_LABEL: Record<string, string> = {
	'LV-BV': 'Cap benh vien',
	'LV-BO': 'Cap bo',
	'LV-NN': 'Nha nuoc',
	'LV-CS': 'Co so',
};

export function toApvStatus(status: string): ApvStatus {
	if (status === 'approved' || status === 'rejected') return status;
	if (status === 'supplement') return 'info_requested';
	return 'pending';
}

export function getLevelStyle(level: string) {
	return (
		LEVEL_CFG[level as TopicLevel] ?? {
			label: FALLBACK_LEVEL_LABEL[level] ?? level ?? 'Chưa phân cấp',
			tone: 'gray' as const,
		}
	);
}

export function getMemberRoleLabel(role?: string | null) {
	switch (role) {
		case 'leader':
			return 'Chủ nhiệm';
		case 'secretary':
			return 'Thư ký';
		case 'advisor':
			return 'Cố vấn';
		default:
			return 'Thành viên';
	}
}

export function isUrgentTopic(createdAt?: string, status?: ApvStatus) {
	if (!createdAt || status !== 'pending') return false;
	const created = new Date(createdAt);
	if (Number.isNaN(created.getTime())) return false;
	return Date.now() - created.getTime() > 3 * 24 * 60 * 60 * 1000;
}

interface FileTypeMeta {
	label: string;
	cls: string;
}

export function getFileTypeMeta(file: TopicFile): FileTypeMeta {
	const mime = file.mime_type ?? '';
	const name = file.file_name.toLowerCase();
	if (mime === 'application/pdf' || name.endsWith('.pdf'))
		return { label: 'PDF', cls: 'fileTypePdf' };
	if (
		mime.includes('wordprocessingml') ||
		name.endsWith('.docx') ||
		name.endsWith('.doc')
	)
		return { label: 'Word', cls: 'fileTypeWord' };
	if (
		mime.includes('spreadsheetml') ||
		name.endsWith('.xlsx') ||
		name.endsWith('.xls')
	)
		return { label: 'Excel', cls: 'fileTypeExcel' };
	if (mime.startsWith('image/')) return { label: 'Ảnh', cls: 'fileTypeImage' };
	return { label: 'Tệp', cls: 'fileTypeOther' };
}

export function getFileViewerUrl(file: TopicFile): string | null {
	const meta = getFileTypeMeta(file);
	if (meta.label === 'PDF' || meta.label === 'Word') return file.file_url;
	if (meta.label === 'Ảnh') return file.file_url;
	return null;
}

export function mapHistoryItem(item: ApprovalHistory): ApvHistoryItem {
	return {
		action: toApvStatus(item.status),
		comment: item.comment,
		actor: item.approver_name || item.created_by,
		at: formatDate(item.created_at) ?? '',
	};
}

export function mapTopicToRecord(topic: TopicApprovalItem): ApprovalRecord {
	const status = toApvStatus(topic.status);
	return {
		id: topic.id,
		topic_id: topic.id,
		topic_title: topic.title,
		topic_description: topic.description ?? '',
		topic_level: topic.level_id ?? '',
		topic_category:
			topic.category_name ?? topic.category_id ?? 'Chưa phân loại',
		topic_dept:
			topic.department_name ?? topic.department_id ?? 'Chưa gán khoa/phòng',
		topic_round: topic.round_name ?? topic.round_id ?? 'Chưa gán đợt',
		topic_member_count: topic.member_count ?? 0,
		status,
		comment: null,
		created_at: formatDate(topic.created_at) ?? '',
		created_by: topic.created_by_name ?? topic.created_by,
		updated_at: formatDate(topic.updated_at),
		updated_by: null,
		budget_estimated: topic.budget_estimated ?? null,
		budget_actual: topic.budget_actual ?? null,
		approval_decision_no: topic.approval_decision_no ?? null,
		approval_decision_date: formatDate(topic.approval_decision_date),
		recognition_decision_no: topic.recognition_decision_no ?? null,
		recognition_decision_date: formatDate(topic.recognition_decision_date),
		is_urgent: isUrgentTopic(topic.created_at, status),
		history: [],
		members: [],
	};
}

export function mergeTopicDetail(
	record: ApprovalRecord,
	topic: TopicApprovalDetail,
	approvals: ApprovalHistory[],
): ApprovalRecord {
	const history = approvals.map(mapHistoryItem);
	const latest = approvals[0];
	return {
		...record,
		topic_description: topic.description ?? '',
		topic_level: topic.level_id ?? '',
		topic_category:
			topic.category_name ?? topic.category_id ?? record.topic_category,
		topic_dept:
			topic.department_name ?? topic.department_id ?? record.topic_dept,
		topic_round: topic.round_name ?? topic.round_id ?? record.topic_round,
		topic_member_count: topic.members?.length ?? record.topic_member_count,
		budget_estimated: topic.budget_estimated ?? record.budget_estimated,
		budget_actual: topic.budget_actual ?? record.budget_actual,
		approval_decision_no: topic.approval_decision_no ?? record.approval_decision_no,
		approval_decision_date:
			formatDate(topic.approval_decision_date) ?? record.approval_decision_date,
		recognition_decision_no:
			topic.recognition_decision_no ?? record.recognition_decision_no,
		recognition_decision_date:
			formatDate(topic.recognition_decision_date) ?? record.recognition_decision_date,
		comment: latest?.comment ?? null,
		updated_at: formatDate(latest?.created_at) ?? record.updated_at,
		updated_by:
			latest?.approver_name ?? latest?.created_by ?? record.updated_by,
		history,
		members: (topic.members ?? []).map((member) => ({
			name: member.ho_ten,
			role: getMemberRoleLabel(member.role),
			dept: topic.department_name ?? topic.department_id ?? '',
		})),
	};
}
