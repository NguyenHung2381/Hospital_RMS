import type { Conclusion, ProgressRating, ProgressTopic } from '../../council/api/councilApi';

export const SESSION_LABELS: Record<string, string> = {
	morning: 'Phiên 1 — Từ 8h00',
	afternoon: 'Phiên 2 — Từ 13h30',
};

export const RATING_CLASS: Record<ProgressRating, string> = {
	on_track: 'ratingOnTrack',
	behind: 'ratingBehind',
	at_risk: 'ratingAtRisk',
};

export const CONCLUSION_CLASS: Record<Conclusion, string> = {
	pass: 'conclusionPass',
	fail: 'conclusionFail',
	revise: 'conclusionRevise',
};

export function fmtSize(bytes: number | null): string {
	if (!bytes) return '';
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase();
	if (ext === 'pdf') return '📕';
	if (ext === 'doc' || ext === 'docx') return '📘';
	if (ext === 'xls' || ext === 'xlsx') return '📗';
	return '📄';
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
