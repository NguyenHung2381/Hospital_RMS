import type { ResearchRound, RoundStatus } from '../types/round.type';
import type { BadgeTone } from '@/shared/components/Badge/badgeTone';

export const STATUS_CFG: Record<
	RoundStatus,
	{ label: string; tone: BadgeTone; barCls: string }
> = {
	active: { label: 'Đang mở', tone: 'green', barCls: 'barActive' },
	closed: { label: 'Đã đóng', tone: 'gray', barCls: 'barClosed' },
	draft: { label: 'Lên lịch', tone: 'blue', barCls: 'barUpcoming' },
};

export const STATUS_OPTIONS: {
	value: RoundStatus;
	label: string;
	desc: string;
}[] = [
	{ value: 'draft', label: STATUS_CFG.draft.label, desc: 'Chưa mở đăng ký' },
	{ value: 'active', label: STATUS_CFG.active.label, desc: 'Đang nhận đề tài' },
	{ value: 'closed', label: STATUS_CFG.closed.label, desc: 'Kết thúc đợt' },
];

export function calcTimeProgress(start: string, end: string): number {
	const parse = (s: string) => {
		const [d, m, y] = s.split('/').map(Number);
		return new Date(y, m - 1, d).getTime();
	};
	const now = Date.now(),
		s = parse(start),
		e = parse(end);
	if (now <= s) return 0;
	if (now >= e) return 100;
	return Math.round(((now - s) / (e - s)) * 100);
}

export function calcDaysLeft(end: string): number {
	const [d, m, y] = end.split('/').map(Number);
	return Math.max(
		0,
		Math.ceil((new Date(y, m - 1, d).getTime() - Date.now()) / 86400000),
	);
}

export function getProgressColor(pct: number) {
	if (pct >= 80) return '#EF9F27';
	if (pct >= 50) return '#378ADD';
	return '#0A9B4A';
}

export function uniqueYears(rounds: ResearchRound[]) {
	return [...new Set(rounds.map((r) => r.year))].sort((a, b) => b - a);
}

export function toIso(ddmmyyyy: string): string {
	if (!ddmmyyyy) return '';
	const [d, m, y] = ddmmyyyy.split('/');
	return `${y}-${m}-${d}`;
}

export function toInputDate(s: string): string {
	if (!s) return '';
	const [d, m, y] = s.split('/');
	return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function fromInputDate(s: string): string {
	if (!s) return '';
	const [y, m, d] = s.split('-');
	return `${d}/${m}/${y}`;
}
