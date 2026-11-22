import { DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { EditSvg, EyeOffSvg, EyeSvg, InfoSvg, LockSvg, TrashSvg } from '../../../assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Button, Card, ConfirmDeleteModal, SearchInput } from '../../../shared/components';
import { resetFormConfig } from '../../../shared/formConfig/useFormConfig';
import type { CustomFieldDef, FieldOverride, FormDefinition, FormOverride } from '../../../shared/formConfig/types';
import { useModules, type ModuleKey } from '../../../shared/hooks/useModules';
import { cx } from '../../../shared/utils/cx';
import { notify } from '../../../shared/utils/feedback';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import { removeDiacritics } from '../../../shared/utils/helper';
import set from '../../settings/pages/SystemSettings.module.css';
import { formConfigApi } from '../api/formConfigApi';
import { BuiltinFieldRow } from '../components/BuiltinFieldRow';
import { FieldDetailDrawer } from '../components/FieldDetailDrawer';
import { fieldState, isOverridden, MODULE_LABEL, shortVariant, TYPE_LABEL } from '../utils/formConfigHelpers';
import { CustomFieldModal } from '../components/CustomFieldModal';
import { FormPreview } from '../components/FormPreview';
import s from './FormConfigs.module.css';

const EMPTY: FormOverride = {};
/** Override gọn để so sánh / lưu: bỏ nhóm rỗng. */
const normalize = (o: FormOverride | null | undefined): FormOverride => {
	const out: FormOverride = {};
	const fields = Object.fromEntries(Object.entries(o?.fields ?? {}).filter(([, v]) => v && Object.keys(v).length));
	if (Object.keys(fields).length) out.fields = fields;
	if (o?.custom?.length) out.custom = o.custom;
	return out;
};
const same = (a: FormOverride, b: FormOverride) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
const changeCount = (o: FormOverride) =>
	Object.values(o.fields ?? {}).filter((f) => isOverridden(f)).length + (o.custom?.length ?? 0);

function CustomRow({
	f,
	form,
	unsaved,
	onEdit,
	onDelete,
}: {
	f: CustomFieldDef;
	form: FormDefinition;
	unsaved: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.key });
	const where = f.variants?.length
		? form.variants
				.filter((v) => f.variants!.includes(v.key))
				.map((v) => shortVariant(v.label))
				.join(', ')
		: form.variants.length > 1
			? 'Mọi form'
			: '';
	const sub = [
		where && `Hiện ở: ${where}`,
		f.options?.length && `${f.options.length} lựa chọn`,
		f.placeholder && `Gợi ý: “${f.placeholder}”`,
		f.hint && `Ghi chú: “${f.hint}”`,
	].filter(Boolean);
	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cx(s.customRow, unsaved && s.tRowUnsaved, isDragging && s.customRowDragging)}
		>
			<button
				type='button'
				className={s.dragHandle}
				title='Kéo để đổi thứ tự'
				aria-label='Kéo để đổi thứ tự'
				{...attributes}
				{...listeners}
			>
				⋮⋮
			</button>
			<div className={s.customMain}>
				<button
					type='button'
					className={s.fieldLabelBtn}
					onClick={onEdit}
				>
					{f.label}
				</button>
				<div className={s.fieldTags}>
					<span className={s.typeTag}>{TYPE_LABEL[f.type]}</span>
					{unsaved && <span className={cx(s.typeTag, s.typeTagUnsaved)}>Chưa lưu</span>}
				</div>
				{sub.length > 0 && <div className={s.changeLine}>{sub.join(' · ')}</div>}
			</div>
			<span className={f.required ? s.reqOn : s.reqOff}>{f.required ? 'Bắt buộc' : 'Không bắt buộc'}</span>
			<button
				type='button'
				className={s.detailBtn}
				onClick={onEdit}
			>
				<EditSvg /> Sửa
			</button>
			<button
				type='button'
				className={cx(s.iconBtn, s.iconBtnDanger)}
				onClick={onDelete}
				title='Xóa trường'
				aria-label={`Xóa trường ${f.label}`}
			>
				<TrashSvg />
			</button>
		</div>
	);
}

type Filter = 'all' | 'changed' | 'hidden' | 'required';
const FILTERS: { key: Filter; label: string }[] = [
	{ key: 'all', label: 'Tất cả' },
	{ key: 'changed', label: 'Đã chỉnh' },
	{ key: 'hidden', label: 'Có ẩn' },
	{ key: 'required', label: 'Bắt buộc' },
];

