import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
	BarChartSvg,
	CalendarSvg,
	CheckCircleSvg,
	ClipboardSvg,
	ClockSvg,
	FileTextSvg,
	TopicSvg,
	XCircleSvg,
} from '@/assets/icons';
import { Button, Modal } from '@/shared/components';
import { FormField } from '@/shared/components/Input/FormField';
import { saveBlob } from '@/shared/utils/saveBlob';
import m from '@/shared/components/Modal/Modal.module.css';
import { MetricCard } from '../../dashboard/components/MetricCard';
import dash from '../../dashboard/pages/Dashboard.module.css';
import {
	exportTopicsExcel,
	exportTopicsReport,
	getDepts,
	getRounds,
	getTopics,
	getTopicsExportData,
	type ReportSection,
	type SimpleItem,
} from '../../topics/api/topicApi';
import { exportResearchStats, getResearchStats, type StatsExportSection } from '../api/reportApi';
import { useYearData } from '../hooks/useYearData';
import {
	buildFinalHtml,
	buildScheduleHtml,
	buildSummaryHtml,
	DEFAULT_COLS,
	defaultScheduleOpts,
	FINAL_SECTIONS,
	openPrint,
	STATS_EXPORT_SECTIONS,
	STATUS_OPTIONS,
	SUMMARY_COLS,
	type ScheduleOpts,
	type SummaryColKey,
} from '../utils/reportHelpers';
import styles from '../pages/Reports.module.css';
import { CheckListModal, ReportCard } from './ReportCard';

type OptionsModal = 'summary' | 'schedule' | 'final' | 'stats' | null;

