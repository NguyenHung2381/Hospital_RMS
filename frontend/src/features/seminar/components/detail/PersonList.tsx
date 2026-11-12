import type { ReactNode } from 'react';
import type { SeminarParticipant } from '../../types/seminar.type';
import s from './Detail.module.css';
import { fullName, unitOf } from './detailUtils';

/**
 * Danh sách gọn người tham dự (tab Điểm danh / Bài kiểm tra / CME) — bấm tên mở drawer.
 * `limit`: chỉ hiện N người đầu, còn lại ghi "và M người khác".
 */
export function PersonList({
	items,
	onOpen,
	right,
	limit,
	empty,
}: {
	items: SeminarParticipant[];
	onOpen: (id: string) => void;
	right?: (p: SeminarParticipant) => ReactNode;
	limit?: number;
	empty: string;
}) {
	if (!items.length) return <div className={s.empty}>{empty}</div>;
	const shown = limit ? items.slice(0, limit) : items;
	return (
		<>
			<ul className={s.miniList}>
				{shown.map((p) => (
					<li
						key={p.id}
						className={s.miniItem}
					>
						<span>
							<button
								type='button'
								className={s.nameBtn}
								onClick={() => onOpen(p.id)}
							>
								{fullName(p)}
							</button>
							{unitOf(p) && <div className={s.sub}>{unitOf(p)}</div>}
						</span>
						{right?.(p)}
					</li>
				))}
			</ul>
			{items.length > shown.length && (
				<div className={s.miniMore}>và {items.length - shown.length} người khác — xem ở tab Người tham gia</div>
			)}
		</>
	);
}
