import { formatDateOr } from '../../../shared/utils/formatDate';
import type { PublicSeminar } from '../api/publicApi';

/** "Thời gian" hiển thị của hội nghị: ưu tiên chuỗi nhập tay, sau đó từ ngày – đến ngày. */
export const seminarWhen = (s: Pick<PublicSeminar, 'date_text' | 'start_date' | 'end_date'>) =>
	s.date_text ||
	[s.start_date, s.end_date !== s.start_date ? s.end_date : null]
		.filter(Boolean)
		.map((d) => formatDateOr(d))
		.join(' – ') ||
	'—';
