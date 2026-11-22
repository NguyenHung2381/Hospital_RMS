import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EyeOffSvg, LinkSvg, LockSvg } from '../../../assets/icons';
import { Modal } from '../../../shared/components';
import { CfgField } from '../../../shared/formConfig/CfgField';
import { CustomFields } from '../../../shared/formConfig/CustomFields';
import { resolveForm } from '../../../shared/formConfig/fieldRules';
import type { CustomValues, FormDefinition, FormOverride, ResolvedField } from '../../../shared/formConfig/types';
import { configFromResolved } from '../../../shared/formConfig/useFormConfig';
import { cx } from '../../../shared/utils/cx';
import s from '../pages/FormConfigs.module.css';
import { shortVariant } from '../utils/formConfigHelpers';
import { CUSTOM_SLOT, isFixed, layoutOf, type LayoutSection } from '../utils/formLayouts';
import { sampleInput } from '../utils/sampleInput';

/** Khung xem trước: vẽ theo bố cục thật nếu đã khai báo (formLayouts), không thì xếp dọc. */
function PreviewBody({
	form,
	draft,
	variant,
	focusKey,
	wide,
}: {
	form: FormDefinition;
	draft: FormOverride;
	variant: string;
	focusKey?: string | null;
	wide?: boolean;
}) {
	const [values, setValues] = useState<Record<string, string>>({});
	const [custom, setCustom] = useState<CustomValues>({});
	const [errors, setErrors] = useState<Record<string, string> | null>(null);
	const resolved = useMemo(() => resolveForm(form, draft, variant), [form, draft, variant]);
	const cfg = useMemo(() => configFromResolved(resolved), [resolved]);
	const fields = form.fields.map((f) => resolved.fields[f.key]).filter(Boolean);
	const layout = layoutOf(form.key, variant);
	const bodyRef = useRef<HTMLDivElement>(null);

	// Cuộn riêng khung xem trước (không kéo cả trang) tới trường đang trỏ
	useEffect(() => {
		const body = bodyRef.current;
		const el = focusKey ? body?.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`) : null;
		if (!body || !el) return;
		const top = el.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
		if (top < body.scrollTop || top + el.offsetHeight > body.scrollTop + body.clientHeight)
			body.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
	}, [focusKey]);

	const check = () => {
		const all = Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? '']));
		setErrors(cfg.validate(all, custom));
	};

	const fieldBox = (f: ResolvedField): ReactNode =>
		f.visible ? (
			<div
				key={f.key}
				data-key={f.key}
				className={cx(s.previewField, f.key === focusKey && s.previewFieldFocus)}
			>
				<CfgField
					cfg={cfg}
					name={f.key}
					label={f.label}
					error={errors?.[f.key]}
				>
					{sampleInput(f, values[f.key] ?? '', (v) => setValues((x) => ({ ...x, [f.key]: v })))}
				</CfgField>
			</div>
		) : (
			// Trường đang ẩn: giữ chỗ mờ để thấy vị trí cũ của nó trên form
			<div
				key={f.key}
				data-key={f.key}
				className={cx(s.previewGhost, f.key === focusKey && s.previewFieldFocus)}
				title='Trường đang ẩn — người dùng không thấy ô này'
			>
				<EyeOffSvg /> {f.label} <span>(đang ẩn)</span>
			</div>
		);

	const customBox = (key: string) =>
		cfg.custom.length ? (
			<div
				key={key}
				className={s.previewCustom}
			>
				<CustomFields
					cfg={cfg}
					value={custom}
					onChange={setCustom}
					errors={errors ?? undefined}
					title={null}
				/>
			</div>
		) : (
			<div
				key={key}
				className={s.previewSlot}
			>
				Chỗ của trường tùy chỉnh (chưa có)
			</div>
		);

	const item = (it: string, i: number): ReactNode => {
		if (it === CUSTOM_SLOT) return customBox(`c${i}`);
		if (isFixed(it))
			return (
				<div
					key={`f${i}`}
					className={s.previewFixed}
					title='Ô cố định của form — không cấu hình được'
				>
					<span>{it.slice(1)}</span>
					<span className={s.fixedBox}>
						<LockSvg /> cố định
					</span>
				</div>
			);
		const f = resolved.fields[it];
		return f ? fieldBox(f) : null;
	};

	const renderSection = (sec: LayoutSection, si: number) => {
		const rows = sec.rows
			.map((row) => row.map(item).filter(Boolean))
			.filter((cells) => cells.length)
			.map((cells, ri) => (
				<div
					key={ri}
					className={s.previewRow}
					style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}
				>
					{cells}
				</div>
			));
		if (!rows.length) return null;
		return (
			<section
				key={si}
				className={s.previewGroup}
			>
				{sec.title && (
					<div className={s.previewGroupTitle}>
						{sec.title}
						{sec.note && <span> — {sec.note}</span>}
					</div>
				)}
				{rows}
			</section>
		);
	};

	let content: ReactNode;
	if (layout) {
		const placed = new Set(layout.sections.flatMap((x) => x.rows.flat()));
		const rest = fields.filter((f) => !placed.has(f.key)).map((f) => f.key);
		const sections = [
			...layout.sections,
			...(rest.length ? [{ title: 'Trường khác (chưa xếp vị trí)', rows: rest.map((k) => [k]) }] : []),
			...(placed.has(CUSTOM_SLOT) ? [] : [{ title: 'Thông tin bổ sung', rows: [[CUSTOM_SLOT]] }]),
		];
		content = sections.map(renderSection);
	} else {
		content = (
			<>
				{fields.map(fieldBox)}
				{customBox('custom')}
			</>
		);
	}

	return (
		<>
			<div
				className={cx(s.previewBody, wide && s.previewBodyWide)}
				ref={bodyRef}
			>
				{content}
			</div>
			<div className={s.previewFoot}>
				{errors ? (
					<span className={Object.keys(errors).length ? s.previewBad : s.previewOk}>
						{Object.keys(errors).length ? `${Object.keys(errors).length} lỗi — xem chữ đỏ ở từng ô` : '✓ Hợp lệ'}
					</span>
				) : (
					<span className={s.muted}>Có thể gõ thử vào các ô</span>
				)}
				<button
					type='button'
					className={s.expandBtn}
					onClick={check}
				>
					Thử kiểm tra
				</button>
			</div>
		</>
	);
}

/**
 * Xem trước form theo cấu hình đang sửa (chưa cần lưu): đúng bố cục thật, nút mở
 * form thật, phóng to. `focusKey` = trường đang trỏ ở bảng → tô sáng và cuộn tới.
 */
export function FormPreview({
	form,
	draft,
	focusKey,
}: {
	form: FormDefinition;
	draft: FormOverride;
	focusKey?: string | null;
}) {
	const [variant, setVariant] = useState(form.variants[0].key);
	const [zoom, setZoom] = useState(false);
	const page = layoutOf(form.key, variant)?.page;

	const variantBar = form.variants.length > 1 && (
		<div className={s.segment}>
			{form.variants.map((v) => (
				<button
					key={v.key}
					type='button'
					className={cx(s.segBtn, v.key === variant && s.segBtnOn)}
					title={v.label}
					onClick={() => setVariant(v.key)}
				>
					{shortVariant(v.label)}
				</button>
			))}
		</div>
	);

	return (
		<div className={s.preview}>
			<div className={s.previewBar}>
				{variantBar && <span className={s.previewBarLabel}>Xem như ở form:</span>}
				{variantBar}
				<div className={s.previewActions}>
					{page && (
						<a
							className={s.linkBtn}
							href={page.path}
							target='_blank'
							rel='noreferrer'
							title={page.how ? `${page.how} (mở ở tab mới)` : 'Mở ở tab mới'}
						>
							<LinkSvg /> Mở form thật
						</a>
					)}
					<button
						type='button'
						className={s.linkBtn}
						onClick={() => setZoom(true)}
					>
						⤢ Phóng to
					</button>
				</div>
				{page?.how && <span className={s.previewHow}>Trên trang đó: {page.how}.</span>}
			</div>
			<PreviewBody
				key={variant}
				form={form}
				draft={draft}
				variant={variant}
				focusKey={focusKey}
			/>
			{zoom && (
				<Modal
					open
					onClose={() => setZoom(false)}
					title={`Xem trước: ${form.title}`}
					subtitle={form.variants.find((v) => v.key === variant)?.label}
					size='lg'
				>
					{variantBar && <div className={s.previewBar}>{variantBar}</div>}
					<PreviewBody
						key={`zoom-${variant}`}
						form={form}
						draft={draft}
						variant={variant}
						wide
					/>
				</Modal>
			)}
		</div>
	);
}
