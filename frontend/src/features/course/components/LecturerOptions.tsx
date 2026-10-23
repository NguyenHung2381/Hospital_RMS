import { SearchableSelect } from '@/shared/components';
import type { SearchableOption } from '@/shared/components/Input/SearchableSelect';
import type { LecturerItem } from '../hooks/useCourseDetail';

/** Nhân viên có CCHN chưa là GV — chọn là tự thành GV; đánh dấu để phân biệt trong nhóm khoa. */
const displayName = (l: LecturerItem) => (l.group === 'staff' ? `${l.name} · NV có CCHN` : l.name);

/** Trong 1 nhóm: trình độ cao trước (GS → PGS → TS → CKII → ThS → … xem utils/academicLevel),
 * cùng trình độ thì giảng viên trước nhân viên có CCHN, rồi họ tên A→Z. */
const byLevel = (a: LecturerItem, b: LecturerItem) =>
	a.level - b.level ||
	+(a.group === 'staff') - +(b.group === 'staff') ||
	a.full_name.localeCompare(b.full_name, 'vi');

/** Chia giảng viên theo từng khoa (xếp theo tên khoa; trong khoa xếp theo trình độ), cuối cùng
 * là người chưa gắn khoa và chuyên gia ngoài viện. Nhãn nhóm kèm số người. */
function lecturerGroups(lecturers: LecturerItem[]) {
	const byDept = new Map<string, LecturerItem[]>();
	const noDept: LecturerItem[] = [];
	const external: LecturerItem[] = [];
	for (const l of lecturers) {
		if (l.is_external) external.push(l);
		else if (l.department_name) {
			const list = byDept.get(l.department_name) ?? [];
			list.push(l);
			byDept.set(l.department_name, list);
		} else noDept.push(l);
	}
	return [
		...[...byDept.entries()]
			.sort(([a], [b]) => a.localeCompare(b, 'vi'))
			.map(([dept, items]) => ({ label: dept, items: items.sort(byLevel) })),
		{ label: 'Nội viện — chưa gắn khoa', items: noDept.sort(byLevel) },
		{ label: 'Chuyên gia ngoài viện', items: external.sort(byLevel) },
	]
		.filter((g) => g.items.length > 0)
		.map((g) => ({ ...g, label: `${g.label} (${g.items.length})` }));
}

/** Ô chọn giảng viên có tìm kiếm (gõ tên không dấu, ↑/↓ + Enter), vẫn chia nhóm như trên.
 * `emptyLabel`: dòng đầu để bỏ chọn (value ""); bỏ qua thì không có dòng đó. */
export function LecturerSelect({
	lecturers,
	value,
	onChange,
	placeholder,
	emptyLabel,
	className,
	size,
	disabled,
	title,
}: {
	lecturers: LecturerItem[];
	value: string;
	onChange: (id: string) => void;
	placeholder: string;
	emptyLabel?: string;
	className?: string;
	size?: 'md' | 'sm';
	disabled?: boolean;
	title?: string;
}) {
	const options: SearchableOption[] = [
		...(emptyLabel ? [{ id: '', name: emptyLabel }] : []),
		...lecturerGroups(lecturers).flatMap((g) =>
			g.items.map((l) => ({ id: l.id, name: displayName(l), group: g.label })),
		),
	];
	return (
		<SearchableSelect
			options={options}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			searchPlaceholder='Gõ tên giảng viên, chuyên môn hoặc khoa...'
			menuMinWidth={340}
			className={className}
			size={size}
			disabled={disabled}
			title={title}
		/>
	);
}
