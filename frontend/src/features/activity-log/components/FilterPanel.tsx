import { ChevDSvg, FilterSvg, SearchSvg, XSvg } from '@/assets/icons';
import { useState } from 'react';
import { DatePicker, MultiSelect } from '../../../shared/components';
import { DEFAULT_FILTERS, type FilterState, type RangePreset } from '../hooks/useActivityLogs';
import {
	ACTION_OPTIONS,
	DURATION_OPTIONS,
	METHOD_OPTIONS,
	STATUS_OPTIONS,
	formatDateTimeSec,
} from '../utils';
import styles from './FilterPanel.module.css';

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
	{ value: '1h', label: '1 giờ qua' },
	{ value: 'today', label: 'Hôm nay' },
	{ value: '24h', label: '24 giờ qua' },
	{ value: '7d', label: '7 ngày qua' },
	{ value: '30d', label: '30 ngày qua' },
	{ value: 'custom', label: 'Tự chọn ngày…' },
];

const ACTOR_TYPE_OPTIONS = [
	{ value: 'user', label: 'Đã đăng nhập' },
	{ value: 'anonymous', label: 'Chưa đăng nhập (ẩn danh)' },
];

const WRITE_ACTIONS = ['create', 'update', 'delete', 'execute'];
const AUTH_ACTIONS = ['login', 'login_failed', 'logout'];

const sameSet = (a: string[], b: string[]) =>
	a.length === b.length && a.every((x) => b.includes(x));

interface QuickFilter {
	label: string;
	isOn: (f: FilterState) => boolean;
	on: Partial<FilterState>;
	off: Partial<FilterState>;
}

const QUICK_FILTERS: QuickFilter[] = [
	{
		label: 'Thay đổi dữ liệu',
		isOn: (f) => sameSet(f.action, WRITE_ACTIONS),
		on: { action: WRITE_ACTIONS },
		off: { action: [] },
	},
	{
		label: 'Xoá dữ liệu',
		isOn: (f) => sameSet(f.action, ['delete']),
		on: { action: ['delete'] },
		off: { action: [] },
	},
	{
		label: 'Đăng nhập / đăng xuất',
		isOn: (f) => sameSet(f.action, AUTH_ACTIONS),
		on: { action: AUTH_ACTIONS },
		off: { action: [] },
	},
	{
		label: 'Đăng nhập thất bại',
		isOn: (f) => sameSet(f.action, ['login_failed']),
		on: { action: ['login_failed'] },
		off: { action: [] },
	},
	{
		label: 'Có lỗi',
		isOn: (f) => f.status === 'error',
		on: { status: 'error' },
		off: { status: '' },
	},
	{
		label: 'Lỗi hệ thống',
		isOn: (f) => f.status === '5xx',
		on: { status: '5xx' },
		off: { status: '' },
	},
	{
		label: 'Không có quyền',
		isOn: (f) => f.status === '403',
		on: { status: '403' },
		off: { status: '' },
	},
	{
		label: 'Chậm ≥ 1 giây',
		isOn: (f) => f.minDuration === '1000',
		on: { minDuration: '1000' },
		off: { minDuration: '' },
	},
];

interface Props {
	filters: FilterState;
	patch: (p: Partial<FilterState>) => void;
	reset: () => void;
	moduleOptions: [string, string][];
}

const labelOf = (opts: { value: string; label: string }[], v: string) =>
	opts.find((o) => o.value === v)?.label ?? v;

