import type { CourseProgramLink, Grade } from '../types/course.type';

export interface ProgramGradeGroup {
	program_id: string | null;
	program_name: string;
	total: number;
	passCount: number;
	failCount: number;
	avgScore: number | null;
}

// Thống kê kết quả học viên theo chương trình đào tạo, trong phạm vi 1 khóa
// học — group phía client từ danh sách điểm đã tải (đủ nhanh vì dữ liệu 1
// khóa học nhỏ). program_id trên mỗi điểm do giáo vụ tự chọn khi nhập điểm,
// không suy ra qua subject_id — xem 2026-09-17_grades_program.
export function groupGradesByProgram(grades: Grade[], programLinks: CourseProgramLink[]): ProgramGradeGroup[] {
	const nameByProgram = new Map(programLinks.map((l) => [l.program_id, l.program_name]));
	const buckets = new Map<string, Grade[]>();
	for (const g of grades) {
		const key = g.program_id ?? '__none__';
		if (!buckets.has(key)) buckets.set(key, []);
		buckets.get(key)!.push(g);
	}

	const groups: ProgramGradeGroup[] = [];
	for (const [key, rows] of buckets) {
		const program_id = key === '__none__' ? null : key;
		const scored = rows.filter((r) => r.score != null);
		const avgScore = scored.length
			? Math.round((scored.reduce((sum, r) => sum + (r.score ?? 0), 0) / scored.length) * 100) / 100
			: null;
		groups.push({
			program_id,
			program_name: program_id ? (nameByProgram.get(program_id) ?? 'Không rõ chương trình') : 'Chưa phân loại chương trình',
			total: rows.length,
			passCount: rows.filter((r) => r.result === 'pass').length,
			failCount: rows.filter((r) => r.result === 'fail').length,
			avgScore,
		});
	}

	return groups.sort((a, b) => {
		if (a.program_id === null) return 1;
		if (b.program_id === null) return -1;
		return a.program_name.localeCompare(b.program_name);
	});
}
