import { formatDateOr } from '@/shared/utils';
import type { CourseProgramLink } from '../types/course.type';

export interface ProgramClassStatus {
	/** Nhãn ngắn: "Đã mở lớp" / "Đủ sĩ số, chờ mở" / "Chưa mở lớp" */
	label: string;
	/** Dòng phụ về sĩ số, vd "3/10 học viên tối thiểu" */
	detail: string;
	tone: 'green' | 'amber' | 'gray';
}

/** Trạng thái lớp (khóa ĐTLT / CTCV: mỗi chương trình là 1 lớp, đủ sĩ số tối thiểu thì mở lớp). */
export const programClassStatus = (l: CourseProgramLink): ProgramClassStatus | null => {
	if (!l.class_rule) return null;
	const max = l.class_max != null ? ` · tối đa ${l.class_max}` : '';
	if (l.class_opened_at) return { label: 'Đã mở lớp', detail: `${l.class_approved} học viên${max}`, tone: 'green' };
	const detail = `${l.class_approved}/${l.class_min} học viên tối thiểu`;
	if (l.class_approved >= l.class_min) return { label: 'Đủ sĩ số, chờ mở', detail, tone: 'amber' };
	return { label: 'Chưa mở lớp', detail, tone: 'gray' };
};

export const programDates = (l: CourseProgramLink) =>
	l.class_start || l.class_end ? `${formatDateOr(l.class_start, '?')} → ${formatDateOr(l.class_end, '?')}` : null;
