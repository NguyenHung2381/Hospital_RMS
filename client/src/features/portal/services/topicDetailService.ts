import type {
	ResearchRound,
	RoundDeadline,
} from '../../round/types/round.type';
import type { Topic } from '../../topics/types/topic.type';
import type { EditMode } from '../types/topicDetail.type';

export function fmtDate(iso: string): string {
	return new Date(iso).toLocaleString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

export function parseDdMmYyyy(s: string | null | undefined): Date | null {
	if (!s) return null;
	if (s.includes('/')) {
		const [d, m, y] = s.split('/');
		if (!d || !m || !y) return null;
		const dt = new Date(Number(y), Number(m) - 1, Number(d));
		return isNaN(dt.getTime()) ? null : dt;
	}
	if (s.includes('-')) {
		const parts = s.split('T')[0].split('-');
		if (parts.length === 3) {
			const [y, m, d] = parts;
			const dt = new Date(Number(y), Number(m) - 1, Number(d));
			return isNaN(dt.getTime()) ? null : dt;
		}
	}
	const dt = new Date(s);
	return isNaN(dt.getTime()) ? null : dt;
}

export function getEditMode(
	topic: Topic,
	_round: ResearchRound,
	deadlines: RoundDeadline[],
): EditMode {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// Registration and supplement windows come from round_deadlines (not research_rounds columns)
	const regDl = deadlines.find((d) => d.deadline_type === 'registration' && d.start_date);
	const supDl = deadlines.find((d) => d.deadline_type === 'supplement' && d.start_date);
	const regStart = regDl ? parseDdMmYyyy(regDl.start_date) : null;
	const regEnd = regDl ? parseDdMmYyyy(regDl.deadline_date) : null;
	const supStart = supDl ? parseDdMmYyyy(supDl.start_date) : null;
	const supEnd = supDl ? parseDdMmYyyy(supDl.deadline_date) : null;

	if (regStart && regEnd && today >= regStart && today <= regEnd)
		if (topic.status === 'submitted' || topic.status === 'supplement')
			return 'full';

	if (supStart && supEnd && today >= supStart && today <= supEnd)
		if (topic.status === 'supplement' || topic.status === 'approved')
			return 'supplement';

	const reportDl = deadlines.find((d) => {
		if (d.deadline_type !== 'report_submission') return false;
		const dlStart = parseDdMmYyyy(d.start_date);
		const dlEnd = parseDdMmYyyy(d.deadline_date);
		return (!dlStart || today >= dlStart) && !!dlEnd && today <= dlEnd;
	});

	if (reportDl && topic.status === 'approved') return 'file-only';

	return 'none';
}
