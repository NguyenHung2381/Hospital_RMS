import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircleSvg, ChevDSvg, ChevRSvg } from '@/assets/icons';
import s from './DashKit.module.css';
import { fmt } from './dashKitHelpers';

// Bộ khối dựng dùng chung cho 4 trang dashboard. Nguyên tắc: mỗi số liệu xuất hiện
// đúng một lần; việc đang chờ xử lý nổi lên đầu trang; biểu đồ dùng một màu, chỉ
// tô đậm điểm đáng chú ý (tháng hiện tại, cột đang sắp xếp).

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
			{children}
		</section>
	);
}

/* ─── Cần xử lý ─────────────────────────────────────── */

export interface AttentionItem {
	count: number;
	label: string;
	to: string;
	/** pending = việc đang chờ bạn xử lý (hồng); warn = cần để mắt (vàng); info = sắp tới */
	kind: 'pending' | 'warn' | 'info';
}

export function AttentionStrip({
	items,
	loading,
	error,
}: {
	items: AttentionItem[];
	loading: boolean;
	error?: boolean;
}) {
	const navigate = useNavigate();
	const active = items.filter((i) => i.count > 0);
	const hasPending = active.some((i) => i.kind === 'pending');

	return (
		<section
			className={`${s.attention} ${hasPending ? s.attentionHot : ''}`}
			aria-label='Cần xử lý'
		>
			<h2 className={s.attentionTitle}>Cần xử lý</h2>
			{loading ? (
				<div
					className={s.skeleton}
					style={{ height: 40, flex: 1 }}
				/>
			) : error ? (
				<p className={s.attentionCalm}>Không tải được số liệu.</p>
			) : active.length === 0 ? (
				<p className={s.attentionCalm}>
					<CheckCircleSvg aria-hidden />
					Không có việc tồn đọng
				</p>
			) : (
				<ul className={s.attentionList}>
					{active.map((it) => (
						<li key={it.label}>
							<button
								type='button'
								className={`${s.attentionItem} ${s[`k_${it.kind}`]}`}
								onClick={() => navigate(it.to)}
							>
								<span className={s.attentionCount}>{fmt(it.count)}</span>
								<span className={s.attentionLabel}>{it.label}</span>
								<ChevRSvg
									className={s.attentionChev}
									aria-hidden
								/>
							</button>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

/* ─── Dải chỉ số ────────────────────────────────────── */

export interface KpiItem {
	label: string;
	value: ReactNode;
	context?: ReactNode;
	to?: string;
}

export function KpiBand({ items, loading }: { items: KpiItem[]; loading: boolean }) {
	const navigate = useNavigate();
	return (
		<div
			className={s.kpiBand}
			style={{ ['--kpi-cols' as string]: items.length }}
		>
			{items.map((k) => {
				const body = (
					<>
						<span className={s.kpiLabel}>{k.label}</span>
						{loading ? (
							<span
								className={s.skeleton}
								style={{ height: 32, width: 72 }}
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

/* ─── Hoạt động theo thời gian: các dải cột nhỏ, mỗi dải một thang ─── */

export interface ActivitySeries {
	name: string;
	values: number[];
	unit?: string;
}

interface ActivityRowsProps {
	labels: string[];
	series: ActivitySeries[];
	/** Cột của kỳ hiện tại → tô đậm. Mặc định cột cuối; null = không tô. */
	highlightIndex?: number | null;
	rowHeight?: number;
	totalLabel?: string;
}

export function ActivityRows({
	labels,
	series,
	highlightIndex,
	rowHeight = 44,
	totalLabel = 'Tổng',
}: ActivityRowsProps) {
	const cols = labels.length;
	const hi = highlightIndex === undefined ? cols - 1 : highlightIndex;
	return (
		<div
			className={`${s.activity} ${series.length === 1 ? s.activitySingle : ''}`}
			style={{ ['--cols' as string]: cols, ['--row-h' as string]: `${rowHeight}px` }}
		>
			<div className={s.activityHead}>
				<span />
				<span />
				<span className={s.activityTotalHead}>{totalLabel}</span>
			</div>
			{series.map((se) => {
				const max = Math.max(1, ...se.values);
				const total = se.values.reduce((a, b) => a + b, 0);
				return (
					<div
						key={se.name}
						className={s.activityRow}
					>
						<span className={s.activityName}>{se.name}</span>
						<div
							className={s.activityBars}
							role='img'
							aria-label={`${se.name}: ${se.values
								.map((v, i) => `${labels[i]} ${v}`)
								.join(', ')}`}
						>
							{se.values.map((v, i) => (
								<span
									key={labels[i]}
									className={`${s.bar} ${i === hi ? s.barNow : ''} ${v === 0 ? s.barZero : ''}`}
									style={{ height: v === 0 ? undefined : `${Math.max(6, (v / max) * 100)}%` }}
									data-tip={`${labels[i]}: ${fmt(v)}${se.unit ? ` ${se.unit}` : ''}`}
								/>
							))}
						</div>
						<span className={s.activityTotal}>{fmt(total)}</span>
					</div>
				);
			})}
			<div className={s.activityAxis}>
				<span />
				<div className={s.activityAxisLabels}>
					{labels.map((l) => (
						<span key={l}>{l}</span>
					))}
				</div>
				<span />
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
	const [sortKey, setSortKey] = useState<keyof T & string>(defaultSort);
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
											{active && (
												<ChevDSvg
													className={s.sortIcon}
													aria-hidden
												/>
											)}
										</button>
									</th>
								);
							})}
						</tr>
					</thead>
					<tbody>
						{shown.map((r, i) => (
							<tr key={String(r[nameKey])}>
								<td className={s.rankIdx}>{i + 1}</td>
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
				</button>
			)}
		</>
	);
}

/* ─── Cơ cấu: thanh 100% + bảng chú giải (thay biểu đồ tròn) ─── */

export interface ShareDatum {
	key: string;
	name: string;
	value: number;
	color: string;
}

export function ShareBar({ data, unit }: { data: ShareDatum[]; unit: string }) {
	const items = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
	const total = items.reduce((a, d) => a + d.value, 0);
	return (
		<div className={s.share}>
			<div className={s.shareTotal}>
				<span className={s.shareTotalNum}>{fmt(total)}</span> {unit}
			</div>
			<div
				className={s.shareBar}
				role='img'
				aria-label={items.map((d) => `${d.name} ${d.value}`).join(', ')}
			>
				{items.map((d) => (
					<span
						key={d.key}
						style={{ flexGrow: d.value, background: d.color }}
						data-tip={`${d.name}: ${fmt(d.value)}`}
					/>
				))}
			</div>
			<ul className={s.shareLegend}>
				{items.map((d) => (
					<li key={d.key}>
						<span
							className={s.dot}
							style={{ background: d.color }}
						/>
						<span className={s.shareName}>{d.name}</span>
						<span className={s.shareVal}>{fmt(d.value)}</span>
						<span className={s.sharePct}>{Math.round((d.value / total) * 100)}%</span>
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
					<span
						className={s.rankBarsLabel}
						title={d.label}
					>
						{d.label}
					</span>
					<span className={s.rankBarsTrack}>
						<span
							className={`${s.rankBarsFill} ${d.warn ? s.rankBarsWarn : ''}`}
							style={{ width: `${Math.min(100, (d.value / top) * 100)}%` }}
						/>
					</span>
					<span className={s.rankBarsVal}>{d.display ?? fmt(d.value)}</span>
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
	to?: string;
}

export function ShortList({ items }: { items: ListItem[] }) {
	const navigate = useNavigate();
	return (
		<ul className={s.list}>
			{items.map((it) => {
				const inner = (
					<>
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

