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
				background: '#fff',
				border: '1px solid #e5e7eb',
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
}

export function StatusPieChart({
	pieData,
	loading,
	error,
}: StatusPieChartProps) {
	return (
		<div className={styles.chartCard}>
			<div className={styles.chartCardHeader}>
				<div>
					<div className={styles.chartTitle}>Phân bố theo trạng thái</div>
					<div className={styles.chartSubtitle}>
						Tỷ lệ các trạng thái đề tài hiện tại
					</div>
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 240, borderRadius: 12 }}
				/>
			) : error || pieData.length === 0 ? (
				<div style={CHART_EMPTY_STYLE}>
					{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
				</div>
			) : (
				<>
					<div className={styles.chartLegend}>
						{pieData.map((d) => (
							<div
								key={d.key}
								className={styles.legendItem}
							>
								<div
									className={styles.legendDot}
									style={{ background: STATUS_COLORS[d.key] }}
								/>
								{d.name} ({d.value})
							</div>
						))}
					</div>
					<ResponsiveContainer
						width='100%'
						height={180}
					>
						<PieChart>
							<Pie
								data={pieData}
								dataKey='value'
								nameKey='name'
								cx='50%'
								cy='50%'
								innerRadius={45}
								outerRadius={72}
								paddingAngle={3}
							>
								{pieData.map((d) => (
									<Cell
										key={d.key}
										fill={STATUS_COLORS[d.key]}
									/>
								))}
							</Pie>
							<Tooltip content={<PieTooltip />} />
						</PieChart>
					</ResponsiveContainer>
				</>
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
}

export function TrendBarChart({
	trendRows,
	trendCats,
	loading,
	error,
}: TrendBarChartProps) {
	return (
		<div className={styles.chartCard}>
			<div className={styles.chartCardHeader}>
				<div>
					<div className={styles.chartTitle}>Xu hướng đăng ký đề tài</div>
					<div className={styles.chartSubtitle}>
						Số đề tài theo phân loại trong từng năm
					</div>
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 240, borderRadius: 12 }}
				/>
			) : error || trendRows.length === 0 ? (
				<div style={CHART_EMPTY_STYLE}>
					{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
				</div>
			) : (
				<ResponsiveContainer
					width='100%'
					height={240}
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
							dataKey='year'
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
							formatter={(v, name) => [`${v ?? 0} đề tài`, name]}
							contentStyle={{
								borderRadius: 8,
								fontSize: 12,
								border: '1px solid #e5e7eb',
							}}
						/>
						<Legend wrapperStyle={{ fontSize: 11 }} />
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
}

export function DeptBarChart({
	deptBarData,
	deptCats,
	loading,
	error,
}: DeptBarChartProps) {
	return (
		<div className={styles.chartCard}>
			<div className={styles.chartCardHeader}>
				<div>
					<div className={styles.chartTitle}>Đề tài theo phòng ban</div>
					<div className={styles.chartSubtitle}>
						Top phòng ban có nhiều đề tài nhất
					</div>
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 220, borderRadius: 12 }}
				/>
			) : error || deptBarData.length === 0 ? (
				<div style={{ ...CHART_EMPTY_STYLE, height: 220 }}>
					{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
				</div>
			) : (
				<ResponsiveContainer
					width='100%'
					height={220}
				>
					<BarChart
						data={deptBarData}
						margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
					>
						<CartesianGrid
							strokeDasharray='3 3'
							stroke='#f0f0f0'
							vertical={false}
						/>
						<XAxis
							dataKey='name'
							tick={{ fontSize: 11, fill: '#9ca3af' }}
							axisLine={false}
							tickLine={false}
							interval={0}
						/>
						<YAxis
							tick={{ fontSize: 11, fill: '#9ca3af' }}
							axisLine={false}
							tickLine={false}
							allowDecimals={false}
						/>
						<Tooltip
							formatter={(v, name) => [`${v ?? 0} đề tài`, name]}
							contentStyle={{
								borderRadius: 8,
								fontSize: 12,
								border: '1px solid #e5e7eb',
							}}
						/>
						<Legend wrapperStyle={{ fontSize: 11 }} />
						{deptCats.map((cat, i) => (
							<Bar
								key={String(cat)}
								dataKey={String(cat)}
								name={String(cat)}
								stackId='a'
								fill={DEPT_COLORS[i % DEPT_COLORS.length]}
								radius={i === deptCats.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
							/>
						))}
					</BarChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}
