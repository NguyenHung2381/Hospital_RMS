import { formatDateOr } from '../../../shared/utils/formatDate';
import type { PublicSeminar, SeminarTicket } from '../api/publicApi';

type When = Pick<PublicSeminar, 'date_text' | 'start_date' | 'end_date' | 'start_time' | 'end_time'>;

/** "Thời gian" hiển thị của hội nghị: ưu tiên chuỗi nhập tay, sau đó từ ngày – đến ngày (kèm giờ nếu có). */
export const seminarWhen = (s: When) => {
	if (!s.start_date || (!s.start_time && !s.end_time))
		return (
			s.date_text ||
			[s.start_date, s.end_date !== s.start_date ? s.end_date : null]
				.filter(Boolean)
				.map((d) => formatDateOr(d))
				.join(' – ') ||
			'—'
		);
	const day = (d: string | null) => (d ? formatDateOr(d) : '');
	const at = (d: string | null, t?: string | null) => [t, day(d)].filter(Boolean).join(' ');
	const sameDay = !s.end_date || s.end_date === s.start_date;
	if (sameDay) {
		const range = s.start_time && s.end_time ? `${s.start_time} – ${s.end_time}` : s.start_time || `đến ${s.end_time}`;
		return `${range} ${day(s.start_date)}`;
	}
	return `${at(s.start_date, s.start_time)} – ${at(s.end_date, s.end_time)}`;
};

/** Khung giờ làm bài test: "16:00 – 16:30 ngày 16/10/2026" (rỗng nếu chưa đặt giờ). */
export const testWindowText = (w: SeminarTicket['test']['window']) => {
	if (!w) return '';
	// Dừng tiếp nhận ở ngày khác ngày mở bài
	if (w.end_date && w.end_date !== w.date && w.end_time) {
		const open = w.start_time ? `từ ${w.start_time} ${formatDateOr(w.date)} ` : '';
		return `${open}đến ${w.end_time} ${formatDateOr(w.end_date)}`;
	}
	const range =
		w.start_time && w.end_time ? `${w.start_time} – ${w.end_time}` : w.start_time ? `từ ${w.start_time}` : `đến ${w.end_time}`;
	return `${range} ngày ${formatDateOr(w.date)}`;
};