export function FilterPanel({ filters, patch, reset, moduleOptions }: Props) {
	const [showAdvanced, setShowAdvanced] = useState(true);
	const moduleMap = Object.fromEntries(moduleOptions);

	// Các điều kiện đang áp dụng — hiển thị thành thẻ, bấm × để gỡ từng cái.
	const tags: { key: string; label: string; clear: Partial<FilterState> }[] = [];
	if (filters.range !== DEFAULT_FILTERS.range) {
		const rangeLabel =
			filters.range === 'exact'
				? `${formatDateTimeSec(filters.fromIso)} → ${formatDateTimeSec(filters.toIso)}`
				: filters.range === 'custom'
					? `${filters.fromDate || '…'} → ${filters.toDate || '…'}`
					: labelOf(RANGE_OPTIONS, filters.range);
		tags.push({ key: 'range', label: `Thời gian: ${rangeLabel}`, clear: { range: DEFAULT_FILTERS.range } });
	}
	if (filters.actor) tags.push({ key: 'actor', label: `Người dùng: ${filters.actor}`, clear: { actor: '' } });
	if (filters.search) tags.push({ key: 'search', label: `Từ khoá: ${filters.search}`, clear: { search: '' } });
	for (const a of filters.action)
		tags.push({
			key: `action-${a}`,
			label: labelOf(ACTION_OPTIONS, a),
			clear: { action: filters.action.filter((x) => x !== a) },
		});
	for (const m of filters.module)
		tags.push({
			key: `module-${m}`,
			label: `Phân hệ: ${moduleMap[m] ?? m}`,
			clear: { module: filters.module.filter((x) => x !== m) },
		});
	for (const m of filters.method)
		tags.push({
			key: `method-${m}`,
			label: m,
			clear: { method: filters.method.filter((x) => x !== m) },
		});
	if (filters.status)
		tags.push({ key: 'status', label: labelOf(STATUS_OPTIONS, filters.status), clear: { status: '' } });
	if (filters.minDuration)
		tags.push({
			key: 'dur',
			label: `Xử lý ${labelOf(DURATION_OPTIONS, filters.minDuration)}`,
			clear: { minDuration: '' },
		});
	if (filters.actorType)
		tags.push({ key: 'atype', label: labelOf(ACTOR_TYPE_OPTIONS, filters.actorType), clear: { actorType: '' } });
	if (filters.ip) tags.push({ key: 'ip', label: `IP: ${filters.ip}`, clear: { ip: '' } });
	if (filters.excludeViews) tags.push({ key: 'ev', label: 'Ẩn thao tác xem', clear: { excludeViews: false } });

	const advancedCount = [
		filters.action.length,
		filters.module.length,
		filters.method.length,
		filters.status,
		filters.minDuration,
		filters.actorType,
		filters.ip,
		filters.excludeViews,
	].filter(Boolean).length;

	return (
		<div className={styles.panel}>
			{/* Hàng 1: thời gian + 2 ô tìm kiếm chính */}
			<div className={styles.mainRow}>
				<div className={styles.rangeGroup}>
					<select
						className={styles.control}
						value={filters.range}
						onChange={(e) => patch({ range: e.target.value as RangePreset })}
						aria-label='Khoảng thời gian'
					>
						{filters.range === 'exact' && <option value='exact'>Khung giờ của phiên</option>}
						{RANGE_OPTIONS.map((o) => (
							<option
								key={o.value}
								value={o.value}
							>
								{o.label}
							</option>
						))}
					</select>
					{filters.range === 'custom' && (
						<>
							<DatePicker
								value={filters.fromDate}
								onChange={(v) => patch({ fromDate: v })}
								placeholder='Từ ngày'
								max={filters.toDate || undefined}
								className={styles.date}
							/>
							<span className={styles.arrow}>→</span>
							<DatePicker
								value={filters.toDate}
								onChange={(v) => patch({ toDate: v })}
								placeholder='Đến ngày'
								min={filters.fromDate || undefined}
								className={styles.date}
							/>
						</>
					)}
				</div>
				<label className={styles.search}>
					<SearchSvg className={styles.searchIcon} />
					<input
						placeholder='Người dùng: mã NV, tài khoản, họ tên…'
						value={filters.actor}
						onChange={(e) => patch({ actor: e.target.value })}
					/>
				</label>
				<label className={styles.search}>
					<SearchSvg className={styles.searchIcon} />
					<input
						placeholder='Từ khoá: đường dẫn, nội dung gửi lên, lỗi…'
						value={filters.search}
						onChange={(e) => patch({ search: e.target.value })}
					/>
				</label>
				<button
					type='button'
					className={`${styles.advancedBtn} ${showAdvanced ? styles.advancedBtnOn : ''}`}
					onClick={() => setShowAdvanced((v) => !v)}
				>
					<FilterSvg style={{ width: 14, height: 14 }} />
					Bộ lọc nâng cao
					{advancedCount > 0 && <span className={styles.countBadge}>{advancedCount}</span>}
					<ChevDSvg
						style={{
							width: 12,
							height: 12,
							transform: showAdvanced ? 'rotate(180deg)' : undefined,
							transition: 'transform .15s',
						}}
					/>
				</button>
			</div>

			{/* Hàng 2: lọc nhanh */}
			<div className={styles.quickRow}>
				<span className={styles.quickLabel}>Lọc nhanh</span>
				{QUICK_FILTERS.map((q) => {
					const on = q.isOn(filters);
					return (
						<button
							key={q.label}
							type='button'
							className={`${styles.quickChip} ${on ? styles.quickChipOn : ''}`}
							onClick={() => patch(on ? q.off : q.on)}
							aria-pressed={on}
						>
							{q.label}
						</button>
					);
				})}
			</div>

			{/* Bộ lọc nâng cao: lưới có nhãn */}
			{showAdvanced && (
				<div className={styles.grid}>
					<div className={styles.field}>
						<span className={styles.label}>Hành động</span>
						<MultiSelect
							className={styles.ms}
							options={ACTION_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
							selected={new Set(filters.action)}
							onChange={(s) => patch({ action: [...s] })}
							placeholder='Tất cả'
						/>
					</div>
					<div className={styles.field}>
						<span className={styles.label}>Phân hệ</span>
						<MultiSelect
							className={styles.ms}
							options={moduleOptions.map(([id, label]) => ({ id, label }))}
							selected={new Set(filters.module)}
							onChange={(s) => patch({ module: [...s] })}
							placeholder='Tất cả'
							searchable
						/>
					</div>
					<div className={styles.field}>
						<span className={styles.label}>Phương thức</span>
						<MultiSelect
							className={styles.ms}
							options={METHOD_OPTIONS.map((o) => ({ id: o.value, label: o.label }))}
							selected={new Set(filters.method)}
							onChange={(s) => patch({ method: [...s] })}
							placeholder='Tất cả'
						/>
					</div>
					<div className={styles.field}>
						<span className={styles.label}>Kết quả</span>
						<select
							className={`${styles.control} ${filters.status ? styles.controlOn : ''}`}
							value={filters.status}
							onChange={(e) => patch({ status: e.target.value })}
						>
							<option value=''>Tất cả</option>
							{STATUS_OPTIONS.map((o) => (
								<option
									key={o.value}
									value={o.value}
								>
									{o.label}
								</option>
							))}
						</select>
					</div>
					<div className={styles.field}>
						<span className={styles.label}>Thời gian xử lý</span>
						<select
							className={`${styles.control} ${filters.minDuration ? styles.controlOn : ''}`}
							value={filters.minDuration}
							onChange={(e) => patch({ minDuration: e.target.value })}
						>
							<option value=''>Tất cả</option>
							{DURATION_OPTIONS.map((o) => (
								<option
									key={o.value}
									value={o.value}
								>
									{o.label}
								</option>
							))}
						</select>
					</div>
					<div className={styles.field}>
						<span className={styles.label}>Loại tài khoản</span>
						<select
							className={`${styles.control} ${filters.actorType ? styles.controlOn : ''}`}
							value={filters.actorType}
							onChange={(e) => patch({ actorType: e.target.value as FilterState['actorType'] })}
						>
							<option value=''>Tất cả</option>
							{ACTOR_TYPE_OPTIONS.map((o) => (
								<option
									key={o.value}
									value={o.value}
								>
									{o.label}
								</option>
							))}
						</select>
					</div>
					<div className={styles.field}>
						<span className={styles.label}>Địa chỉ IP</span>
						<input
							className={`${styles.control} ${filters.ip ? styles.controlOn : ''}`}
							placeholder='vd 10.0.0.'
							value={filters.ip}
							onChange={(e) => patch({ ip: e.target.value })}
						/>
					</div>
					<div className={`${styles.field} ${styles.fieldCheck}`}>
						<label className={styles.check}>
							<input
								type='checkbox'
								checked={filters.excludeViews}
								onChange={(e) => patch({ excludeViews: e.target.checked })}
							/>
							Ẩn thao tác chỉ xem
						</label>
					</div>
				</div>
			)}

			{/* Điều kiện đang áp dụng */}
			{tags.length > 0 && (
				<div className={styles.tagRow}>
					<span className={styles.quickLabel}>Đang lọc</span>
					{tags.map((t) => (
						<span
							key={t.key}
							className={styles.tag}
						>
							{t.label}
							<button
								type='button'
								onClick={() => patch(t.clear)}
								aria-label={`Bỏ ${t.label}`}
							>
								<XSvg style={{ width: 10, height: 10 }} />
							</button>
						</span>
					))}
					<button
						type='button'
						className={styles.clearAll}
						onClick={reset}
					>
						Xoá tất cả
					</button>
				</div>
			)}
		</div>
	);
}
