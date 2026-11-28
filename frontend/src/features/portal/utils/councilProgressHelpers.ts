import type {
	Conclusion,
	ProgressRating,
	ProgressReview,
	ProgressTopic,
} from '../../council/api/councilApi';
import type { SeatRole } from '../../council/types/council.type';
import { parseDate } from '../../../shared/utils/formatDate';
import { htmlToPlainText } from '../../../shared/utils/sanitizeHtml';
import type { Draft } from '../types/councilProgress.type';

export const SESSION_LABELS: Record<string, string> = {
	morning: 'Phiên 1 — Từ 8h00',
	afternoon: 'Phiên 2 — Từ 13h30',
};

/** Tông màu của từng mức xếp loại / kết luận — dùng chung cho nút chọn, nhãn, chấm màu. */
export const RATING_TONE: Record<ProgressRating, 'green' | 'amber' | 'red'> = {
	on_track: 'green',
	behind: 'amber',
	at_risk: 'red',
};

export const CONCLUSION_TONE: Record<Conclusion, 'green' | 'amber' | 'red'> = {
	pass: 'green',
	revise: 'amber',
	fail: 'red',
};

/** Thứ tự hiển thị kết luận: đạt → chỉnh sửa → không đạt (nhẹ đến nặng). */
export const CONCLUSION_ORDER: Conclusion[] = ['pass', 'revise', 'fail'];

/** Thứ tự các ghế trong hội đồng — đủ 5 ghế, kể cả ghế chưa chấm. */
export const SEAT_ORDER: SeatRole[] = ['chairman', 'secretary', 'reviewer1', 'reviewer2', 'member'];

export function fmtSize(bytes: number | null): string {
	if (!bytes) return '';
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Đuôi file in hoa để làm nhãn định dạng (PDF, DOCX…). */
export function fileExt(fileName: string): string {
	const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
	return (ext ?? '').slice(0, 4).toUpperCase() || 'FILE';
}

// Nhóm đề tài trong một hội đồng theo phiên — hiển thị lần lượt Phiên 1 rồi Phiên 2
const SESSION_ORDER: (string | null)[] = ['morning', 'afternoon', null];

export function groupBySession(councilTopics: ProgressTopic[]) {
	const map = new Map<string | null, ProgressTopic[]>();
	for (const t of councilTopics) {
		const key = t.session ?? null;
		const arr = map.get(key) ?? [];
		arr.push(t);
		map.set(key, arr);
	}
	return SESSION_ORDER.filter((s) => map.has(s)).map((session) => ({
		session,
		items: map.get(session)!,
	}));
}

/** Toàn bộ đề tài theo đúng thứ tự trên danh sách (hội đồng → phiên) — cho nút trước/sau. */
export function flattenInOrder(councils: ProgressTopic[][]): ProgressTopic[] {
	return councils.flatMap((c) => groupBySession(c).flatMap((g) => g.items));
}

export function findMyReview(t: ProgressTopic, userId: string | undefined) {
	return t.reviews.find((r) => r.user_id === userId);
}

export function hasScore(r: ProgressReview | undefined | null): boolean {
	return !!r && (r.rating != null || r.progress_percent != null);
}

/**
 * Phiếu nháp khác bản đã lưu? So tiến độ, xếp loại và chữ của nhận xét (không so HTML —
 * trình soạn thảo tự chuẩn hoá thẻ và link ảnh đã ký nên HTML luôn lệch).
 */
export function isDraftDirty(d: Draft | undefined, mine: ProgressReview | undefined): boolean {
	if (!d) return false;
	const savedPercent = mine?.progress_percent != null ? String(mine.progress_percent) : '';
	if (d.percent.trim() !== savedPercent) return true;
	if ((d.rating || null) !== (mine?.rating ?? null)) return true;
	const a = htmlToPlainText(d.comment ?? '').trim();
	const b = htmlToPlainText(mine?.comment ?? '').trim();
	return a !== b;
}

export type ReviewWindow = 'open' | 'before' | 'after' | 'unscheduled';

/** Phiếu chấm chỉ mở trong ngày họp hội đồng. */
export function reviewWindow(defenseDate: string | null, now = new Date()): ReviewWindow {
	const d = parseDate(defenseDate);
	if (!d) return 'unscheduled';
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	if (d.getTime() === today.getTime()) return 'open';
	return d.getTime() > today.getTime() ? 'before' : 'after';
}

export type ViewKind = 'pdf' | 'word' | 'image' | 'other';

/** Loại xem trước được của file theo đuôi tên (file hội đồng không kèm mime). */
export function viewKind(fileName: string): ViewKind {
	const n = fileName.toLowerCase();
	if (n.endsWith('.pdf')) return 'pdf';
	// .doc (định dạng cũ) docx-preview không đọc được → để tải về
	if (n.endsWith('.docx')) return 'word';
	if (/\.(png|jpe?g|gif|webp|bmp)$/.test(n)) return 'image';
	return 'other';
}
