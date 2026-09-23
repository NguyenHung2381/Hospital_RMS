import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Legend,
	Pie,
	PieChart,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import {
	CATEGORY_COLORS,
	DEPT_COLORS,
	STATUS_COLORS,
} from '../utils/dashboardHelpers';
import styles from '../pages/Dashboard.module.css';

function PieTooltip({
	active,
	payload,
}: {
	active?: boolean;
	payload?: { name: string; value: number }[];
}) {
	if (!active || !payload?.length) return null;
	return (
		<div
			style={{
				background: 'var(--color-white)',
				border: '1px solid var(--color-gray-200)',
				borderRadius: 8,
				padding: '8px 12px',
				fontSize: 12,
				boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
			}}
		>
			<strong>{payload[0].name}</strong>: {payload[0].value}
		</div>
	);
}

const CHART_EMPTY_STYLE: React.CSSProperties = {
	height: 240,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	color: 'var(--color-gray-400)',
	fontSize: 13,
};

import type React from 'react';

// ─── Status Pie Chart ─────────────────────────
interface StatusPieChartProps {
	pieData: { name: string; value: number; key: string }[];
	loading: boolean;
	error: boolean;
	title?: string;
	subtitle?: string;
	colors?: Record<string, string>;
	centerLabel?: string;
}

export function StatusPieChart({
	pieData,
	loading,
	error,
	title = 'Cơ cấu đề tài theo trạng thái xử lý',
	subtitle = 'Tỷ lệ phân bổ hồ sơ đề tài trong toàn hệ thống',
	colors = STATUS_COLORS,
	centerLabel = 'đề tài NCKH',
}: StatusPieChartProps) {
	return (
		<div className={styles.chartCard}>
			<div className={styles.chartCardHeader}>
				<div>
					<div className={styles.chartTitle}>{title}</div>
					<div className={styles.chartSubtitle}>{subtitle}</div>
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 260, borderRadius: 12 }}
				/>
			) : error || pieData.length === 0 ? (
				<div style={CHART_EMPTY_STYLE}>
					{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
				</div>
			) : (
				(() => {
					const total = pieData.reduce((sum, d) => sum + d.value, 0);
					return (
						<>
							<div className={styles.chartLegend}>
								{pieData.map((d) => (
									<div
										key={d.key}
										className={styles.legendItem}
									>
										<div
											className={styles.legendDot}
											style={{ background: colors[d.key] }}
										/>
										{d.name} ({d.value} · {Math.round((d.value / total) * 100)}
										%)
									</div>
								))}
							</div>
							<div style={{ position: 'relative' }}>
								<ResponsiveContainer
									width='100%'
									height={200}
								>
									<PieChart>
										<Pie
											data={pieData}
											dataKey='value'
											nameKey='name'
											cx='50%'
											cy='50%'
											innerRadius={50}
											outerRadius={80}
											paddingAngle={3}
											cornerRadius={4}
										>
											{pieData.map((d) => (
												<Cell
													key={d.key}
													fill={colors[d.key]}
												/>
											))}
										</Pie>
										<Tooltip content={<PieTooltip />} />
									</PieChart>
								</ResponsiveContainer>
								<div
									style={{
										position: 'absolute',
										top: '50%',
										left: '50%',
										transform: 'translate(-50%, -50%)',
										textAlign: 'center',
										pointerEvents: 'none',
									}}
								>
									<div
										style={{
											fontSize: 24,
											fontWeight: 700,
											color: 'var(--color-gray-800)',
											lineHeight: 1,
										}}
									>
										{total}
									</div>
									<div
										style={{
											fontSize: 11,
											color: 'var(--color-gray-400)',
											marginTop: 4,
										}}
									>
										{centerLabel}
									</div>
								</div>
							</div>
						</>
					);
				})()
			)}
		</div>
	);
}

// ─── Trend Bar Chart ──────────────────────────
interface TrendBarChartProps {
	trendRows: Record<string, string | number>[];
	trendCats: string[];
	loading: boolean;
	error: boolean;
	title?: string;
	subtitle?: string;
	xKey?: string;
	unitLabel?: string;
}