export function ResearchReports({ year }: { year: number }) {
	const { data: stats, error } = useYearData(getResearchStats, year);

	// Bộ lọc đề tài cho 3 mẫu xuất danh sách
	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [depts, setDepts] = useState<SimpleItem[]>([]);
	const [pickedRound, setRoundId] = useState('');
	const [deptId, setDeptId] = useState('');
	const [status, setStatus] = useState('');
	const [counted, setCounted] = useState<{ key: string; n: number } | null>(null);

	// Tùy chọn từng mẫu
	const [modal, setModal] = useState<OptionsModal>(null);
	const [summaryCols, setSummaryCols] = useState<Set<SummaryColKey>>(() => new Set(DEFAULT_COLS));
	// Tiêu đề lịch gắn với năm: đổi năm thì quay về mẫu mặc định của năm mới
	const [scheduleState, setScheduleState] = useState({ year, opts: defaultScheduleOpts(year) });
	const schedule = scheduleState.year === year ? scheduleState.opts : defaultScheduleOpts(year);
	const setSchedule = (patch: Partial<ScheduleOpts>) =>
		setScheduleState({ year, opts: { ...schedule, ...patch } });
	const [finalSections, setFinalSections] = useState<Set<ReportSection>>(
		() => new Set<ReportSection>(['overview', 'topics']),
	);
	const [statsSections, setStatsSections] = useState<Set<StatsExportSection>>(
		() => new Set(STATS_EXPORT_SECTIONS.map((s) => s.key)),
	);

	useEffect(() => {
		getRounds()
			.then((r) => setRounds(r.data))
			.catch(() => {});
		getDepts()
			.then((d) => setDepts(d.data))
			.catch(() => {});
	}, []);

	// Đợt đã chọn chỉ còn hiệu lực khi thuộc năm đang xem
	const yearRounds = rounds.filter((r) => r.year === year);
	const roundId = yearRounds.some((r) => r.id === pickedRound) ? pickedRound : '';

	const filters = {
		year,
		round_id: roundId || undefined,
		department_id: deptId || undefined,
		status: status || undefined,
	};
	const filterKey = JSON.stringify(filters);

	const count = counted?.key === filterKey ? counted.n : null;
	useEffect(() => {
		let alive = true;
		const t = setTimeout(() => {
			getTopics({ ...filters, limit: 1 })
				.then((r) => alive && setCounted({ key: filterKey, n: r.pagination.total }))
				.catch(() => {});
		}, 300);
		return () => {
			alive = false;
			clearTimeout(t);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [filterKey]);

	const topicIds = async () => {
		const res = await getTopics({ ...filters, limit: 0 });
		const ids = (res.data as { id: string }[]).map((t) => t.id);
		if (!ids.length) throw new Error('Không có đề tài nào khớp bộ lọc');
		return ids;
	};

	const exportReport = async (kind: 'summary' | 'final') => {
		const fileName = kind === 'summary' ? `tong-hop-de-tai-${year}` : `bao-cao-tong-ket-nckh-${year}`;
		const blob = await exportTopicsReport({
			ids: await topicIds(),
			fileName,
			title:
				kind === 'summary'
					? `TỔNG HỢP ĐỀ TÀI NGHIÊN CỨU KHOA HỌC NĂM ${year}`
					: `BÁO CÁO TỔNG KẾT NGHIÊN CỨU KHOA HỌC NĂM ${year}`,
			subtitle: `(Tổng hợp đề tài nghiên cứu khoa học năm ${year})`,
			sections: kind === 'summary' ? ['overview', 'topics'] : [...finalSections],
		});
		saveBlob(blob, `${fileName}.xlsx`);
	};

	const exportSchedule = async () => {
		const fileName = `lich-bao-ve-de-tai-${year}`;
		const blob = await exportTopicsExcel({
			ids: await topicIds(),
			fileName,
			customTitle: schedule.title,
			customSubtitle: schedule.subtitle,
			refNumber: schedule.refNumber,
			refDate: schedule.refDate,
		});
		saveBlob(blob, `${fileName}.xlsx`);
	};

	const printPdf = async (kind: 'summary' | 'schedule' | 'final') => {
		const data = await getTopicsExportData(await topicIds());
		if (kind === 'summary')
			openPrint(
				buildSummaryHtml(data, summaryCols, `Tổng hợp đề tài nghiên cứu khoa học năm ${year}`),
				'landscape',
				'Tổng hợp đề tài',
			);
		else if (kind === 'schedule')
			openPrint(buildScheduleHtml(data, schedule), 'landscape', 'Lịch bảo vệ đề cương');
		else openPrint(buildFinalHtml(data, finalSections, String(year)), 'portrait', 'Báo cáo tổng kết');
	};

	const s = stats?.overview.by_status;
	const total = stats?.overview.total ?? 0;
	const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}% tổng số` : '—');
	const noTopics = count === 0 ? 'Không có đề tài nào khớp bộ lọc — đổi bộ lọc để xuất.' : undefined;

	return (
		<div className={styles.section}>
			<div className={styles.sectionHead}>
				<span className={styles.sectionTitle}>Đề tài NCKH năm {year}</span>
				<Link
					to='/admin/dashboard/research'
					className={styles.sectionLink}
				>
					Xem biểu đồ ở Bảng điều khiển →
				</Link>
			</div>

			{error ? (
				<p className={styles.error}>{error}</p>
			) : (
				<div className={dash.metricsGrid}>
					<MetricCard
						label='Tổng số đề tài'
						value={total}
						loading={!stats}
						compare={`Thuộc các đợt năm ${year}`}
						icon={<TopicSvg />}
						iconClass='iconBlue'
						accent='accentBlue'
					/>
					<MetricCard
						label='Đã phê duyệt'
						value={s?.approved ?? 0}
						loading={!stats}
						compare={pct(s?.approved ?? 0)}
						icon={<CheckCircleSvg />}
						iconClass='iconGreen'
						accent='accentGreen'
					/>
					<MetricCard
						label='Chờ duyệt / bổ sung'
						value={(s?.submitted ?? 0) + (s?.supplement ?? 0)}
						loading={!stats}
						compare={`${s?.supplement ?? 0} đang chờ bổ sung`}
						icon={<ClockSvg />}
						iconClass='iconAmber'
						accent='accentAmber'
					/>
					<MetricCard
						label='Từ chối / huỷ'
						value={(s?.rejected ?? 0) + (s?.cancelled ?? 0)}
						loading={!stats}
						compare={`${s?.cancelled ?? 0} đề tài đã huỷ`}
						icon={<XCircleSvg />}
						iconClass='iconPink'
						accent='accentPink'
					/>
				</div>
			)}

			<div className={styles.filters}>
				<FormField label='Đợt nghiên cứu'>
					<select
						className={styles.select}
						value={roundId}
						onChange={(e) => setRoundId(e.target.value)}
					>
						<option value=''>Tất cả đợt năm {year}</option>
						{yearRounds.map((r) => (
								<option
									key={r.id}
									value={r.id}
								>
									{r.name}
								</option>
							))}
					</select>
				</FormField>
				<FormField label='Khoa / phòng'>
					<select
						className={styles.select}
						value={deptId}
						onChange={(e) => setDeptId(e.target.value)}
					>
						<option value=''>Tất cả khoa / phòng</option>
						{depts.map((d) => (
							<option
								key={d.id}
								value={d.id}
							>
								{d.name}
							</option>
						))}
					</select>
				</FormField>
				<FormField label='Trạng thái'>
					<select
						className={styles.select}
						value={status}
						onChange={(e) => setStatus(e.target.value)}
					>
						{STATUS_OPTIONS.map((o) => (
							<option
								key={o.value}
								value={o.value}
							>
								{o.label}
							</option>
						))}
					</select>
				</FormField>
				<span className={styles.count}>
					{count === null ? 'Đang đếm…' : (
						<>
							<strong>{count}</strong> đề tài khớp bộ lọc
						</>
					)}
				</span>
			</div>

			<div className={styles.cards}>
				<ReportCard
					icon={<FileTextSvg />}
					title='Tổng hợp đề tài'
					desc='Danh sách đề tài khớp bộ lọc: phân loại, cấp độ, khoa/phòng, trạng thái, chủ nhiệm. PDF in theo các cột đã chọn.'
					disabledReason={noTopics}
					onExcel={() => exportReport('summary')}
					onPdf={() => printPdf('summary')}
					onOptions={() => setModal('summary')}
				/>
				<ReportCard
					icon={<CalendarSvg />}
					title='Lịch bảo vệ đề cương'
					desc='Lịch bảo vệ theo mẫu công văn của bệnh viện, có tiêu đề, số và ngày thông báo.'
					disabledReason={noTopics}
					onExcel={exportSchedule}
					onPdf={() => printPdf('schedule')}
					onOptions={() => setModal('schedule')}
				/>
				<ReportCard
					icon={<ClipboardSvg />}
					title='Báo cáo tổng kết NCKH'
					desc='Thống kê tổng quan, danh sách đề tài, thành viên và các sheet theo phân loại / khoa / hệ chuyên môn.'
					disabledReason={noTopics}
					onExcel={() => exportReport('final')}
					onPdf={() => printPdf('final')}
					onOptions={() => setModal('final')}
				/>
				<ReportCard
					icon={<BarChartSvg />}
					title='Thống kê theo khoa & hệ'
					desc={`Số đề tài năm ${year} theo trạng thái, theo hệ chuyên môn và từng khoa/phòng (không áp dụng bộ lọc đợt/khoa/trạng thái).`}
					onExcel={async () =>
						saveBlob(await exportResearchStats(year, [...statsSections]), `thong-ke-de-tai-${year}.xlsx`)
					}
					onOptions={() => setModal('stats')}
				/>
			</div>

			<CheckListModal
				open={modal === 'summary'}
				title='Cột in trong PDF tổng hợp'
				options={SUMMARY_COLS}
				value={summaryCols}
				onChange={setSummaryCols}
				onClose={() => setModal(null)}
				grid
			/>
			<CheckListModal
				open={modal === 'final'}
				title='Nội dung báo cáo tổng kết'
				options={FINAL_SECTIONS}
				value={finalSections}
				onChange={setFinalSections}
				onClose={() => setModal(null)}
			/>
			<CheckListModal
				open={modal === 'stats'}
				title='Nội dung file thống kê'
				options={STATS_EXPORT_SECTIONS}
				value={statsSections}
				onChange={setStatsSections}
				onClose={() => setModal(null)}
			/>
			<Modal
				open={modal === 'schedule'}
				onClose={() => setModal(null)}
				title='Tùy chọn lịch bảo vệ'
				size='md'
				bodyClassName={m.stack}
				footer={<Button onClick={() => setModal(null)}>Xong</Button>}
			>
				<FormField label='Tiêu đề chính'>
					<textarea
						className={m.formTextarea}
						rows={2}
						value={schedule.title}
						onChange={(e) => setSchedule({ title: e.target.value })}
					/>
				</FormField>
				<FormField label='Phụ đề (in nghiêng)'>
					<textarea
						className={m.formTextarea}
						rows={2}
						value={schedule.subtitle}
						onChange={(e) => setSchedule({ subtitle: e.target.value })}
					/>
				</FormField>
				<div className={m.formGrid2}>
					<FormField label='Số thông báo'>
						<input
							className={m.formInput}
							value={schedule.refNumber}
							placeholder='VD: 38'
							onChange={(e) => setSchedule({ refNumber: e.target.value })}
						/>
					</FormField>
					<FormField label='Ngày thông báo'>
						<input
							className={m.formInput}
							value={schedule.refDate}
							placeholder='VD: 16/01/2026'
							onChange={(e) => setSchedule({ refDate: e.target.value })}
						/>
					</FormField>
				</div>
			</Modal>
		</div>
	);
}
