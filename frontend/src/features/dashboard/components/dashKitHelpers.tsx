import type { ReactNode } from 'react';
import s from './DashKit.module.css';

// Hàm tiện ích của DashKit (tách khỏi file component để giữ fast refresh).

/** Class của DashKit cho bố cục trang (grid2, grid2even, dayGroup…). */
export const dk = s;

export const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('vi-VN');

/** Vạch trục Y tròn số (bước 1/2/5 × 10^k, số nguyên), từ 0 tới ≥ max, 3–5 vạch. */
export function niceTicks(max: number, target = 4): number[] {
	if (!(max > 0)) return [0, 1];
	const raw = max / target;
	const mag = 10 ** Math.floor(Math.log10(raw));
	const step = Math.max(1, ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag);
	const top = Math.ceil(max / step) * step;
	return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

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
				style={{ height, borderRadius: 'var(--radius-md)' }}
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

