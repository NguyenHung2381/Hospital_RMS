// dd/mm/yyyy (API display format) ↔ yyyy-mm-dd (input[type=date])
export function toInputDate(s: string | null | undefined): string {
	if (!s) return '';
	const [d, m, y] = s.split('/');
	if (!d || !m || !y) return '';
	return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Sắp xếp hội đồng theo nhóm chuyên khoa (SPECIALTY_GROUPS) rồi theo số thứ tự "#n" trong tên.
import { SPECIALTY_GROUPS } from '../../department/types/department.type';

const cleanSpecialtyString = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Tên hội đồng dạng "Hội đồng <chuyên khoa> #n" — dùng khi không có sẵn field specialty_group riêng.
export function getSpecialtyFromCouncilName(fullName: string): string {
	let name = fullName.replace(/^Hội\s+đồng\s+/i, '');
	name = name.replace(/\s*#\d+$/, '');
	return name.trim();
}

function specialtyIndex(
	councilName: string,
	specialtyGroup?: string | null,
): number {
	const spec = specialtyGroup ?? getSpecialtyFromCouncilName(councilName);
	const cleaned = cleanSpecialtyString(spec);
	const idx = SPECIALTY_GROUPS.findIndex((g) => cleanSpecialtyString(g) === cleaned);
	return idx !== -1 ? idx : 999;
}

function numberSuffix(name: string): number {
	const match = name.match(/#(\d+)/);
	return match ? parseInt(match[1], 10) : 0;
}

export function compareCouncilsBySpecialty(
	a: { name: string; specialty_group?: string | null },
	b: { name: string; specialty_group?: string | null },
): number {
	const idxA = specialtyIndex(a.name, a.specialty_group);
	const idxB = specialtyIndex(b.name, b.specialty_group);
	if (idxA !== idxB) return idxA - idxB;
	const numA = numberSuffix(a.name);
	const numB = numberSuffix(b.name);
	if (numA !== numB) return numA - numB;
	return a.name.localeCompare(b.name, 'vi');
}

export function sortCouncilsBySpecialty<T extends { name: string; specialty_group?: string | null }>(
	items: T[],
): T[] {
	return [...items].sort(compareCouncilsBySpecialty);
}
