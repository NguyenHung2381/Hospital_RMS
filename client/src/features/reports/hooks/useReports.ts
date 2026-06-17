import { useCallback, useEffect, useRef, useState } from 'react';
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
import { getDashboardStats, type DashboardStats } from '../api/reportApi';
import {
	buildFinalHtml,
	buildScheduleHtml,
	buildSummaryHtml,
	currentYear,
	DEFAULT_COLS,
	openPrint,
	REPORT_TYPES,
	type ExportFormat,
	type ReportType,
	type ScheduleOpts,
	type SummaryColKey,
} from '../utils/reportHelpers';

const year = String(currentYear);

export interface ReportsState {
	// Stats
	stats: DashboardStats | null;
	statsPhase: 'loading' | 'ok' | 'err';
	statsError: string;
	retryStats: () => void;

	// Tab
	activeTab: 'stats' | 'export';
	setActiveTab: (v: 'stats' | 'export') => void;

	// Filters
	yearFilter: string;
	roundFilter: string;
	deptFilter: string;
	statusFilter: string;
	rounds: SimpleItem[];
	depts: SimpleItem[];
	topicCount: number | null;
	countLoading: boolean;
	setYearFilter: (v: string) => void;
	setRoundFilter: (v: string) => void;
	setDeptFilter: (v: string) => void;
	setStatusFilter: (v: string) => void;

	// Report config
	reportType: ReportType;
	format: ExportFormat;
	summaryCols: Set<SummaryColKey>;
	scheduleOpts: ScheduleOpts;
	finalSections: Set<ReportSection>;
	setReportType: (v: ReportType) => void;
	setFormat: (v: ExportFormat) => void;
	toggleCol: (key: SummaryColKey, on: boolean) => void;
	toggleSection: (key: ReportSection, on: boolean) => void;
	setOpt: <K extends keyof ScheduleOpts>(k: K, v: ScheduleOpts[K]) => void;

	// Export
	exporting: boolean;
	exportError: string;
	handleExport: () => void;

	// Derived
	activeType: (typeof REPORT_TYPES)[number];
}

