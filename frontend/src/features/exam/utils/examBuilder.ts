import type { ExamQuestion, QuestionType } from '../types/exam.type';

export const QUESTION_TYPE_SHORT: Record<QuestionType, string> = { single_choice: 'TN', essay: 'TL' };
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = { single_choice: 'Trắc nghiệm', essay: 'Tự luận' };

/** Điểm hiển thị kiểu Việt: 2.5 → "2,5" */
export const fmtPoints = (n: number) => String(Math.round(Number(n) * 100) / 100).replace('.', ',');

/** Lấy trộn ngẫu nhiên n phần tử (Fisher–Yates trên bản sao). */
export function sample<T>(list: T[], n: number): T[] {
	const a = [...list];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a.slice(0, Math.max(0, n));
}

/** Tổng hợp số câu / điểm theo loại câu. */
export function tally(questions: Pick<ExamQuestion, 'question_type' | 'points'>[]) {
	const out = { count: 0, points: 0, mc: 0, mcPoints: 0, essay: 0, essayPoints: 0 };
	for (const q of questions) {
		const p = Number(q.points || 0);
		out.count++;
		out.points += p;
		if (q.question_type === 'essay') {
			out.essay++;
			out.essayPoints += p;
		} else {
			out.mc++;
			out.mcPoints += p;
		}
	}
	return out;
}
