import type { ReactNode } from 'react';
import s from './DashKit.module.css';

// Hàm tiện ích của DashKit (tách khỏi file component để giữ fast refresh).

/** Class của DashKit cho bố cục trang (grid2, grid2even, dayGroup…). */
export const dk = s;

export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('vi-VN');

/** 12 khóa 'YYYY-MM' gần nhất (cũ → mới), để lấp tháng không có dữ liệu. */
export function last12Months(now = new Date()): string[] {
	return Array.from({ length: 12 }, (_, i) => {
		const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	});
}

/** 'YYYY-MM' → 'MM/YY' */
export const monthLabel = (ym: string) => `${ym.slice(5, 7)}/${ym.slice(2, 4)}`;

/** Trạng thái tải / lỗi / rỗng dùng chung trong Panel. Trả null khi có dữ liệu. */
export function panelState(
	loading: boolean,
	error: boolean,
	empty: boolean,
	emptyText = 'Chưa có dữ liệu',
	height = 160,
): ReactNode | null {
	if (loading)
		return (
			<div
				className={s.skeleton}
				style={{ height }}
				aria-busy='true'
			/>
		);
	if (error)
		return (
			<div
				className={s.note}
				style={{ minHeight: height }}
			>
				Không tải được dữ liệu. Tải lại trang để thử lại.
			</div>
		);
	if (empty)
		return (
			<div
				className={s.note}
				style={{ minHeight: height }}
			>
				{emptyText}
			</div>
		);
	return null;
}

