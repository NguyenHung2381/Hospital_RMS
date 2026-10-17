import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

// Màu badge / avatar của vai trò — tra theo MÃ vai trò (roles.code, backend trả
// kèm tài khoản dưới dạng `role_code`), không theo id 'VT0x'. Nhãn ưu tiên tên
// vai trò thật từ API (`role_name`); bảng dưới chỉ là màu + nhãn dự phòng.
// Vai trò tự tạo (không có mã) hiện màu xám với tên của nó.
// Khớp mã với backend/src/modules/access/roleCodes.js.
const ROLE_DISPLAY: Record<string, { label: string; tone: BadgeTone; avatarCls: string }> = {
	admin: { label: 'Quản trị', tone: 'purple', avatarCls: 'avatarPurple' },
	director: { label: 'Giám đốc / Lãnh đạo', tone: 'red', avatarCls: 'avatarRed' },
	research_manager: { label: 'Cán bộ NCKH', tone: 'blue', avatarCls: 'avatarBlue' },
	review_council: { label: 'Hội đồng xét duyệt', tone: 'gray', avatarCls: 'avatarGray' },
	topic_leader: { label: 'Chủ nhiệm đề tài', tone: 'amber', avatarCls: 'avatarAmber' },
	member: { label: 'Thành viên đề tài', tone: 'green', avatarCls: 'avatarGreen' },
	dept_head: { label: 'Trưởng khoa/phòng', tone: 'teal', avatarCls: 'avatarTeal' },
	trainee: { label: 'Học viên', tone: 'pink', avatarCls: 'avatarGray' },
};

const FALLBACK = { label: 'Vai trò', tone: 'gray' as const, avatarCls: 'avatarGray' };

export interface RoleLike {
	role_code?: string | null;
	role_name?: string | null;
}

export function roleCfg(user?: RoleLike | null) {
	const base = (user?.role_code && ROLE_DISPLAY[user.role_code]) || FALLBACK;
	return user?.role_name ? { ...base, label: user.role_name } : base;
}
