import type { LecturerItem } from '../hooks/useCourseDetail';

/** Các <option> giảng viên chia 2 nhóm: bác sĩ nội viện / chuyên gia ngoài viện. */
export function LecturerOptions({ lecturers }: { lecturers: LecturerItem[] }) {
	const groups = [
		{ label: 'Bác sĩ nội viện', items: lecturers.filter((l) => !l.is_external) },
		{ label: 'Chuyên gia ngoài viện', items: lecturers.filter((l) => l.is_external) },
	];
	return (
		<>
			{groups
				.filter((g) => g.items.length > 0)
				.map((g) => (
					<optgroup
						key={g.label}
						label={g.label}
					>
						{g.items.map((l) => (
							<option
								key={l.id}
								value={l.id}
							>
								{l.name}
							</option>
						))}
					</optgroup>
				))}
		</>
	);
}