export function useReports(): ReportsState {
	// Stats
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [statsPhase, setStatsPhase] = useState<'loading' | 'ok' | 'err'>(
		'loading',
	);
	const [statsError, setStatsError] = useState('');
	const [statsKey, setStatsKey] = useState(0);

	const retryStats = useCallback(() => {
		setStatsPhase('loading');
		setStats(null);
		setStatsError('');
		setStatsKey((k) => k + 1);
	}, []);

	useEffect(() => {
		let alive = true;
		getDashboardStats()
			.then((d) => {
				if (alive) {
					setStats(d);
					setStatsPhase('ok');
				}
			})
			.catch((e: Error) => {
				if (alive) {
					setStatsError(e.message);
					setStatsPhase('err');
				}
			});
		return () => {
			alive = false;
		};
	}, [statsKey]);

	// Tab
	const [activeTab, setActiveTab] = useState<'stats' | 'export'>('stats');

	// Filters
	const [yearFilter, setYearFilter] = useState(year);
	const [roundFilter, setRoundFilter] = useState('');
	const [deptFilter, setDeptFilter] = useState('');
	const [statusFilter, setStatusFilter] = useState('');
	const [rounds, setRounds] = useState<SimpleItem[]>([]);
	const [depts, setDepts] = useState<SimpleItem[]>([]);
	const [topicCount, setTopicCount] = useState<number | null>(null);
	const [countLoading, setCountLoading] = useState(false);

	// Report config
	const [reportType, setReportType] = useState<ReportType>('summary');
	const [format, setFormat] = useState<ExportFormat>('xlsx');
	const [summaryCols, setSummaryCols] = useState<Set<SummaryColKey>>(
		() => new Set(DEFAULT_COLS),
	);
	const [scheduleOpts, setScheduleOpts] = useState<ScheduleOpts>({
		title: `LỊCH BẢO VỆ ĐỀ CƯƠNG SÁNG KIẾN, ĐỀ TÀI NGHIÊN CỨU KHOA HỌC CẤP CƠ SỞ NĂM ${year}`,
		subtitle: `(Danh sách đề tài nghiên cứu khoa học cấp cơ sở năm ${year})`,
		refNumber: '',
		refDate: '',
		fileName: `lich-bao-ve-de-tai-${year}`,
	});
	const [finalSections, setFinalSections] = useState<Set<ReportSection>>(
		() => new Set<ReportSection>(['overview', 'topics']),
	);

	// Export
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState('');

	useEffect(() => {
		getRounds()
			.then((r) => setRounds(r.data))
			.catch(() => {});
		getDepts()
			.then((d) => setDepts(d.data))
			.catch(() => {});
	}, []);

	const fetchCount = useCallback(() => {
		setCountLoading(true);
		getTopics({
			limit: 1,
			year: yearFilter || undefined,
			round_id: roundFilter || undefined,
			department_id: deptFilter || undefined,
			status: statusFilter || undefined,
		})
			.then((r) => {
				setTopicCount(r.pagination.total);
				setCountLoading(false);
			})
			.catch(() => {
				setTopicCount(null);
				setCountLoading(false);
			});
	}, [yearFilter, roundFilter, deptFilter, statusFilter]);

	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(fetchCount, 350);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [fetchCount]);

	const getAllIds = async () => {
		const res = await getTopics({
			limit: 1000,
			year: yearFilter || undefined,
			round_id: roundFilter || undefined,
			department_id: deptFilter || undefined,
			status: statusFilter || undefined,
		});
		return (res.data as { id: string }[]).map((t) => t.id);
	};

	const handleExport = async () => {
		setExporting(true);
		setExportError('');
		try {
			const ids = await getAllIds();
			if (!ids.length) {
				setExportError('Không có đề tài nào phù hợp bộ lọc');
				return;
			}

			if (reportType === 'schedule' && format === 'xlsx') {
				const fn =
					scheduleOpts.fileName.trim() || `lich-bao-ve-de-tai-${yearFilter}`;
				const blob = await exportTopicsExcel({
					ids,
					fileName: fn,
					customTitle: scheduleOpts.title,
					customSubtitle: scheduleOpts.subtitle,
					refNumber: scheduleOpts.refNumber,
					refDate: scheduleOpts.refDate,
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${fn}.xlsx`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				return;
			}

			if (format === 'xlsx') {
				const serverSections: ReportSection[] =
					reportType === 'summary' ? ['topics'] : [...finalSections];
				const fnMap: Record<string, string> = {
					summary: `tong-hop-de-tai-${yearFilter}`,
					final: `bao-cao-nckh-${yearFilter}`,
				};
				const titleMap: Record<string, string> = {
					summary: `TỔNG HỢP ĐỀ TÀI NGHIÊN CỨU KHOA HỌC NĂM ${yearFilter}`,
					final: `BÁO CÁO TỔNG KẾT NGHIÊN CỨU KHOA HỌC NĂM ${yearFilter}`,
				};
				const fn = fnMap[reportType] ?? `bao-cao-nckh-${yearFilter}`;
				const blob = await exportTopicsReport({
					ids,
					fileName: fn,
					title: titleMap[reportType] ?? fn,
					subtitle: `(Tổng hợp đề tài nghiên cứu khoa học năm ${yearFilter})`,
					sections: serverSections,
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = `${fn}.xlsx`;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
				return;
			}

			// PDF path
			const data = await getTopicsExportData(ids);
			if (reportType === 'summary')
				openPrint(
					buildSummaryHtml(
						data,
						summaryCols,
						`Tổng hợp đề tài nghiên cứu khoa học năm ${yearFilter}`,
					),
					'landscape',
					'Tổng hợp đề tài',
				);
			else if (reportType === 'schedule')
				openPrint(
					buildScheduleHtml(data, scheduleOpts),
					'landscape',
					'Lịch báo cáo',
				);
			else
				openPrint(
					buildFinalHtml(data, finalSections, yearFilter),
					'portrait',
					'Báo cáo tổng kết',
				);
		} catch (err) {
			setExportError(err instanceof Error ? err.message : 'Lỗi xuất dữ liệu');
		} finally {
			setExporting(false);
		}
	};

	const toggleCol = (key: SummaryColKey, on: boolean) => {
		setSummaryCols((prev) => {
			const next = new Set(prev);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});
	};
	const toggleSection = (key: ReportSection, on: boolean) => {
		setFinalSections((prev) => {
			const next = new Set(prev);
			if (on) next.add(key);
			else next.delete(key);
			return next;
		});
	};
	const setOpt = <K extends keyof ScheduleOpts>(k: K, v: ScheduleOpts[K]) =>
		setScheduleOpts((p) => ({ ...p, [k]: v }));

	const activeType = REPORT_TYPES.find((r) => r.key === reportType)!;

	return {
		stats,
		statsPhase,
		statsError,
		retryStats,
		activeTab,
		setActiveTab,
		yearFilter,
		roundFilter,
		deptFilter,
		statusFilter,
		rounds,
		depts,
		topicCount,
		countLoading,
		setYearFilter,
		setRoundFilter,
		setDeptFilter,
		setStatusFilter,
		reportType,
		format,
		summaryCols,
		scheduleOpts,
		finalSections,
		setReportType,
		setFormat,
		toggleCol,
		toggleSection,
		setOpt,
		exporting,
		exportError,
		handleExport,
		activeType,
	};
}
