import { useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	AlertSvg,
	BarChartSvg,
	CalendarSvg,
	CheckSvg,
	ClipboardSvg,
	DownloadSvg,
	ExportSvg,
	FilePdfSvg,
	FileTextSvg,
	FilterSvg,
} from '@/assets/icons';
import { StatsExportModal } from '../components/StatsExportModal';
import { StatsPanel } from '../components/StatsPanel';
import { TrainingReportPanel } from '../components/TrainingReportPanel';
import { useReports } from '../hooks/useReports';
import {
	FINAL_SECTIONS,
	REPORT_TYPES,
	STATUS_OPTIONS,
	SUMMARY_COLS,
} from '../utils/reportHelpers';
import styles from './Reports.module.css';

const IcBarChart = () => <BarChartSvg style={{ width: 15, height: 15 }} />;
const IcCalendar = () => <CalendarSvg />;
const IcCheck = () => <CheckSvg style={{ width: 11, height: 11 }} />;
const IcClipboard = () => <ClipboardSvg />;
const IcAlert = () => (
	<AlertSvg
		style={{ width: 13, height: 13, verticalAlign: 'middle', marginRight: 4 }}
	/>
);
const IcDownload = () => <DownloadSvg style={{ width: 14, height: 14 }} />;
const IcExport = () => <ExportSvg style={{ width: 15, height: 15 }} />;
const IcFilePdf = () => <FilePdfSvg style={{ width: 14, height: 14 }} />;
const IcFileText = () => <FileTextSvg />;
const IcFilter = () => <FilterSvg style={{ width: 14, height: 14 }} />;

