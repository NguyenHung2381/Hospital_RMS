import type { MemberRole, TopicStatus } from '../types/topic.type';

export const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150 MB

export const STATUS_CFG: Record<TopicStatus, { label: string; dot: string }> = {
	submitted: { label: 'Chờ duyệt', dot: '#f59e0b' },
	approved: { label: 'Đã duyệt', dot: '#22c55e' },
	rejected: { label: 'Từ chối', dot: '#ef4444' },
	supplement: { label: 'Bổ sung', dot: '#8b5cf6' },
};

export const BADGE_CLS: Record<TopicStatus, string> = {
	submitted: 'badgeAmber',
	approved: 'badgeGreen',
	rejected: 'badgeRed',
	supplement: 'badgeBlue',
};

export const ROLE_CFG: Record<MemberRole, { label: string }> = {
	leader: { label: 'Chủ nhiệm' },
	secretary: { label: 'Thư ký' },
	member: { label: 'Thành viên' },
};


export function fmtDate(iso: string): string {
	return new Date(iso).toLocaleDateString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
	});
}

export const GUIDE_STEPS = [
	{
		title: 'Điền thông tin đề tài',
		desc: 'Nhập tiêu đề, mô tả và chọn vòng nghiên cứu phù hợp.',
	},
	{
		title: 'Thêm thành viên',
		desc: 'Tìm kiếm hoặc thêm thủ công với đầy đủ thông tin bắt buộc.',
	},
	{
		title: 'Thêm vào danh sách',
		desc: 'Nhấn "Thêm vào danh sách" rồi tiếp tục điền đề tài kế tiếp.',
	},
	{
		title: 'Gửi tất cả',
		desc: 'Khi hoàn tất, nhấn "Gửi tất cả" để nộp lên hội đồng phê duyệt.',
	},
];
