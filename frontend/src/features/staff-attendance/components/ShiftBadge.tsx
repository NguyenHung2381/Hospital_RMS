import { Badge, type BadgeTone } from '@/shared/components';
import type { WorkShift } from '../api/shiftApi';

/** Ký hiệu ca có màu; rê chuột xem tên + giờ. */
export function ShiftBadge({ shift }: { shift: Pick<WorkShift, 'code' | 'color' | 'name' | 'start_time' | 'end_time'> }) {
	return (
		<span title={`${shift.name} ${shift.start_time}–${shift.end_time}`}>
			<Badge tone={(shift.color ?? 'gray') as BadgeTone}>{shift.code}</Badge>
		</span>
	);
}
