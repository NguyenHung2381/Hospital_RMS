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
	round: ResearchRound,
	deadlines: RoundDeadline[],
): EditMode {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const regStart = parseDdMmYyyy(round.registration_start_date);
	const regEnd = parseDdMmYyyy(round.registration_end_date);
	const supStart = parseDdMmYyyy(round.supplement_start_date);
	const supEnd = parseDdMmYyyy(round.supplement_end_date);

	console.group('[getEditMode] topic:', topic.id);
	console.log('today         :', today.toLocaleDateString('vi-VN'));
	console.log('topic.status  :', topic.status);
	console.log(
		'reg window    :',
		round.registration_start_date,
		'→',
		round.registration_end_date,
		'| active:',
		!!(regStart && regEnd && today >= regStart && today <= regEnd),
	);
	console.log(
		'sup window    :',
		round.supplement_start_date,
		'→',
		round.supplement_end_date,
		'| active:',
		!!(supStart && supEnd && today >= supStart && today <= supEnd),
	);

	if (regStart && regEnd && today >= regStart && today <= regEnd)
		if (topic.status === 'submitted' || topic.status === 'supplement') {
			console.log('→ full (trong thời gian đăng ký)');
			console.groupEnd();
			return 'full';
		}

	if (supStart && supEnd && today >= supStart && today <= supEnd)
		if (topic.status === 'supplement' || topic.status === 'approved') {
			console.log('→ supplement (trong cửa sổ bổ sung)');
			console.groupEnd();
			return 'supplement';
		}

	// Tìm đợt nộp báo cáo đang hoạt động trước, nếu không có thì lấy đợt nộp báo cáo đầu tiên
	const reportDl =
		deadlines.find((d) => {
			if (d.deadline_type !== 'nop_bao_cao') return false;
			const dlStart = parseDdMmYyyy(d.start_date);
			const dlEnd = parseDdMmYyyy(d.deadline_date);
			const afterStart = !dlStart || today >= dlStart;
			const beforeEnd = !!dlEnd && today <= dlEnd;
			return afterStart && beforeEnd;
		}) || deadlines.find((d) => d.deadline_type === 'nop_bao_cao');

	console.log(
		'nop_bao_cao dl:',
		reportDl
			? `start=${reportDl.start_date ?? 'null'} end=${reportDl.deadline_date}`
			: 'KHÔNG TÌM THẤY deadline nop_bao_cao',
	);

	if (reportDl && topic.status === 'approved') {
		const dlStart = parseDdMmYyyy(reportDl.start_date);
		const dlEnd = parseDdMmYyyy(reportDl.deadline_date);
		const afterStart = !dlStart || today >= dlStart;
		const beforeEnd = !!dlEnd && today <= dlEnd;
		console.log(
			'  dlEnd parsed :',
			dlEnd?.toLocaleDateString('vi-VN') ?? 'null',
			'| today <= dlEnd:',
			beforeEnd,
		);
		console.log(
			'  dlStart check:',
			afterStart ? 'OK' : `chưa đến (start=${reportDl.start_date})`,
		);
		if (beforeEnd && afterStart) {
			console.log('→ file-only');
			console.groupEnd();
			return 'file-only';
		}
		console.log('→ none (deadline nop_bao_cao không còn hiệu lực)');
	} else if (!reportDl) {
		console.log('→ none (không có deadline nop_bao_cao)');
	} else {
		console.log(
			'→ none (topic.status không phải approved, hiện là:',
			topic.status,
			')',
		);
	}

	console.groupEnd();
	return 'none';
}
