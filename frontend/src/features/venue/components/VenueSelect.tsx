import { useVenueOptions } from '../hooks/useVenueOptions';
import type { VenueScope } from '../types/venue.type';

interface VenueSelectProps {
	/** Tên địa điểm — bảng nghiệp vụ lưu text (councils.location, class_sessions.room...). */
	value: string;
	onChange: (name: string) => void;
	scope: Exclude<VenueScope, 'both'>;
	/** Class input của form chứa nó — để ô chọn trông giống các ô khác cùng form. */
	className?: string;
	placeholder?: string;
	disabled?: boolean;
	id?: string;
}

// Ô chọn địa điểm từ danh mục venues (trang Quản trị → Địa điểm). Giá trị cũ
// gõ tay trước khi có danh mục (không khớp mục nào) vẫn được giữ làm 1 option
// để mở form sửa không làm mất dữ liệu.
export function VenueSelect({
	value,
	onChange,
	scope,
	className,
	placeholder = '-- Chọn địa điểm --',
	disabled,
	id,
}: VenueSelectProps) {
	const { venues, loaded } = useVenueOptions(scope);
	// Chưa tải xong vẫn phải hiện giá trị hiện tại (chỉ chưa gắn nhãn "chưa có").
	const notInList = !!value && !venues.some((v) => v.name === value);

	return (
		<select
			id={id}
			className={className}
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
		>
			<option value=''>{placeholder}</option>
			{notInList && (
				<option value={value}>
					{value}
					{loaded ? ' (chưa có trong danh mục)' : ''}
				</option>
			)}
			{venues.map((v) => (
				<option
					key={v.id}
					value={v.name}
				>
					{v.name}
					{v.address ? ` — ${v.address}` : ''}
					{v.capacity ? ` (${v.capacity} chỗ)` : ''}
				</option>
			))}
		</select>
	);
}