export function TrendBarChart({
	trendRows,
	trendCats,
	loading,
	error,
	title = 'Xu hướng đăng ký đề tài qua các năm',
	subtitle = 'Số lượng đề tài nghiên cứu phân theo lĩnh vực chuyên môn',
	xKey = 'year',
	unitLabel = 'đề tài',
}: TrendBarChartProps) {
	return (
		<div className={styles.chartCard}>
			<div className={styles.chartCardHeader}>
				<div>
					<div className={styles.chartTitle}>{title}</div>
					<div className={styles.chartSubtitle}>{subtitle}</div>
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 260, borderRadius: 12 }}
				/>
			) : error || trendRows.length === 0 ? (
				<div style={CHART_EMPTY_STYLE}>
					{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
				</div>
			) : (
				<ResponsiveContainer
					width='100%'
					height={260}
				>
					<BarChart
						data={trendRows}
						margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
					>
						<CartesianGrid
							strokeDasharray='3 3'
							stroke='#f0f0f0'
							vertical={false}
						/>
						<XAxis
							dataKey={xKey}
							tick={{ fontSize: 11, fill: '#9ca3af' }}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis
							tick={{ fontSize: 11, fill: '#9ca3af' }}
							axisLine={false}
							tickLine={false}
							allowDecimals={false}
						/>
						<Tooltip
							formatter={(v, name) => [`${v ?? 0} ${unitLabel}`, name]}
							contentStyle={{
								borderRadius: 8,
								fontSize: 12,
								border: '1px solid #e5e7eb',
							}}
						/>
						<Legend
							verticalAlign='top'
							align='right'
							iconType='rect'
							iconSize={10}
							height={32}
							wrapperStyle={{
								fontSize: 11,
								paddingBottom: 10,
								marginTop: -10,
							}}
						/>
						{trendCats.map((cat, i) => (
							<Bar
								key={String(cat)}
								dataKey={String(cat)}
								name={String(cat)}
								stackId='a'
								fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
								radius={
									i === trendCats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
								}
							/>
						))}
					</BarChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}

// ─── Dept Bar Chart ───────────────────────────
interface DeptBarChartProps {
	deptBarData: Record<string, string | number>[];
	deptCats: string[];
	loading: boolean;
	error: boolean;
	title?: string;
	subtitle?: string;
}

export function DeptBarChart({
	deptBarData,
	deptCats,
	loading,
	error,
	title = 'Phân bố đề tài theo Khoa / Phòng ban chủ trì',
	subtitle = 'Thống kê số lượng đề tài và cơ cấu lĩnh vực của các đơn vị',
}: DeptBarChartProps) {
	const minWidth = Math.max(deptBarData.length * 130, 100);
	return (
		<div className={styles.chartCard}>
			<div className={styles.chartCardHeader}>
				<div>
					<div className={styles.chartTitle}>{title}</div>
					<div className={styles.chartSubtitle}>{subtitle}</div>
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 320, borderRadius: 12 }}
				/>
			) : error || deptBarData.length === 0 ? (
				<div style={{ ...CHART_EMPTY_STYLE, height: 320 }}>
					{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
				</div>
			) : (
				<div style={{ overflowX: 'auto' }}>
					<div style={{ minWidth, width: '100%' }}>
						<ResponsiveContainer
							width='100%'
							height={320}
						>
							<BarChart
								data={deptBarData}
								margin={{ top: 8, right: 8, left: -10, bottom: 85 }}
							>
								<CartesianGrid
									strokeDasharray='3 3'
									stroke='#f0f0f0'
									vertical={false}
								/>
								<XAxis
									dataKey='name'
									tick={{ fontSize: 13, fill: '#6b7280' }}
									tickFormatter={(value) =>
										value.length > 22 ? `${value.substring(0, 20)}...` : value
									}
									axisLine={false}
									tickLine={false}
									interval={0}
									angle={-35}
									textAnchor='end'
									height={85}
								/>
								<YAxis
									tick={{ fontSize: 13, fill: '#6b7280' }}
									axisLine={false}
									tickLine={false}
									allowDecimals={false}
								/>
								<Tooltip
									formatter={(v, name) => [`${v ?? 0} đề tài`, name]}
									contentStyle={{
										borderRadius: 8,
										fontSize: 13,
										border: '1px solid #e5e7eb',
									}}
								/>
								<Legend
									verticalAlign='top'
									align='right'
									iconType='rect'
									iconSize={10}
									height={32}
									wrapperStyle={{
										fontSize: 13,
										paddingBottom: 10,
										marginTop: -10,
									}}
								/>
								{deptCats.map((cat, i) => (
									<Bar
										key={String(cat)}
										dataKey={String(cat)}
										name={String(cat)}
										stackId='a'
										fill={DEPT_COLORS[i % DEPT_COLORS.length]}
										radius={
											i === deptCats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]
										}
									/>
								))}
							</BarChart>
						</ResponsiveContainer>
					</div>
				</div>
			)}
		</div>
	);
}
