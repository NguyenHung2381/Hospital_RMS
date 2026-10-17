import type { ModuleKey } from '../../../shared/hooks/useModules';

// 4 dashboard dùng chung 1 mục "Bảng điều khiển" trên sidebar (AdminLayout đọc
// danh sách này để highlight mục + chặn tab của module đã tắt).
export const DASHBOARD_TABS: { to: string; label: string; module?: ModuleKey }[] = [
	{ to: '/admin', label: 'Tổng quan chung' },
	{ to: '/admin/dashboard/research', label: 'Nghiên cứu khoa học', module: 'research' },
	{ to: '/admin/dashboard/training', label: 'Đào tạo', module: 'training' },
	{ to: '/admin/dashboard/seminar', label: 'Hội nghị & Đào tạo liên tục', module: 'seminar' },
];
