import m from '../../../shared/components/Modal/Modal.module.css';
import type { ResolvedField } from '../../../shared/formConfig/types';

// Ô mẫu cho trường có sẵn — chỉ để nhìn bố cục, nhãn, bắt buộc, gợi ý. Trả
// thẳng phần tử gốc (không bọc component) để CfgField tiêm được placeholder/maxLength.
export function sampleInput(f: ResolvedField, value: string, onChange: (v: string) => void) {
	if (f.type === 'select')
		return (
			<select
				id={f.key}
				className={m.formInput}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			>
				<option value=''>{f.dynamic ? '— Danh sách lấy từ danh mục —' : '— Chọn —'}</option>
				{(f.options ?? []).map((o) => (
					<option
						key={o.value}
						value={o.value}
					>
						{o.label}
					</option>
				))}
			</select>
		);
	if (f.type === 'textarea')
		return (
			<textarea
				id={f.key}
				className={m.formInput}
				rows={2}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
		);
	return (
		<input
			id={f.key}
			className={m.formInput}
			type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	);
}
