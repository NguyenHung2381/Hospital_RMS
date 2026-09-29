import {
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { CHART_COLORS } from '../utils/dashboardHelpers';
import styles from '../pages/Dashboard.module.css';

interface HorizontalBarChartProps {
	title: string;
	subtitle?: string;
	data: { label: string; value: number }[];
	loading: boolean;
	error?: boolean;
	unitLabel?: string;
	labelWidth?: number;
}

// Biểu đồ cột ngang xếp hạng 1 chuỗi số liệu (vd. đề tài theo cấp quản lý).
export function HorizontalBarChart({
	title,
	subtitle,
	data,
	loading,
	error,
	unitLabel = 'bản ghi',
	labelWidth = 150,
}: HorizontalBarChartProps) {
	const hasData = data.some((d) => d.value > 0);

	return (
		<div className={styles.chartCard}>
			<div className={styles.chartCardHeader}>
				<div>
					<div className={styles.chartTitle}>{title}</div>
					{subtitle && <div className={styles.chartSubtitle}>{subtitle}</div>}
				</div>
			</div>
			{loading ? (
				<div
					className={styles.skeleton}
					style={{ height: 260, borderRadius: 12 }}
				/>
			) : error || !hasData ? (
				<div
					style={{
						height: 260,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						color: 'var(--color-gray-400)',
						fontSize: 13,
					}}
				>
					{error ? 'Không tải được dữ liệu' : 'Chưa có dữ liệu'}
				</div>
			) : (
				<ResponsiveContainer
					width='100%'
					height={Math.max(260, data.length * 45)}
				>
					<BarChart
						data={data}
						layout='vertical'
						margin={{ top: 8, right: 28, left: 12, bottom: 4 }}
					>
						<CartesianGrid
							strokeDasharray='3 3'
							stroke='#f0f0f0'
							horizontal={false}
						/>
						<XAxis
							type='number'
							allowDecimals={false}
							tick={{ fontSize: 11, fill: '#9ca3af' }}
							axisLine={false}
							tickLine={false}
						/>
						<YAxis
							type='category'
							dataKey='label'
							width={labelWidth}
							tick={{ fontSize: 12, fill: '#374151' }}
							axisLine={false}
							tickLine={false}
						/>
						<Tooltip
							formatter={(v) => [`${v} ${unitLabel}`, 'Số lượng']}
							contentStyle={{
								borderRadius: 8,
								fontSize: 12,
								border: '1px solid #e5e7eb',
							}}
						/>
						<Bar
							dataKey='value'
							radius={[0, 6, 6, 0]}
							barSize={20}
						>
							{data.map((d, i) => (
								<Cell
									key={d.label}
									fill={CHART_COLORS[i % CHART_COLORS.length]}
								/>
							))}
						</Bar>
					</BarChart>
				</ResponsiveContainer>
			)}
		</div>
	);
}