export default function Reports() {
	const {
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
		statsExporting,
		statsExportError,
		handleStatsExport,
		activeType,
	} = useReports();

	const [statsExportOpen, setStatsExportOpen] = useState(false);
	const [showTraining, setShowTraining] = useState(false);

	return (
		<AdminLayout
			pageTitle='Báo cáo & Thống kê'
			pageSubtitle='Thống kê tổng quan và xuất dữ liệu nghiên cứu khoa học'
			headerActions={
				!showTraining && activeTab === 'stats' && stats ? (
					<button
						className={`${styles.btnExport} ${styles.btnExport_green}`}
						onClick={() => setStatsExportOpen(true)}
					>
						<IcDownload /> Xuất Excel
					</button>
				) : undefined
			}
		>
			<StatsExportModal
				open={statsExportOpen}
				onClose={() => setStatsExportOpen(false)}
				exporting={statsExporting}
				error={statsExportError}
				onExport={(sections) => {
					void handleStatsExport(sections).then((ok) => {
						if (ok) setStatsExportOpen(false);
					});
				}}
			/>
			{/* ── Tab bar ──────────────────────────── */}
			<div className={styles.tabBar}>
				<button
					className={!showTraining && activeTab === 'stats' ? styles.tabActive : styles.tab}
					onClick={() => {
						setShowTraining(false);
						setActiveTab('stats');
					}}
				>
					<IcBarChart /> Thống kê tổng quan
				</button>
				<button
					className={!showTraining && activeTab === 'export' ? styles.tabActive : styles.tab}
					onClick={() => {
						setShowTraining(false);
						setActiveTab('export');
					}}
				>
					<IcExport /> Xuất dữ liệu
				</button>
				<button
					className={showTraining ? styles.tabActive : styles.tab}
					onClick={() => setShowTraining(true)}
				>
					<IcClipboard /> Báo cáo đào tạo
				</button>
			</div>

			{/* ── Training tab ─────────────────────── */}
			{showTraining && <TrainingReportPanel />}

			{/* ── Stats tab ────────────────────────── */}
			{!showTraining && activeTab === 'stats' && (
				<StatsPanel
					stats={stats}
					loading={statsPhase === 'loading'}
					error={statsError}
					onRetry={retryStats}
				/>
			)}

			{/* ── Export tab ───────────────────────── */}
			{!showTraining && activeTab === 'export' && (
				<>
					{/* Bộ lọc */}
					<div className={styles.filterPanel}>
						<div className={styles.filterHead}>
							<IcFilter />
							<span className={styles.filterHeadTitle}>Bộ lọc dữ liệu</span>
						</div>
						<div className={styles.filterGrid}>
							<div className={styles.fg}>
								<label className={styles.fl}>Năm</label>
								<input
									className={styles.fi}
									value={yearFilter}
									onChange={(e) => setYearFilter(e.target.value)}
									placeholder='2026'
									maxLength={4}
								/>
							</div>
							<div className={styles.fg}>
								<label className={styles.fl}>Đợt nghiên cứu</label>
								<select
									className={styles.fi}
									value={roundFilter}
									onChange={(e) => setRoundFilter(e.target.value)}
								>
									<option value=''>Tất cả đợt</option>
									{rounds.map((r) => (
										<option
											key={r.id}
											value={r.id}
										>
											{r.name}
										</option>
									))}
								</select>
							</div>
							<div className={styles.fg}>
								<label className={styles.fl}>Phòng ban</label>
								<select
									className={styles.fi}
									value={deptFilter}
									onChange={(e) => setDeptFilter(e.target.value)}
								>
									<option value=''>Tất cả phòng ban</option>
									{depts.map((d) => (
										<option
											key={d.id}
											value={d.id}
										>
											{d.name}
										</option>
									))}
								</select>
							</div>
							<div className={styles.fg}>
								<label className={styles.fl}>Trạng thái</label>
								<select
									className={styles.fi}
									value={statusFilter}
									onChange={(e) => setStatusFilter(e.target.value)}
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
							</div>
						</div>
						<div className={styles.filterFoot}>
							{countLoading ? (
								<span className={styles.countLoading}>
									<span className={styles.dotSpin} />
									Đang đếm...
								</span>
							) : topicCount !== null ? (
								<span className={styles.countText}>
									Tìm thấy <strong>{topicCount}</strong> đề tài phù hợp
								</span>
							) : null}
						</div>
					</div>

					{/* Loại báo cáo */}
					<div className={styles.typeRow}>
						{REPORT_TYPES.map((rt) => {
							const active = reportType === rt.key;
							return (
								<button
									key={rt.key}
									className={`${styles.typeBtn} ${active ? (styles[`typeBtnActive_${rt.color}` as keyof typeof styles] ?? styles.typeBtnActiveGreen) : ''}`}
									onClick={() => setReportType(rt.key)}
								>
									<div
										className={`${styles.typeIcon} ${styles[`typeIcon_${rt.color}` as keyof typeof styles] ?? ''}`}
									>
										{rt.key === 'summary' ? (
											<IcFileText />
										) : rt.key === 'schedule' ? (
											<IcCalendar />
										) : (
											<IcClipboard />
										)}
									</div>
									<div className={styles.typeMeta}>
										<div className={styles.typeLabel}>{rt.label}</div>
										<div className={styles.typeDesc}>{rt.desc}</div>
									</div>
									{active && (
										<span
											className={`${styles.typeCheck} ${styles[`typeCheck_${rt.color}` as keyof typeof styles] ?? ''}`}
										>
											<IcCheck />
										</span>
									)}
								</button>
							);
						})}
					</div>

					{/* Options panel */}
					<div className={styles.optPanel}>
						<div className={styles.optHead}>
							<span className={styles.optHeadTitle}>
								Tùy chỉnh — {activeType.label}
							</span>
						</div>
						<div className={styles.optBody}>
							{reportType === 'summary' && (
								<div className={styles.optSection}>
									<div className={styles.optSectionLabel}>Thông tin xuất</div>
									<div className={styles.checkGrid}>
										{SUMMARY_COLS.map((c) => (
											<label
												key={c.key}
												className={`${styles.checkItem} ${summaryCols.has(c.key) ? styles.checkItemOn : ''}`}
											>
												<input
													type='checkbox'
													className={styles.checkInput}
													checked={summaryCols.has(c.key)}
													onChange={(e) => toggleCol(c.key, e.target.checked)}
												/>
												<span className={styles.checkBox}>
													{summaryCols.has(c.key) && <IcCheck />}
												</span>
												<span className={styles.checkLabel}>{c.label}</span>
											</label>
										))}
									</div>
								</div>
							)}
							{reportType === 'schedule' && (
								<div className={styles.optSection}>
									<div className={styles.scheduleGrid}>
										<div className={`${styles.fg} ${styles.fgFull}`}>
											<label className={styles.fl}>Tiêu đề chính</label>
											<textarea
												className={`${styles.fi} ${styles.fiTextarea}`}
												value={scheduleOpts.title}
												onChange={(e) => setOpt('title', e.target.value)}
												rows={2}
											/>
										</div>
										<div className={`${styles.fg} ${styles.fgFull}`}>
											<label className={styles.fl}>
												Phụ đề <span className={styles.hint}>(in nghiêng)</span>
											</label>
											<textarea
												className={`${styles.fi} ${styles.fiTextarea}`}
												value={scheduleOpts.subtitle}
												onChange={(e) => setOpt('subtitle', e.target.value)}
												rows={2}
											/>
										</div>
										<div className={styles.fg}>
											<label className={styles.fl}>Số thông báo</label>
											<input
												className={styles.fi}
												value={scheduleOpts.refNumber}
												onChange={(e) => setOpt('refNumber', e.target.value)}
												placeholder='VD: 38'
											/>
										</div>
										<div className={styles.fg}>
											<label className={styles.fl}>Ngày thông báo</label>
											<input
												className={styles.fi}
												value={scheduleOpts.refDate}
												onChange={(e) => setOpt('refDate', e.target.value)}
												placeholder='VD: 16/01/2026'
											/>
										</div>
										{format === 'xlsx' && (
											<div className={`${styles.fg} ${styles.fgFull}`}>
												<label className={styles.fl}>Tên file</label>
												<div className={styles.fileRow}>
													<input
														className={styles.fi}
														value={scheduleOpts.fileName}
														onChange={(e) => setOpt('fileName', e.target.value)}
														maxLength={80}
													/>
													<span className={styles.fileExt}>.xlsx</span>
												</div>
											</div>
										)}
									</div>
								</div>
							)}
							{reportType === 'final' && (
								<div className={styles.optSection}>
									<div className={styles.optSectionLabel}>Nội dung bao gồm</div>
									<div className={styles.sectionChecks}>
										{FINAL_SECTIONS.map((s) => (
											<label
												key={s.key}
												className={`${styles.sectionCheck} ${finalSections.has(s.key) ? styles.sectionCheckOn : ''}`}
											>
												<input
													type='checkbox'
													className={styles.checkInput}
													checked={finalSections.has(s.key)}
													onChange={(e) =>
														toggleSection(s.key, e.target.checked)
													}
												/>
												<span className={styles.checkBox}>
													{finalSections.has(s.key) && <IcCheck />}
												</span>
												<span className={styles.sectionCheckLabel}>
													{s.label}
												</span>
											</label>
										))}
									</div>
								</div>
							)}
						</div>

						{/* Action bar */}
						<div className={styles.actionBar}>
							<div className={styles.fmtToggle}>
								<span className={styles.fmtLabel}>Định dạng:</span>
								<button
									className={`${styles.fmtBtn} ${format === 'pdf' ? styles.fmtBtnActive : ''}`}
									onClick={() => setFormat('pdf')}
								>
									<IcFilePdf /> PDF
								</button>
								<button
									className={`${styles.fmtBtn} ${format === 'xlsx' ? styles.fmtBtnActive : ''}`}
									onClick={() => setFormat('xlsx')}
								>
									<IcDownload /> Excel
								</button>
							</div>
							<div className={styles.actionRight}>
								{exportError && (
									<span className={styles.errMsg}>
										<IcAlert />
										{exportError}
									</span>
								)}
								<button
									className={`${styles.btnExport} ${styles[`btnExport_${activeType.color}` as keyof typeof styles] ?? styles.btnExport_green}`}
									onClick={() => void handleExport()}
									disabled={exporting || topicCount === 0}
								>
									{exporting ? (
										<>
											<span className={styles.spinner} />
											Đang xuất...
										</>
									) : (
										<>
											{format === 'pdf' ? <IcFilePdf /> : <IcDownload />}Xuất{' '}
											{format === 'pdf' ? 'PDF' : 'Excel'}
											{topicCount !== null ? ` (${topicCount})` : ''}
										</>
									)}
								</button>
							</div>
						</div>
					</div>
				</>
			)}
		</AdminLayout>
	);
}
