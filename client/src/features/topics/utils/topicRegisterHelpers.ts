import type { ArticleType, MemberRole, TopicStatus } from '../types/topic.type';

export const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150 MB

export const ARTICLE_TYPE_CFG: Record<
	ArticleType,
	{ label: string; tabLabel: string; sub: string }
> = {
	de_tai: {
		label: 'Đăng ký đề tài nghiên cứu',
		tabLabel: 'Đề tài NCKH',
		sub: 'Nhập thông tin đăng ký rồi nhấn "Thêm vào danh sách"',
	},
	bai_bao: {
		label: 'Đăng ký bài báo / báo cáo tập san',
		tabLabel: 'Bài báo & Tập san',
		sub: 'Nhập thông tin bài báo/báo cáo rồi nhấn "Thêm vào danh sách"',
	},
};

// Vai trò hiển thị theo loại đăng ký; bài báo chỉ dùng leader/member (Tác giả chính/Đồng tác giả)
export const ARTICLE_ROLE_CFG: Record<
	ArticleType,
	Partial<Record<MemberRole, { label: string }>>
> = {
	de_tai: {
		leader: { label: 'Chủ nhiệm' },
		secretary: { label: 'Thư ký' },
		member: { label: 'Thành viên' },
	},
	bai_bao: {
		leader: { label: 'Tác giả chính' },
		member: { label: 'Đồng tác giả' },
	},
};

export const STATUS_CFG: Record<TopicStatus, { label: string; dot: string }> = {
	submitted: { label: 'Chờ phê duyệt', dot: '#f59e0b' },
	approved: { label: 'Đã phê duyệt', dot: '#22c55e' },
	rejected: { label: 'Không phê duyệt', dot: '#ef4444' },
	supplement: { label: 'Yêu cầu bổ sung', dot: '#8b5cf6' },
	cancelled: { label: 'Đã hủy', dot: '#9ca3af' },
};

export const BADGE_CLS: Record<TopicStatus, string> = {
	submitted: 'badgeAmber',
	approved: 'badgeGreen',
	rejected: 'badgeRed',
	supplement: 'badgeBlue',
	cancelled: 'badgeGray',
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
		desc: 'Nhập tiêu đề, mô tả và chọn đợt nghiên cứu phù hợp.',
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
		desc: 'Khi hoàn tất, nhấn "Gửi tất cả" để nộp hồ sơ yêu cầu phê duyệt.',
	},
];