/** Chú giải ký hiệu của bảng — để không phải đoán. */
function Legend() {
	return (
		<div className={s.legend}>
			<span className={s.legendTitle}>Cách đọc:</span>
			<span className={s.legendItem}>
				<span className={cx(s.pill, s.pillOn)}>
					<EyeSvg /> Hiện
				</span>
				ô có trên form — bấm để ẩn
			</span>
			<span className={s.legendItem}>
				<span className={cx(s.pill, s.pillOff)}>
					<EyeOffSvg /> Ẩn
				</span>
				bị bỏ khỏi form — bấm để hiện lại
			</span>
			<span className={s.legendItem}>
				<span className={cx(s.pill, s.pillLock)}>
					<LockSvg /> Luôn hiện
				</span>
				hệ thống cần, không đổi được
			</span>
			<span className={s.legendItem}>
				<span className={cx(s.swatch, s.swatchCustom)} />
				đã chỉnh khác mặc định
			</span>
			<span className={s.legendItem}>
				<span className={cx(s.swatch, s.swatchUnsaved)} />
				chưa lưu
			</span>
		</div>
	);
}

export default function FormConfigs() {
	const [forms, setForms] = useState<FormDefinition[]>([]);
	const [drafts, setDrafts] = useState<Record<string, FormOverride>>({});
	const [loading, setLoading] = useState(true);
	const [active, setActive] = useState('');
	const [query, setQuery] = useState('');
	const [saving, setSaving] = useState(false);
	const [editing, setEditing] = useState<CustomFieldDef | 'new' | null>(null);
	const [deleting, setDeleting] = useState<CustomFieldDef | null>(null);
	const [confirmReset, setConfirmReset] = useState(false);
	const [filter, setFilter] = useState<Filter>('all');
	const [openField, setOpenField] = useState<string | null>(null);
	const [hoverField, setHoverField] = useState<string | null>(null);
	const modules = useModules();
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

	useEffect(() => {
		formConfigApi
			.list()
			.then((list) => {
				setForms(list);
				setDrafts(Object.fromEntries(list.map((f) => [f.key, normalize(f.override)])));
				setActive((a) => a || list[0]?.key || '');
			})
			.catch(() => notify.error('Không thể tải cấu hình form'))
			.finally(() => setLoading(false));
	}, []);

	const form = forms.find((f) => f.key === active);
	const draft = drafts[active] ?? EMPTY;
	const saved = normalize(form?.override);
	const dirty = !!form && !same(draft, saved);
	const dirtyForms = forms.filter((f) => !same(drafts[f.key] ?? EMPTY, normalize(f.override)));

	const visibleForms = useMemo(() => {
		const q = removeDiacritics(query.trim().toLowerCase());
		if (!q) return forms;
		return forms.filter((f) =>
			removeDiacritics(
				`${f.title} ${f.description ?? ''} ${f.fields.map((x) => x.label).join(' ')}`.toLowerCase(),
			).includes(q),
		);
	}, [forms, query]);

	// Nhóm form theo module ở thanh bên
	const groups = useMemo(() => {
		const map = new Map<string, FormDefinition[]>();
		for (const f of visibleForms) map.set(f.module, [...(map.get(f.module) ?? []), f]);
		return [...map.entries()];
	}, [visibleForms]);

	// Đếm theo bộ lọc — React Compiler tự ghi nhớ, không cần useMemo
	const fieldStats = (() => {
		if (!form)
			return {
				all: 0,
				changed: 0,
				hidden: 0,
				required: 0,
				match: () => true,
			};
		const st = Object.fromEntries(form.fields.map((f) => [f.key, fieldState(form, f, draft.fields?.[f.key])]));
		const is: Record<Filter, (k: string) => boolean> = {
			all: () => true,
			changed: (k) => isOverridden(draft.fields?.[k]),
			hidden: (k) => st[k].variants.some((v) => !st[k].shown(v.key)),
			required: (k) => !st[k].allHidden && st[k].variants.some((v) => st[k].shown(v.key) && st[k].requiredIn(v.key)),
		};
		const count = (fl: Filter) => form.fields.filter((f) => is[fl](f.key)).length;
		return {
			all: form.fields.length,
			changed: count('changed'),
			hidden: count('hidden'),
			required: count('required'),
			match: (k: string) => is[filter](k),
		};
	})();
	const shownFields = form ? form.fields.filter((f) => fieldStats.match(f.key)) : [];
	const fieldUnsaved = (key: string) =>
		JSON.stringify(draft.fields?.[key] ?? null) !== JSON.stringify(saved.fields?.[key] ?? null);
	const customUnsaved = (c: CustomFieldDef) =>
		JSON.stringify(c) !== JSON.stringify(saved.custom?.find((x) => x.key === c.key) ?? null);
	const openDef = form?.fields.find((f) => f.key === openField);

	const setDraft = (next: FormOverride) => setDrafts((d) => ({ ...d, [active]: next }));
	const setField = (key: string, ov: FieldOverride | undefined) => {
		const fields = { ...(draft.fields ?? {}) };
		if (ov) fields[key] = ov;
		else delete fields[key];
		setDraft({ ...draft, fields });
	};
	const custom = draft.custom ?? [];
	const setCustom = (next: CustomFieldDef[]) => setDraft({ ...draft, custom: next });

	const onDragEnd = ({ active: a, over }: DragEndEvent) => {
		if (!over || a.id === over.id) return;
		const from = custom.findIndex((c) => c.key === a.id);
		const to = custom.findIndex((c) => c.key === over.id);
		setCustom(arrayMove(custom, from, to));
	};

	const applySaved = (def: FormDefinition) => {
		setForms((list) => list.map((f) => (f.key === def.key ? def : f)));
		setDrafts((d) => ({ ...d, [def.key]: normalize(def.override) }));
		resetFormConfig();
	};

	const save = async () => {
		if (!form) return;
		setSaving(true);
		try {
			const body = normalize(draft);
			const def = Object.keys(body).length
				? await formConfigApi.save(form.key, body)
				: await formConfigApi.reset(form.key);
			applySaved(def);
			notify.success('Đã lưu cấu hình form — áp dụng ngay cho lần mở form tiếp theo');
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setSaving(false);
		}
	};

	const reset = async () => {
		if (!form) return;
		setConfirmReset(false);
		try {
			applySaved(await formConfigApi.reset(form.key));
			notify.success('Đã khôi phục cấu hình mặc định');
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Khôi phục thất bại');
		}
	};

	// Ctrl+S để lưu như trang Cấu hình hệ thống
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				if (dirty && !saving) void save();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	const moduleOff = (key: string) => modules[key.toLowerCase() as ModuleKey] === false;

	return (
		<AdminLayout
			pageTitle='Cấu hình form'
			pageSubtitle='Chọn trường nào hiện, bắt buộc, cho nhập giá trị gì và thêm trường riêng cho từng form nhập liệu'
		>
			<div className={set.layout}>
				<aside className={set.side}>
					<SearchInput
						value={query}
						onChange={setQuery}
						placeholder='Tìm form hoặc tên trường…'
					/>
					<nav className={set.tabs}>
						{groups.map(([mod, list]) => (
							<div
								key={mod}
								className={s.navGroup}
							>
								<div className={s.navGroupTitle}>{MODULE_LABEL[mod] ?? mod}</div>
								{list.map((f) => {
									const n = changeCount(normalize(f.override));
									const isDirty = dirtyForms.some((x) => x.key === f.key);
									return (
										<button
											key={f.key}
											type='button'
											className={cx(set.tab, s.navTab, f.key === active && set.tabActive)}
											onClick={() => {
												setActive(f.key);
												setOpenField(null);
												setFilter('all');
											}}
										>
											<span className={set.tabText}>
												<span className={set.tabTitle}>{f.title}</span>
												<span className={set.tabSub}>
													{f.variants.length > 1 ? `${f.variants.length} form · ` : ''}
													{f.fields.length} trường
												</span>
											</span>
											{isDirty ? (
												<span
													className={cx(s.navBadge, s.navBadgeUnsaved)}
													title='Có thay đổi chưa lưu'
												>
													Chưa lưu
												</span>
											) : n > 0 ? (
												<span
													className={cx(s.navBadge, s.navBadgeCustom)}
													title={`${n} mục đã chỉnh khác mặc định`}
												>
													{n} chỉnh
												</span>
											) : null}
										</button>
									);
								})}
							</div>
						))}
						{!loading && !visibleForms.length && <div className={s.empty}>Không có form nào khớp.</div>}
					</nav>
				</aside>

				<div className={set.main}>
					{loading ? (
						<div className={set.loading}>Đang tải cấu hình…</div>
					) : !form ? (
						<div className={set.loading}>Chưa có form nào cấu hình được.</div>
					) : (
						<>
							<div className={set.sectionHead}>
								<span className={set.sectionIcon}>
									<EditSvg />
								</span>
								<div>
									<h2 className={set.sectionTitle}>{form.title}</h2>
									<p className={set.sectionSub}>
										{form.description}
										{form.updated_at &&
											` · Sửa lần cuối ${formatDateTimeVN(form.updated_at)}${form.updated_by ? ` (${form.updated_by})` : ''}`}
									</p>
									<div className={s.usedIn}>
										<span>Dùng ở:</span>
										{form.variants.map((v) => (
											<span
												key={v.key}
												className={s.usedInChip}
											>
												{v.label}
											</span>
										))}
									</div>
								</div>
							</div>
							{moduleOff(form.module) && (
								<div className={set.infoNote}>
									<InfoSvg /> Module {MODULE_LABEL[form.module]} đang tắt ở Cấu hình hệ thống — cấu hình vẫn lưu được,
									áp dụng khi bật lại.
								</div>
							)}

							<div className={s.work}>
								<div className={s.workMain}>
									<Card className={set.groupCard}>
										<div className={set.groupHead}>
											<div>
												<div className={set.groupTitle}>Trường có sẵn</div>
												<p className={set.groupDesc}>
													Bấm nút <b>Hiện / Ẩn</b> để bỏ ô khỏi form, gạt <b>Bắt buộc</b> để người dùng phải nhập. Đổi
													nhãn, gợi ý, giới hạn giá trị ở nút <b>Chi tiết</b>.
												</p>
											</div>
										</div>
										<Legend />
										<div className={s.filterBar}>
											<span className={s.muted}>Lọc:</span>
											<div className={s.segment}>
												{FILTERS.map((fl) => (
													<button
														key={fl.key}
														type='button'
														className={cx(s.segBtn, filter === fl.key && s.segBtnOn)}
														onClick={() => setFilter(fl.key)}
													>
														{fl.label}
														<span className={s.segCount}>{fieldStats[fl.key]}</span>
													</button>
												))}
											</div>
										</div>
										<div
											className={s.table}
											style={
												{
													'--cols': `minmax(0, 1fr) repeat(${form.variants.length}, ${form.variants.length > 1 ? 104 : 120}px) 156px 108px`,
												} as CSSProperties
											}
										>
											<div className={s.tHead}>
												<div>Trường thông tin</div>
												{form.variants.map((v) => (
													<div
														key={v.key}
														title={v.label}
													>
														{form.variants.length > 1 ? (
															<>
																<span className={s.tHeadSup}>Hiện ở</span>
																{shortVariant(v.label)}
															</>
														) : (
															'Hiển thị'
														)}
													</div>
												))}
												<div>Bắt buộc nhập</div>
												<div />
											</div>
											{shownFields.map((f) => (
												<BuiltinFieldRow
													key={f.key}
													form={form}
													field={f}
													override={draft.fields?.[f.key]}
													unsaved={fieldUnsaved(f.key)}
													active={openField === f.key || hoverField === f.key}
													onChange={(ov) => setField(f.key, ov)}
													onOpen={() => setOpenField(f.key)}
													onHover={(on) => setHoverField(on ? f.key : null)}
												/>
											))}
											{!shownFields.length && <div className={s.empty}>Không có trường nào ở bộ lọc này.</div>}
										</div>
									</Card>

									<Card className={set.groupCard}>
										<div className={set.groupHead}>
											<div>
												<div className={set.groupTitle}>Trường tùy chỉnh ({custom.length}/30)</div>
												<p className={set.groupDesc}>
													Thêm thông tin riêng của bệnh viện — hiện ở cuối form, mục “Thông tin bổ sung”. Kéo ⋮⋮ để đổi
													thứ tự.
												</p>
											</div>
											<div className={set.groupActions}>
												<Button
													size='sm'
													onClick={() => setEditing('new')}
													disabled={custom.length >= 30}
												>
													+ Thêm trường
												</Button>
											</div>
										</div>
										{custom.length ? (
											<DndContext
												sensors={sensors}
												collisionDetection={closestCenter}
												onDragEnd={onDragEnd}
											>
												<SortableContext
													items={custom.map((c) => c.key)}
													strategy={verticalListSortingStrategy}
												>
													<div className={s.fieldList}>
														{custom.map((c) => (
															<CustomRow
																key={c.key}
																f={c}
																form={form}
																unsaved={customUnsaved(c)}
																onEdit={() => setEditing(c)}
																onDelete={() => setDeleting(c)}
															/>
														))}
													</div>
												</SortableContext>
											</DndContext>
										) : (
											<div className={s.emptyCustom}>
												<span>Chưa có trường tùy chỉnh nào.</span>
												<span className={s.muted}>
													vd: Mã ORCID, Số chứng chỉ hành nghề, Cam kết trung thực… — bấm “+ Thêm trường”.
												</span>
											</div>
										)}
									</Card>
								</div>

								<aside className={s.workSide}>
									<Card className={set.groupCard}>
										<div className={set.groupHead}>
											<div>
												<div className={set.groupTitle}>Xem trước</div>
												<p className={set.groupDesc}>
													Form người dùng sẽ thấy theo cấu hình đang sửa (chưa cần lưu). Rê chuột lên một dòng ở bảng để
													tìm ô đó.
												</p>
											</div>
										</div>
										<FormPreview
											key={form.key}
											form={form}
											draft={draft}
											focusKey={openField ?? hoverField}
										/>
									</Card>
								</aside>
							</div>

							<div className={cx(set.saveBar, dirty && set.saveBarDirty)}>
								<div className={set.saveText}>
									{dirty ? <b>Có thay đổi chưa lưu</b> : <span>Mọi thay đổi đã được lưu</span>}
									{dirtyForms.length > 1 && (
										<span className={set.saveList}>{dirtyForms.length} form có thay đổi chưa lưu</span>
									)}
								</div>
								{form.override && (
									<Button
										variant='ghost'
										onClick={() => setConfirmReset(true)}
									>
										Khôi phục mặc định
									</Button>
								)}
								{dirty && (
									<Button
										variant='ghost'
										onClick={() => setDraft(saved)}
									>
										Hoàn tác
									</Button>
								)}
								<Button
									loading={saving}
									disabled={!dirty}
									onClick={save}
									title='Ctrl + S'
								>
									Lưu cấu hình
								</Button>
							</div>
						</>
					)}
				</div>
			</div>

			{form && openDef && (
				<FieldDetailDrawer
					key={openDef.key}
					form={form}
					field={openDef}
					override={draft.fields?.[openDef.key]}
					onChange={(ov) => setField(openDef.key, ov)}
					onClose={() => setOpenField(null)}
				/>
			)}
			{form && editing && (
				<CustomFieldModal
					form={form}
					initial={editing === 'new' ? null : editing}
					takenKeys={new Set(custom.map((c) => c.key))}
					onClose={() => setEditing(null)}
					onSave={(f) => {
						setCustom(editing === 'new' ? [...custom, f] : custom.map((c) => (c.key === f.key ? f : c)));
						setEditing(null);
					}}
				/>
			)}
			{deleting && (
				<ConfirmDeleteModal
					title='Xóa trường tùy chỉnh'
					subtitle={deleting.label}
					confirmLabel='Xóa trường'
					onClose={() => setDeleting(null)}
					onConfirm={() => {
						setCustom(custom.filter((c) => c.key !== deleting.key));
						setDeleting(null);
					}}
				>
					Trường sẽ không còn hiện trên form sau khi bấm Lưu cấu hình. Giá trị đã nhập trước đây vẫn được giữ trong hệ
					thống.
				</ConfirmDeleteModal>
			)}
			{confirmReset && form && (
				<ConfirmDeleteModal
					title='Khôi phục mặc định'
					subtitle={form.title}
					confirmLabel='Khôi phục'
					onClose={() => setConfirmReset(false)}
					onConfirm={reset}
				>
					Bỏ mọi tùy chỉnh của form này, kể cả trường tùy chỉnh. Giá trị đã nhập vẫn được giữ trong hệ thống.
				</ConfirmDeleteModal>
			)}
		</AdminLayout>
	);
}
