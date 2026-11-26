import { FilterSvg } from '@/assets/icons';
import tbl from '@/shared/components/Table/Table.module.css';
import type { TraineeDocState } from '../api/traineeRecordApi';
import type { SimpleItem } from '../hooks/useTrainees';
import { TRAINEE_TYPE_TABS, type useTraineeFilters } from '../hooks/useTraineeFilters';
import type { TraineeFilterCourse } from '../types/trainee.type';
import { DOC_STATE_META, DOC_STATE_ORDER } from '../utils/docState';
import { ENROLLMENT_FILTER_OPTIONS, PROGRESS_FILTER_OPTIONS } from '../utils/enrollmentStatus';
import styles from '../pages/Trainees.module.css';

type Filters = ReturnType<typeof useTraineeFilters>;

const selectCls = (active: boolean, extra = '') =>
	`${tbl.filterSelect} ${active ? tbl.filterActive : ''} ${extra}`.trim();

const monthYear = (d: string | null) => (d ? `${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

/** Nhóm khóa: chưa chọn loại hình thì theo loại, đã chọn thì theo năm khai giảng. */
function groupCourses(courses: TraineeFilterCourse[], byType: boolean) {
	const groups = new Map<string, TraineeFilterCourse[]>();
	for (const c of courses) {
		const key = byType
			? (TRAINEE_TYPE_TABS.find((t) => t.id && t.id === c.training_type_id)?.label ?? 'Khác')
			: (c.start_date?.slice(0, 4) ?? 'Chưa có ngày khai giảng');
		groups.set(key, [...(groups.get(key) ?? []), c]);
	}
	return [...groups];
}

/** Tab loại hình (chỉ ở trang Tất cả học viên) — số học viên tính theo các bộ lọc còn lại. */
export function TraineeTypeTabs({ f, counts }: { f: Filters; counts: Record<string, number> }) {
	return (
		<div
			className={styles.tabsRow}
			role='tablist'
			aria-label='Lọc theo loại hình đào tạo'
		>
			{TRAINEE_TYPE_TABS.map((t) => {
				const active = f.typeKey === t.key;
				return (
					<button
						key={t.key || 'all'}
						type='button'
						role='tab'
						aria-selected={active}
						className={`${styles.tab} ${active ? styles.tabActive : ''}`}
						onClick={() => f.setFilter('loai', t.key)}
					>
						{t.label}
						<span className={styles.tabBadge}>{counts[t.id] ?? 0}</span>
					</button>
				);
			})}
		</div>
	);
}

/** Tầng 1 của thanh lọc: đợt/khóa + năm + nút mở bộ lọc khác. */
export function TraineeScopeFilters({
	f,
	refineOpen,
	refineCount,
	onToggleRefine,
}: {
	f: Filters;
	refineOpen: boolean;
	/** Số bộ lọc tầng 2 đang dùng (kể cả hồ sơ PDF — lọc tại chỗ, không nằm trên URL) */
	refineCount: number;
	onToggleRefine: () => void;
}) {
	const course = f.value('dot');
	const year = f.value('nam');
	const known = f.options.courses.some((c) => c.id === course);
	return (
		<>
			<select
				className={selectCls(!!course, styles.courseSelect)}
				value={course}
				onChange={(e) => f.setFilter('dot', e.target.value)}
				aria-label='Lọc theo đợt / khóa'
				title='Chỉ học viên đã ghi danh đợt / khóa này'
			>
				<option value=''>Tất cả đợt / khóa</option>
				{course && !known && <option value={course}>Đợt / khóa đã chọn</option>}
				{groupCourses(f.options.courses, !f.typeId).map(([label, items]) => (
					<optgroup
						key={label}
						label={label}
					>
						{items.map((c) => (
							<option
								key={c.id}
								value={c.id}
							>
								{c.name}
								{c.start_date ? ` · ${monthYear(c.start_date)}` : ''} ({c.trainee_count})
							</option>
						))}
					</optgroup>
				))}
			</select>
			<select
				className={selectCls(!!year)}
				value={year}
				onChange={(e) => f.setFilter('nam', e.target.value)}
				aria-label='Lọc theo năm'
				title='Năm bắt đầu học / thực hành của lượt ghi danh'
			>
				<option value=''>Tất cả năm</option>
				{year && !f.options.years.includes(Number(year)) && <option value={year}>{year}</option>}
				{f.options.years.map((y) => (
					<option
						key={y}
						value={String(y)}
					>
						Năm {y}
					</option>
				))}
			</select>
			<button
				type='button'
				className={`${styles.moreFiltersBtn} ${refineCount > 0 ? styles.moreFiltersBtnActive : ''}`}
				aria-expanded={refineOpen}
				aria-controls='trainee-refine-filters'
				onClick={onToggleRefine}
			>
				<FilterSvg />
				Bộ lọc khác{refineCount > 0 ? ` (${refineCount})` : ''}
			</button>
		</>
	);
}

/** Tầng 2: trạng thái ghi danh, tiến độ, hình thức học, đối tượng, khoa, hồ sơ PDF. */
export function TraineeRefineFilters({
	f,
	traineeTypes,
	departments,
	docFilter,
	onDocFilter,
	docCounts,
	docTotal,
	onClear,
}: {
	f: Filters;
	traineeTypes: SimpleItem[];
	departments: SimpleItem[];
	docFilter: TraineeDocState | '';
	onDocFilter: (v: TraineeDocState | '') => void;
	docCounts: Record<TraineeDocState, number>;
	docTotal: number;
	onClear: () => void;
}) {
	const pick = (k: Parameters<Filters['setFilter']>[0], label: string, all: string, opts: { value: string; label: string }[]) => (
		<select
			className={selectCls(!!f.value(k))}
			value={f.value(k)}
			onChange={(e) => f.setFilter(k, e.target.value)}
			aria-label={label}
		>
			<option value=''>{all}</option>
			{opts.map((o) => (
				<option
					key={o.value}
					value={o.value}
				>
					{o.label}
				</option>
			))}
		</select>
	);
	const toOpts = (items: SimpleItem[]) => items.map((x) => ({ value: x.id, label: x.name }));
	return (
		<div
			id='trainee-refine-filters'
			className={styles.refineRow}
		>
			{pick('ghidanh', 'Lọc theo trạng thái ghi danh', 'Ghi danh: tất cả', ENROLLMENT_FILTER_OPTIONS)}
			{pick('tiendo', 'Lọc theo tiến độ học', 'Tiến độ: tất cả', PROGRESS_FILTER_OPTIONS)}
			{pick('hinhthuc', 'Lọc theo hình thức học', 'Hình thức học: tất cả', toOpts(f.options.training_forms))}
			{pick('doituong', 'Lọc theo đối tượng học viên', 'Đối tượng: tất cả', toOpts(traineeTypes))}
			{pick('khoa', 'Lọc theo khoa / phòng', 'Khoa / phòng: tất cả', toOpts(departments))}
			<select
				className={selectCls(!!docFilter)}
				value={docFilter}
				onChange={(e) => onDocFilter(e.target.value as TraineeDocState | '')}
				aria-label='Lọc theo hồ sơ PDF'
				title='Lọc theo trạng thái file hồ sơ PDF'
			>
				<option value=''>Hồ sơ: tất cả ({docTotal})</option>
				{DOC_STATE_ORDER.map((st) => (
					<option
						key={st}
						value={st}
					>
						{DOC_STATE_META[st].label} ({docCounts[st]})
					</option>
				))}
			</select>
			<button
				type='button'
				className={styles.clearFiltersBtn}
				onClick={onClear}
			>
				Xóa bộ lọc
			</button>
		</div>
	);
}
