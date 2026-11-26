import {
	useMemo,
	useState,
	type ComponentType,
	type CSSProperties,
	type ReactNode,
	type SVGProps,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
	AlertSvg,
	CalendarSvg,
	CheckCircleSvg,
	ChevDSvg,
	ChevRSvg,
	ClipboardCheckSvg,
} from '@/assets/icons';
import s from './DashKit.module.css';
import { fmt, niceTicks } from './dashKitHelpers';

// Bộ khối dựng dùng chung cho 4 trang dashboard. Nguyên tắc: mỗi số liệu xuất hiện
// đúng một lần; việc đang chờ xử lý nổi lên đầu trang; biểu đồ một màu (xanh thương
// hiệu), chỉ tô đậm điểm đáng chú ý (kỳ hiện tại, cột đang sắp xếp). Màu chữ luôn là
// màu chữ (xám), màu dữ liệu chỉ nằm trên vạch/thanh/chấm.

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>;
export type DashTone = 'green' | 'blue' | 'teal' | 'amber' | 'pink';

/* ─── Khung ─────────────────────────────────────────── */

interface PanelProps {
	title: string;
	subtitle?: string;
	action?: { label: string; to: string };
	children: ReactNode;
	className?: string;
}

export function Panel({ title, subtitle, action, children, className }: PanelProps) {
	const navigate = useNavigate();
	return (
		<section className={`${s.panel} ${className ?? ''}`}>
			<header className={s.panelHead}>
				<div className={s.panelHeadText}>
					<h2 className={s.panelTitle}>{title}</h2>
					{subtitle && <p className={s.panelSub}>{subtitle}</p>}
				</div>
				{action && (
					<button
						type='button'
						className={s.linkBtn}
						onClick={() => navigate(action.to)}
					>
						{action.label}
						<ChevRSvg aria-hidden />
					</button>
				)}
			</header>
			<div className={s.panelBody}>{children}</div>
		</section>
	);
}

/* ─── Cần xử lý ─────────────────────────────────────── */

export interface AttentionItem {
	action?: string;
	count: number;
	label: string;
	to: string;
	/** pending = việc đang chờ bạn xử lý (hồng); warn = cần để mắt (vàng); info = sắp tới (xanh dương) */
	kind: 'pending' | 'warn' | 'info';
	icon?: SvgIcon;
}

const KIND_ICON: Record<AttentionItem['kind'], SvgIcon> = {
	pending: ClipboardCheckSvg,
	warn: AlertSvg,
	info: CalendarSvg,
};

