import type { TrainingProgram } from '../types/trainingProgram.type';

/** none = chưa có bài học · short = có bài nhưng thiếu tiết · ok = đủ. */
export type LessonState = 'none' | 'short' | 'ok';
export type LessonStateFilter = 'all' | LessonState;

export const LESSON_STATE_LABELS: Record<LessonState, string> = {
	none: 'Chưa có bài học',
	short: 'Thiếu tiết',
	ok: 'Đủ bài học',
};

export interface LessonStateInfo {
	state: LessonState;
	/** Số tiết lý thuyết còn thiếu (0 = không thiếu). */
	missingTheory: number;
	/** Số tiết thực hành còn thiếu (0 = không thiếu, hoặc phần thực hành tính theo vòng). */
	missingPractice: number;
	/** Chương trình thực hành theo vòng luân khoa: bỏ qua việc so tiết thực hành. */
	byRotation: boolean;
}

type LessonStateInput = Pick<
	TrainingProgram,
	'lesson_count' | 'theory_hours' | 'practice_hours' | 'lesson_theory_hours' | 'lesson_practice_hours' | 'rotation_count'
>;

/**
 * Tình trạng bài học của chương trình (hàm thuần, dùng cho lọc, nhãn và Excel).
 * - Chưa có bài học: lesson_count = 0.
 * - Thiếu tiết: tổng tiết lý thuyết của các bài < theory_hours khai ở chương trình,
 *   hoặc tổng tiết thực hành của các bài < practice_hours (chỉ so khi phần đó khai > 0).
 * - Chương trình có vòng thực hành (GPHN, bài kiểu 'rotation' tính theo thời lượng chứ không theo tiết):
 *   phần thực hành coi là đủ nhờ các vòng nên KHÔNG so tiết thực hành; phần lý thuyết vẫn so như thường.
 */
export function getLessonState(p: LessonStateInput): LessonStateInfo {
	const byRotation = (p.rotation_count ?? 0) > 0;
	if ((p.lesson_count ?? 0) === 0) return { state: 'none', missingTheory: 0, missingPractice: 0, byRotation };
	const missingTheory = Math.max(0, (p.theory_hours ?? 0) - (p.lesson_theory_hours ?? 0));
	const missingPractice = byRotation ? 0 : Math.max(0, (p.practice_hours ?? 0) - (p.lesson_practice_hours ?? 0));
	return {
		state: missingTheory > 0 || missingPractice > 0 ? 'short' : 'ok',
		missingTheory,
		missingPractice,
		byRotation,
	};
}

/** Nhãn ngắn trong bảng: "Chưa có bài học" / "Thiếu 6 tiết"; null khi đủ. */
export const lessonStateBadge = (i: LessonStateInfo): string | null =>
	i.state === 'none'
		? LESSON_STATE_LABELS.none
		: i.state === 'short'
			? `Thiếu ${i.missingTheory + i.missingPractice} tiết`
			: null;

/** Tooltip: lý thuyết x/y tiết, thực hành a/b tiết (bài đã gắn / chương trình khai). */
export const lessonStateTitle = (
	p: Pick<TrainingProgram, 'theory_hours' | 'practice_hours' | 'lesson_theory_hours' | 'lesson_practice_hours'>,
	i: LessonStateInfo,
): string => {
	const theory = `Lý thuyết: ${p.lesson_theory_hours ?? 0}/${p.theory_hours ?? 0} tiết`;
	const practice = i.byRotation
		? 'Thực hành: tính theo vòng thực hành'
		: `Thực hành: ${p.lesson_practice_hours ?? 0}/${p.practice_hours ?? 0} tiết`;
	return i.state === 'none' ? `${LESSON_STATE_LABELS.none}\n${theory}\n${practice}` : `${theory}\n${practice}`;
};
