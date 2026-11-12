import { useRef, useState } from 'react';
import { SearchableSelect } from '@/shared/components';
import { useVenueOptions } from '@/features/venue/hooks/useVenueOptions';
import type { Venue } from '@/features/venue/types/venue.type';
import styles from '../pages/Seminar.module.css';
import cs from './SeminarFormModal.module.css';

const describe = (v: Venue) =>
	`${v.name}${v.address ? ` — ${v.address}` : ''}${v.capacity ? ` (${v.capacity} chỗ)` : ''}`;

/**
 * Địa điểm hội thảo: chọn từ danh mục Địa điểm (Quản trị → Địa điểm) hoặc nhập tay.
 * Lưu dạng text (seminars.location) như trước — chọn từ danh mục chỉ điền sẵn tên.
 * - Giá trị không có trong danh mục (dữ liệu cũ, địa điểm của đơn vị ngoài) → ô nhập tay.
 * - Trống: BV tổ chức mặc định chọn danh mục, đơn vị ngoài tổ chức mặc định nhập tay.
 */
export function SeminarLocationField({
	id,
	value,
	onChange,
	hosted,
}: {
	id: string;
	value: string;
	onChange: (v: string) => void;
	/** Bệnh viện tổ chức — địa điểm thường là hội trường/phòng trong danh mục */
	hosted: boolean;
}) {
	// Hội thảo dùng mọi địa điểm đang hoạt động (danh mục chưa có phạm vi riêng cho hội thảo)
	const { venues, others, loaded } = useVenueOptions('training');
	const all = [...venues, ...others]
		.filter((v, i, arr) => arr.findIndex((x) => x.name === v.name) === i)
		.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
	const inCatalog = !!value && all.some((v) => v.name === value);
	// null = tự quyết theo dữ liệu; người dùng bấm chuyển thì giữ lựa chọn đó
	const [manual, setManual] = useState<boolean | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const hasCatalog = loaded && all.length > 0;
	const textMode =
		!hasCatalog || (manual ?? (value ? !inCatalog : !hosted));

	if (textMode) {
		return (
			<>
				<input
					ref={inputRef}
					id={id}
					className={styles.formInput}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder={hosted ? 'VD: Hội trường A, tầng 3' : 'VD: Khách sạn Mường Thanh, TP. Vinh'}
				/>
				{hasCatalog && (
					<span className={styles.hint}>
						{value ? 'Địa điểm ngoài danh mục · ' : 'Nhập tay · '}
						<button
							type='button'
							className={cs.linkBtn}
							onClick={() => {
								setManual(false);
								if (!inCatalog) onChange('');
							}}
						>
							Chọn từ danh mục
						</button>
					</span>
				)}
			</>
		);
	}

	return (
		<>
			<SearchableSelect
				id={id}
				options={[
					{ id: '', name: '— Chưa chọn —' },
					...all.map((v) => ({ id: v.name, name: describe(v) })),
				]}
				value={value}
				onChange={onChange}
				placeholder='— Chọn địa điểm —'
				searchPlaceholder='Tìm hội trường, phòng...'
			/>
			{/* Link riêng (không là 1 lựa chọn) để vẫn thấy khi ô tìm kiếm lọc hết danh sách */}
			<span className={styles.hint}>
				Từ danh mục Địa điểm ·{' '}
				<button
					type='button'
					className={cs.linkBtn}
					onClick={() => {
						setManual(true);
						onChange('');
						// ô nhập tay mount ở lần render sau
						setTimeout(() => inputRef.current?.focus());
					}}
				>
					Nhập địa điểm khác
				</button>
			</span>
		</>
	);
}