export function AttentionStrip({
	compactWhenEmpty = false,
	items,
	loading,
	error,
}: {
	compactWhenEmpty?: boolean;
	items: AttentionItem[];
	loading: boolean;
	error?: boolean;
}) {
	const navigate = useNavigate();
	const pendingTotal = items.filter((i) => i.kind === 'pending').reduce((a, i) => a + i.count, 0);
	const anyActive = items.some((i) => i.count > 0 && i.kind !== 'info');

	let status: ReactNode = null;
	if (!loading && !error) {
		status =
			pendingTotal > 0 ? (
				<span className={`${s.statusPill} ${s.statusHot}`}>
					<span
						className={s.pulse}
						aria-hidden
					/>
					{fmt(pendingTotal)} việc đang chờ bạn
				</span>
			) : !anyActive ? (
				<span className={`${s.statusPill} ${s.statusCalm}`}>
					<CheckCircleSvg aria-hidden />
					{compactWhenEmpty ? 'Không có hồ sơ chờ xử lý' : 'Không có việc tồn đọng'}
				</span>
			) : null;
	}

	return (
		<section
			className={s.attention}
			aria-label='Cần xử lý'
		>
			<header className={s.sectionHead}>
				<h2 className={s.sectionTitle}>Cần xử lý</h2>
				{status}
			</header>
			{error ? (
				<p className={s.note}>Không tải được số liệu. Tải lại trang để thử lại.</p>
			) : compactWhenEmpty && !loading && !anyActive ? null : (
				<ul
					className={s.attentionGrid}
					style={{ ['--cols' as string]: Math.max(items.length, 2) } as CSSProperties}
				>
					{items.map((it) => {
						const Icon = it.count === 0 && !loading ? CheckCircleSvg : (it.icon ?? KIND_ICON[it.kind]);
						return (
							<li key={it.label}>
								<button
									type='button'
									className={`${s.aTile} ${s[`k_${it.kind}`]} ${loading ? s.aTileLoading : it.count === 0 ? s.aTileZero : ''}`}
									onClick={() => navigate(it.to)}
								>
									<span className={s.aIcon}>
										<Icon aria-hidden />
									</span>
									<span className={s.aText}>
										{loading ? (
											<span
												className={s.skeleton}
												style={{ height: 28, width: 48 }}
											/>
										) : (
											<span className={s.aCount}>{fmt(it.count)}</span>
										)}
										<span className={s.aLabel}>{it.label}</span>
									</span>
									{it.action && <span className={s.queueAction}>{it.action}</span>}
									<ChevRSvg
										className={s.aChev}
										aria-hidden
									/>
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

/* ─── Thẻ chỉ số ────────────────────────────────────── */

export interface KpiItem {
	label: string;
	value: ReactNode;
	context?: ReactNode;
	to?: string;
	icon?: SvgIcon;
	tone?: DashTone;
}

const KPI_TONES: DashTone[] = ['green', 'blue', 'teal', 'amber'];

export function KpiBand({ items, loading }: { items: KpiItem[]; loading: boolean }) {
	const navigate = useNavigate();
	return (
		<div
			className={s.kpiGrid}
			style={{ ['--kpi-cols' as string]: items.length } as CSSProperties}
		>
			{items.map((k, i) => {
				const Icon = k.icon;
				const tone = k.tone ?? KPI_TONES[i % KPI_TONES.length];
				const body = (
					<>
						<span className={s.kpiHead}>
							{Icon && (
								<span className={`${s.kpiIcon} ${s[`t_${tone}`]}`}>
									<Icon aria-hidden />
								</span>
							)}
							<span className={s.kpiLabel}>{k.label}</span>
							{k.to && (
								<ChevRSvg
									className={s.kpiChev}
									aria-hidden
								/>
							)}
						</span>
						{loading ? (
							<span
								className={s.skeleton}
								style={{ height: 34, width: 88, marginTop: 4 }}
							/>
						) : (
							<span className={s.kpiValue}>{k.value}</span>
						)}
						{k.context && !loading && <span className={s.kpiContext}>{k.context}</span>}
					</>
				);
				return k.to ? (
					<button
						key={k.label}
						type='button'
						className={`${s.kpi} ${s.kpiLink}`}
						onClick={() => navigate(k.to!)}
					>
						{body}
					</button>
				) : (
					<div
						key={k.label}
						className={s.kpi}
					>
						{body}
					</div>
				);
			})}
		</div>
	);
}

/* ─── Biểu đồ cột theo thời gian ─────────────────────
   Nhiều chuỗi khác thang đo → không vẽ chung một trục: chọn từng chuỗi bằng các
   nút phía trên (mỗi nút kèm tổng), biểu đồ vẽ chuỗi đang chọn trên trục riêng. */

export interface ActivitySeries {
	name: string;
	values: number[];
	unit?: string;
}

interface ActivityChartProps {
	labels: string[];
	series: ActivitySeries[];
	/** Cột của kỳ hiện tại → tô đậm. Mặc định cột cuối; null = không tô. */
	highlightIndex?: number | null;
	height?: number;
	totalLabel?: string;
}

export function ActivityChart({
	labels,
	series,
	highlightIndex,
	height = 200,
	totalLabel = 'Tổng',
}: ActivityChartProps) {
	const total = (v: number[]) => v.reduce((a, b) => a + b, 0);
	// Mặc định chọn chuỗi đầu tiên có số liệu, tránh mở ra một biểu đồ trống.
	const [active, setActive] = useState(() => Math.max(0, series.findIndex((se) => total(se.values) > 0)));
	const cur = series[Math.min(active, series.length - 1)];
	const cols = labels.length;
	const hi = highlightIndex === undefined ? cols - 1 : highlightIndex;
	const ticks = niceTicks(Math.max(0, ...cur.values));
	const top = ticks[ticks.length - 1];
	const curTotal = total(cur.values);
	// Không so với kỳ trước: kỳ hiện tại thường mới chạy được một phần nên % giảm gây hiểu nhầm.
	const nowVal = hi !== null && hi >= 0 ? cur.values[hi] : null;

	return (
		<div className={s.chart}>
			{series.length > 1 ? (
				<div
					className={s.seriesTabs}
					role='tablist'
					aria-label='Chọn chỉ số'
				>
					{series.map((se, i) => (
						<button
							key={se.name}
							type='button'
							role='tab'
							aria-selected={i === active}
							title={se.name}
							className={`${s.seriesTab} ${i === active ? s.seriesTabOn : ''}`}
							onClick={() => setActive(i)}
						>
							<span className={s.seriesName}>{se.name}</span>
							<span className={s.seriesTotal}>{fmt(total(se.values))}</span>
						</button>
					))}
				</div>
			) : null}

			<div className={s.chartSummary}>
				<span>
					<span className={s.chartSummaryNum}>{fmt(curTotal)}</span>{' '}
					{cur.unit ?? ''} · {totalLabel.toLowerCase()}
				</span>
				{nowVal !== null && (
					<span className={s.chartSummaryNow}>
						<span className={s.nowDot} />
						{labels[hi!]} (hiện tại): <b>{fmt(nowVal)}</b>
					</span>
				)}
			</div>

			<div
				className={s.plot}
				style={{ ['--cols' as string]: cols, height } as CSSProperties}
				role='img'
				aria-label={`${cur.name}: ${cur.values.map((v, i) => `${labels[i]} ${v}`).join(', ')}`}
			>
				<div
					className={s.yAxis}
					aria-hidden
				>
					{[...ticks].reverse().map((t) => (
						<span key={t}>{fmt(t)}</span>
					))}
				</div>
				<div className={s.plotArea}>
					{curTotal === 0 && <span className={s.plotEmpty}>Chưa có số liệu trong giai đoạn này</span>}
					<div
						className={s.grid}
						aria-hidden
					>
						{ticks.map((t) => (
							<span
								key={t}
								style={{ bottom: `${(t / top) * 100}%` }}
							/>
						))}
					</div>
					<div className={s.cols}>
						{cur.values.map((v, i) => {
							const pct = top > 0 ? (v / top) * 100 : 0;
							return (
								<span
									key={labels[i]}
									className={`${s.col} ${i === hi ? s.colNow : ''}`}
									style={{ ['--pct' as string]: `${pct}%` } as CSSProperties}
									data-tip={`${labels[i]}: ${fmt(v)}${cur.unit ? ` ${cur.unit}` : ''}`}
								>
									{i === hi && v > 0 && <span className={s.colLabel}>{fmt(v)}</span>}
									<span className={`${s.colBar} ${v === 0 ? s.colZero : ''}`} />
								</span>
							);
						})}
					</div>
				</div>
			</div>
			<div
				className={s.xAxis}
				style={{ ['--cols' as string]: cols } as CSSProperties}
				aria-hidden
			>
				{labels.map((l, i) => (
					<span
						key={l}
						className={i === hi ? s.xNow : undefined}
					>
						{l}
					</span>
				))}
			</div>
		</div>
	);
}

/* ─── Bảng xếp hạng: sắp xếp theo cột, thanh ngang nằm ở cột đang sắp xếp ─── */

export interface RankColumn<T> {
	key: keyof T & string;
	label: string;
	/** Hiển thị khác số thô (vd. phần trăm). Sắp xếp vẫn theo giá trị gốc. */
	render?: (row: T) => ReactNode;
}

interface RankTableProps<T> {
	rows: T[];
	nameKey: keyof T & string;
	nameLabel: string;
	columns: RankColumn<T>[];
	defaultSort: keyof T & string;
	limit?: number;
	itemLabel: string;
	caption: string;
}

export function RankTable<T extends Record<string, unknown>>({
	rows,
	nameKey,
	nameLabel,
	columns,
	defaultSort,
	limit = 8,
	itemLabel,
	caption,
}: RankTableProps<T>) {
	// Cột mặc định toàn số 0 → xếp theo cột đầu tiên có số liệu để bảng không trống trơn.
	const [sortKey, setSortKey] = useState<keyof T & string>(() => {
		const has = (k: keyof T & string) => rows.some((r) => Number(r[k] ?? 0) > 0);
		return has(defaultSort) ? defaultSort : (columns.find((c) => has(c.key))?.key ?? defaultSort);
	});
	const [expanded, setExpanded] = useState(false);

	// Hòa nhau thì xếp theo tổng các cột còn lại, để thứ tự vẫn có nghĩa khi nhiều dòng = 0.
	const sorted = useMemo(() => {
		const sum = (r: T) => columns.reduce((a, c) => a + Number(r[c.key] ?? 0), 0);
		return [...rows].sort(
			(a, b) => Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0) || sum(b) - sum(a),
		);
	}, [rows, sortKey, columns]);
	const max = Math.max(1, ...sorted.map((r) => Number(r[sortKey] ?? 0)));
	const shown = expanded ? sorted : sorted.slice(0, limit);

	return (
		<>
			<div className={s.rankWrap}>
				{/* data-mobile-table: giữ dạng bảng (cuộn ngang, ghim cột tên) thay vì đổi thành thẻ trên điện thoại */}
				<table
					className={s.rank}
					data-mobile-table=''
				>
					<caption className={s.srOnly}>{caption}</caption>
					<thead>
						<tr>
							<th
								scope='col'
								className={s.rankIdx}
							>
								#
							</th>
							<th scope='col'>{nameLabel}</th>
							{columns.map((c) => {
								const active = c.key === sortKey;
								return (
									<th
										key={c.key}
										scope='col'
										className={`${s.rankNum} ${active ? s.rankSorted : ''}`}
										aria-sort={active ? 'descending' : 'none'}
									>
										<button
											type='button'
											className={s.sortBtn}
											onClick={() => setSortKey(c.key)}
											title={`Xếp theo ${c.label.toLowerCase()}`}
										>
											{c.label}
											<ChevDSvg
												className={s.sortIcon}
												aria-hidden
											/>
										</button>
									</th>
								);
							})}
						</tr>
					</thead>
					<tbody>
						{shown.map((r, i) => (
							<tr key={String(r[nameKey])}>
								<td className={s.rankIdx}>
									<span className={`${s.rankBadge} ${i < 3 ? s.rankBadgeTop : ''}`}>{i + 1}</span>
								</td>
								<td className={s.rankName}>{String(r[nameKey])}</td>
								{columns.map((c) => {
									const v = Number(r[c.key] ?? 0);
									const content = c.render ? c.render(r) : fmt(v);
									return c.key === sortKey ? (
										<td
											key={c.key}
											className={`${s.rankNum} ${s.rankSorted}`}
										>
											<span className={s.rankBarCell}>
												<span className={s.rankTrack}>
													<span
														className={s.rankFill}
														style={{ width: `${(v / max) * 100}%` }}
													/>
												</span>
												<span className={s.rankVal}>{content}</span>
											</span>
										</td>
									) : (
										<td
											key={c.key}
											className={`${s.rankNum} ${v === 0 && !c.render ? s.rankZero : ''}`}
										>
											{content}
										</td>
									);
								})}
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{sorted.length > limit && (
				<button
					type='button'
					className={s.moreBtn}
					onClick={() => setExpanded((e) => !e)}
					aria-expanded={expanded}
				>
					{expanded ? `Thu gọn về ${limit} ${itemLabel}` : `Xem tất cả ${sorted.length} ${itemLabel}`}
					<ChevDSvg
						className={expanded ? s.moreUp : undefined}
						aria-hidden
					/>
				</button>
			)}
		</>
	);
}

/* ─── Cơ cấu: biểu đồ vành khuyên + chú giải ─── */

export interface ShareDatum {
	key: string;
	name: string;
	value: number;
	color: string;
}

const DONUT_R = 52;
const DONUT_C = 2 * Math.PI * DONUT_R;
const DONUT_GAP = 3; // khe trắng giữa các cung (đơn vị chu vi)
const MAX_SLICES = 6;

export function ShareDonut({ data, unit }: { data: ShareDatum[]; unit: string }) {
	const [hover, setHover] = useState<string | null>(null);

	const items = useMemo(() => {
		const sorted = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
		if (sorted.length <= MAX_SLICES) return sorted;
		// Quá nhiều nhóm → gộp phần đuôi thành "Khác" thay vì sinh thêm màu.
		const head = sorted.slice(0, MAX_SLICES - 1);
		const rest = sorted.slice(MAX_SLICES - 1).reduce((a, d) => a + d.value, 0);
		return [...head, { key: '__other', name: 'Khác', value: rest, color: '#94A3B8' }];
	}, [data]);
	const total = items.reduce((a, d) => a + d.value, 0);
	const focus = items.find((d) => d.key === hover);

	const gap = items.length > 1 ? DONUT_GAP : 0;
	const arcs = items.map((d, i) => {
		const start = items.slice(0, i).reduce((a, x) => a + x.value, 0);
		const len = (d.value / total) * DONUT_C;
		return { d, dash: Math.max(len - gap, 0.8), offset: (start / total) * DONUT_C };
	});

	return (
		<div className={s.donutWrap}>
			<div className={s.donut}>
				<svg
					viewBox='0 0 128 128'
					role='img'
					aria-label={items.map((d) => `${d.name} ${d.value}`).join(', ')}
				>
					<circle
						cx='64'
						cy='64'
						r={DONUT_R}
						className={s.donutTrack}
					/>
					{arcs.map(({ d, dash, offset: off }) => (
						<circle
							key={d.key}
							cx='64'
							cy='64'
							r={DONUT_R}
							className={s.donutArc}
							stroke={d.color}
							strokeDasharray={`${dash} ${DONUT_C - dash}`}
							strokeDashoffset={-off}
							style={{ opacity: hover && hover !== d.key ? 0.3 : 1 }}
							onMouseEnter={() => setHover(d.key)}
							onMouseLeave={() => setHover(null)}
						>
							<title>{`${d.name}: ${fmt(d.value)}`}</title>
						</circle>
					))}
				</svg>
				<div
					className={s.donutCenter}
					aria-hidden
				>
					<span className={s.donutNum}>{fmt(focus ? focus.value : total)}</span>
					<span className={s.donutCap}>
						{focus ? `${Math.round((focus.value / total) * 100)}% · ${unit}` : unit}
					</span>
				</div>
			</div>
			<ul className={s.legend}>
				{items.map((d) => (
					<li
						key={d.key}
						className={hover && hover !== d.key ? s.legendDim : undefined}
						onMouseEnter={() => setHover(d.key)}
						onMouseLeave={() => setHover(null)}
					>
						<span
							className={s.dot}
							style={{ background: d.color }}
						/>
						<span className={s.legendName}>{d.name}</span>
						<span className={s.legendVal}>{fmt(d.value)}</span>
						<span className={s.legendPct}>{Math.round((d.value / total) * 100)}%</span>
					</li>
				))}
			</ul>
		</div>
	);
}

/* ─── Xếp hạng ngắn bằng thanh ngang ─── */

export interface RankBarDatum {
	label: string;
	value: number;
	/** Phần hiển thị bên phải thay cho số thô (vd. "18/20 · 90%") */
	display?: ReactNode;
	/** Tô vàng thanh khi vượt ngưỡng (vd. lớp đã đầy) */
	warn?: boolean;
}

export function RankBars({ data, max }: { data: RankBarDatum[]; max?: number }) {
	const top = max ?? Math.max(1, ...data.map((d) => d.value));
	return (
		<ol className={s.rankBars}>
			{data.map((d) => (
				<li key={d.label}>
					<span className={s.rankBarsTop}>
						<span
							className={s.rankBarsLabel}
							title={d.label}
						>
							{d.label}
						</span>
						<span className={s.rankBarsVal}>{d.display ?? fmt(d.value)}</span>
					</span>
					<span className={s.rankBarsTrack}>
						<span
							className={`${s.rankBarsFill} ${d.warn ? s.rankBarsWarn : ''}`}
							style={{ width: `${Math.min(100, (d.value / top) * 100)}%` }}
						/>
					</span>
				</li>
			))}
		</ol>
	);
}

/* ─── Danh sách ngắn (lịch, nhật ký) ─── */

export interface ListItem {
	id: string;
	title: ReactNode;
	meta?: ReactNode;
	side?: ReactNode;
	sideSub?: ReactNode;
	/** Ngày ISO → ô lịch nhỏ bên trái (ngày + tháng) */
	date?: string | null;
	to?: string;
}

function DateTile({ iso }: { iso: string }) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return null;
	const today = new Date();
	const isToday = d.toDateString() === today.toDateString();
	return (
		<span
			className={`${s.dateTile} ${isToday ? s.dateTileToday : ''}`}
			aria-hidden
		>
			<span className={s.dateTileMonth}>Th{d.getMonth() + 1}</span>
			<span className={s.dateTileDay}>{d.getDate()}</span>
		</span>
	);
}

export function ShortList({ items }: { items: ListItem[] }) {
	const navigate = useNavigate();
	return (
		<ul className={s.list}>
			{items.map((it) => {
				const inner = (
					<>
						{it.date && <DateTile iso={it.date} />}
						<span className={s.listMain}>
							<span className={s.listTitle}>{it.title}</span>
							{it.meta && <span className={s.listMeta}>{it.meta}</span>}
						</span>
						{(it.side || it.sideSub) && (
							<span className={s.listSide}>
								{it.side && <span className={s.listSideMain}>{it.side}</span>}
								{it.sideSub && <span className={s.listSideSub}>{it.sideSub}</span>}
							</span>
						)}
					</>
				);
				return (
					<li key={it.id}>
						{it.to ? (
							<button
								type='button'
								className={`${s.listItem} ${s.listItemLink}`}
								onClick={() => navigate(it.to!)}
							>
								{inner}
							</button>
						) : (
							<div className={s.listItem}>{inner}</div>
						)}
					</li>
				);
			})}
		</ul>
	);
}
