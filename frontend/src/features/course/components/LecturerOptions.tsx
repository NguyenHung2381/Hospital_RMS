import type { LecturerItem } from '../hooks/useCourseDetail';

/** Các <option> giảng viên theo nhóm: GV khoa của chương trình / nhân viên khoa có CCHN
 * (chọn là tự thành GV) / bác sĩ nội viện khác / chuyên gia ngoài viện. */
export function LecturerOptions({ lecturers }: { lecturers: LecturerItem[] }) {
	const dept = [...new Set(lecturers.filter((l) => l.group !== 'other').map((l) => l.department_name))]
		.filter(Boolean)
		.join(', ');
	const other = lecturers.filter((l) => l.group === 'other');
	const groups = [
		{ label: `Giảng viên khoa ${dept}`.trim(), items: lecturers.filter((l) => l.group === 'department') },
		{ label: 'Nhân viên có chứng chỉ hành nghề', items: lecturers.filter((l) => l.group === 'staff') },
		{ label: 'Bác sĩ nội viện', items: other.filter((l) => !l.is_external) },
		{ label: 'Chuyên gia ngoài viện', items: other.filter((l) => l.is_external) },
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
