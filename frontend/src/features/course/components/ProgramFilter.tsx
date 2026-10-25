import { SearchableSelect } from '@/shared/components';
import styles from '../pages/Courses.module.css';

/** id lựa chọn "Tất cả chương trình" (value = null). */
const ALL = '*';

/**
 * Lọc theo chương trình của khóa — có ô tìm (gõ mã / tên, không cần dấu) để khóa nhiều chương trình
 * vẫn chọn nhanh. value: null = tất cả; còn lại là id chương trình (hoặc key riêng của nơi dùng).
 */
export function ProgramFilter({
	options,
	value,
	onChange,
	allLabel,
	title,
}: {
	options: { id: string; name: string }[];
	value: string | null;
	onChange: (v: string | null) => void;
	/** Nhãn lựa chọn "tất cả", kèm số đếm: "Tất cả chương trình (6)". */
	allLabel: string;
	title?: string;
}) {
	return (
		<SearchableSelect
			className={`${styles.programFilter} ${value !== null ? styles.programFilterActive : ''}`}
			options={[{ id: ALL, name: allLabel }, ...options]}
			value={value ?? ALL}
			onChange={(id) => onChange(id === ALL ? null : id)}
			placeholder={allLabel}
			searchPlaceholder='Tìm chương trình theo mã hoặc tên…'
			menuMinWidth={440}
			title={title}
		/>
	);
}
