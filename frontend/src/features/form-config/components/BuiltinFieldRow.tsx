import { ChevRSvg, LockSvg } from '../../../assets/icons';
import { inVariant } from '../../../shared/formConfig/fieldRules';
import type { FieldOverride, FormDefinition, RegistryField } from '../../../shared/formConfig/types';
import { cx } from '../../../shared/utils/cx';
import s from '../pages/FormConfigs.module.css';
import {
	cleanOverride,
	describeRules,
	detailCount,
	fieldState,
	isOverridden,
	shortVariant,
	TYPE_LABEL,
	whenLabel,
} from '../utils/formConfigHelpers';
import { RequiredControl, VisibilityButton } from './FieldControls';

/** Nhãn đặc điểm của trường (khóa hệ thống, danh mục, điều kiện…) — chữ rõ nghĩa, kèm giải thích khi rê chuột. */
export function FieldTags({ form, field }: { form: FormDefinition; field: RegistryField }) {
	const editOnlyIn = Array.isArray(field.editOnly)
		? form.variants.filter((v) => inVariant(field.editOnly, v.key)).map((v) => shortVariant(v.label))
		: [];
	return (
		<>
			<span className={s.typeTag}>{TYPE_LABEL[field.type]}</span>
			{field.lock && (
				<span
					className={cx(s.typeTag, s.typeTagLock)}
					title='Hệ thống cần trường này để tạo bản ghi — có giới hạn khi ẩn / bỏ bắt buộc'
				>
					<LockSvg /> Trường hệ thống
				</span>
			)}
			{field.dynamic && (
				<span
					className={s.typeTag}
					title='Danh sách lựa chọn lấy từ danh mục, sửa ở trang Danh mục'
				>
					Lấy từ danh mục
				</span>
			)}
			{field.when && (
				<span
					className={cx(s.typeTag, s.typeTagCond)}
					title='Ô này chỉ xuất hiện trong trường hợp nêu trên'
				>
					{whenLabel(field.when)}
				</span>
			)}
			{field.editOnly === true && (
				<span
					className={cx(s.typeTag, s.typeTagCond)}
					title='Lúc tạo mới không có ô này'
				>
					Chỉ khi sửa
				</span>
			)}
			{editOnlyIn.length > 0 && (
				<span
					className={cx(s.typeTag, s.typeTagCond)}
					title='Lúc tạo mới ở các form này không có ô này'
				>
					Chỉ khi sửa: {editOnlyIn.join(', ')}
				</span>
			)}
		</>
	);
}

/** Một dòng trong bảng "Trường có sẵn". Lưới cột lấy từ biến CSS `--cols` của bảng. */
export function BuiltinFieldRow({
	form,
	field,
	override,
	unsaved,
	active,
	onChange,
	onOpen,
	onHover,
}: {
	form: FormDefinition;
	field: RegistryField;
	override?: FieldOverride;
	/** Khác bản đã lưu */
	unsaved: boolean;
	/** Đang mở chi tiết / đang trỏ */
	active: boolean;
	onChange: (next: FieldOverride | undefined) => void;
	onOpen: () => void;
	onHover: (on: boolean) => void;
}) {
	const ov = override ?? {};
	const set = (patch: Partial<FieldOverride>) => onChange(cleanOverride({ ...ov, ...patch }));
	const st = fieldState(form, field, ov);
	const toggleVariant = (key: string) =>
		set({
			hidden: st.hidden.includes(key) ? st.hidden.filter((h) => h !== key) : [...st.hidden, key],
		});

	const changes: string[] = [
		...(ov.choices?.length
			? [
					`Đổi thành danh sách chọn (${ov.choices.length}): ${ov.choices.slice(0, 3).join(', ')}${ov.choices.length > 3 ? '…' : ''}`,
				]
			: []),
		...(ov.label ? [`Nhãn gốc: “${field.label}”`] : []),
		...(ov.placeholder ? [`Gợi ý: “${ov.placeholder}”`] : []),
		...(ov.hint ? [`Ghi chú: “${ov.hint}”`] : []),
		...describeRules(ov.rules, field.options),
	];
	const nDetail = detailCount(ov);
	const stillRequired =
		st.lockRequiredSome.length > 0 && ov.required === false
			? form.variants.filter((v) => st.lockRequiredSome.includes(v.key)).map((v) => shortVariant(v.label))
			: [];

	return (
		<div
			className={cx(
				s.tRow,
				isOverridden(override) && s.tRowCustom,
				unsaved && s.tRowUnsaved,
				st.allHidden && s.tRowHidden,
				active && s.tRowActive,
			)}
			onMouseEnter={() => onHover(true)}
			onMouseLeave={() => onHover(false)}
		>
			<div className={s.tCellField}>
				<button
					type='button'
					className={s.fieldLabelBtn}
					onClick={onOpen}
					title='Mở chỉnh chi tiết'
				>
					{ov.label || field.label}
				</button>
				<div className={s.fieldTags}>
					<FieldTags
						form={form}
						field={field}
					/>
					{unsaved && <span className={cx(s.typeTag, s.typeTagUnsaved)}>Chưa lưu</span>}
				</div>
				{changes.length > 0 && <div className={s.changeLine}>{changes.join(' · ')}</div>}
				{st.mixedDefault && ov.required === undefined && !st.allHidden && (
					<div className={s.fieldNote}>Mặc định bắt buộc ở: {st.defaultRequiredIn.join(', ')}</div>
				)}
				{stillRequired.length > 0 && <div className={s.fieldNote}>Vẫn bắt buộc ở: {stillRequired.join(', ')}</div>}
			</div>

			{form.variants.map((v) => (
				<div
					key={v.key}
					className={s.tCell}
					data-label={form.variants.length > 1 ? `Hiện ở ${shortVariant(v.label)}:` : 'Hiển thị:'}
				>
					{st.variants.some((x) => x.key === v.key) ? (
						<VisibilityButton
							on={st.shown(v.key)}
							locked={st.lockedVisible(v.key)}
							formLabel={v.label}
							onToggle={() => toggleVariant(v.key)}
						/>
					) : (
						<span
							className={s.muted}
							title='Form này không có trường này'
						>
							—
						</span>
					)}
				</div>
			))}

			<div
				className={s.tCell}
				data-label='Bắt buộc:'
			>
				<RequiredControl
					st={st}
					value={ov.required}
					onChange={(required) => set({ required })}
				/>
			</div>

			<div className={cx(s.tCell, s.tCellEnd)}>
				<button
					type='button'
					className={cx(s.detailBtn, nDetail > 0 && s.detailBtnOn)}
					onClick={onOpen}
					title='Đổi nhãn, gợi ý, ghi chú, giới hạn giá trị'
				>
					Chi tiết
					{nDetail > 0 && <span className={s.detailCount}>{nDetail}</span>}
					<ChevRSvg />
				</button>
			</div>
		</div>
	);
}
