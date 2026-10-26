import { DndContext, type DragEndEvent, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useMemo, useState } from 'react';
import { EditSvg, InfoSvg } from '../../../assets/icons';
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
import { isOverridden, TYPE_LABEL } from '../utils/formConfigHelpers';
import { CustomFieldModal } from '../components/CustomFieldModal';
import { FormPreview } from '../components/FormPreview';
import s from './FormConfigs.module.css';

const MODULE_LABEL: Record<string, string> = {
	RESEARCH: 'Nghiên cứu khoa học',
	TRAINING: 'Đào tạo',
	SEMINAR: 'Hội nghị & CME',
	SURVEY: 'Khảo sát',
	ATTENDANCE: 'Điểm danh',
	SYSTEM: 'Hệ thống',
};

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
	onEdit,
	onDelete,
}: {
	f: CustomFieldDef;
	form: FormDefinition;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: f.key });
	const where = f.variants?.length
		? form.variants
				.filter((v) => f.variants!.includes(v.key))
				.map((v) => v.label)
				.join(', ')
		: 'Mọi form';
	return (
		<div
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cx(s.customRow, isDragging && s.customRowDragging)}
		>
			<button
				type='button'
				className={s.dragHandle}
				title='Kéo để đổi thứ tự'
				{...attributes}
				{...listeners}
			>
				⋮⋮
			</button>
			<div className={s.customMain}>
				<div className={s.fieldName}>
					<span className={s.fieldLabel}>{f.label}</span>
					<span className={s.typeTag}>{TYPE_LABEL[f.type]}</span>
					{f.required && <span className={cx(s.typeTag, s.typeTagReq)}>Bắt buộc</span>}
				</div>
				<div className={s.customSub}>
					{where}
					{f.options?.length ? ` · ${f.options.length} lựa chọn` : ''}
				</div>
			</div>
			<button
				type='button'
				className={s.expandBtn}
				onClick={onEdit}
			>
				Sửa
			</button>
			<button
				type='button'
				className={cx(s.expandBtn, s.dangerBtn)}
				onClick={onDelete}
			>
				Xóa
			</button>
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
						{visibleForms.map((f) => {
							const n = changeCount(normalize(f.override));
							const isDirty = dirtyForms.some((x) => x.key === f.key);
							return (
								<button
									key={f.key}
									type='button'
									className={cx(set.tab, f.key === active && set.tabActive)}
									onClick={() => setActive(f.key)}
								>
									<span className={set.tabIcon}>
										<EditSvg />
									</span>
									<span className={set.tabText}>
										<span className={set.tabTitle}>{f.title}</span>
										<span className={set.tabSub}>
											{MODULE_LABEL[f.module] ?? f.module}
											{n > 0 ? ` · ${n} tùy chỉnh` : ' · mặc định'}
										</span>
									</span>
									{isDirty && (
										<span
											className={set.tabBadge}
											title='Có thay đổi chưa lưu'
										>
											!
										</span>
									)}
								</button>
							);
						})}
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
								</div>
							</div>
							{moduleOff(form.module) && (
								<div className={set.infoNote}>
									<InfoSvg /> Module {MODULE_LABEL[form.module]} đang tắt ở Cấu hình hệ thống — cấu hình vẫn lưu được,
									áp dụng khi bật lại.
								</div>
							)}
							<div className={set.infoNote}>
								<InfoSvg />
								<span>
									Áp dụng cho các form: <b>{form.variants.map((v) => v.label).join(' · ')}</b>. Bấm tên form ở mỗi
									trường để ẩn/hiện riêng ở form đó. Trường gắn nhãn “Hệ thống” cần để tạo bản ghi nên không ẩn / bỏ bắt
									buộc được. Máy chủ kiểm tra lại mọi ràng buộc khi lưu dữ liệu.
								</span>
							</div>

							<div className={s.work}>
								<div className={s.workMain}>
									<Card className={set.groupCard}>
										<div className={set.groupHead}>
											<div>
												<div className={set.groupTitle}>Trường có sẵn</div>
												<p className={set.groupDesc}>
													Ẩn/hiện theo từng form, bật bắt buộc, đổi nhãn và giới hạn giá trị được nhập.
												</p>
											</div>
										</div>
										<div className={s.fieldList}>
											{form.fields.map((f) => (
												<BuiltinFieldRow
													key={f.key}
													form={form}
													field={f}
													override={draft.fields?.[f.key]}
													onChange={(ov) => setField(f.key, ov)}
												/>
											))}
										</div>
									</Card>

									<Card className={set.groupCard}>
										<div className={set.groupHead}>
											<div>
												<div className={set.groupTitle}>Trường tùy chỉnh</div>
												<p className={set.groupDesc}>
													Thêm thông tin riêng của bệnh viện (tối đa 30 trường) — hiện ở cuối form, mục “Thông tin bổ
													sung”. Kéo để đổi thứ tự.
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
																onEdit={() => setEditing(c)}
																onDelete={() => setDeleting(c)}
															/>
														))}
													</div>
												</SortableContext>
											</DndContext>
										) : (
											<div className={s.empty}>Chưa có trường tùy chỉnh nào.</div>
										)}
									</Card>
								</div>

								<aside className={s.workSide}>
									<Card className={set.groupCard}>
										<div className={set.groupHead}>
											<div>
												<div className={set.groupTitle}>Xem trước</div>
												<p className={set.groupDesc}>Theo cấu hình đang sửa, chưa cần lưu.</p>
											</div>
										</div>
										<FormPreview
											key={form.key}
											form={form}
											draft={draft}
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
