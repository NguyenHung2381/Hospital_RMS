import { useCallback, useEffect, useRef, useState } from 'react';
import AdminLayout from '../../../layouts/AdminLayout';
import {
	exportTopicsExcel,
	exportTopicsReport,
	getDepts,
	getRounds,
	getTopics,
	getTopicsExportData,
	type ExportTopic,
	type ReportSection,
	type SimpleItem,
} from '../../topics/api/topicApi';
import { getDashboardStats, type DashboardStats } from '../api/reportApi';
import styles from './Reports.module.css';

// ─── Constants ────────────────────────────
const currentYear = new Date().getFullYear();
type ReportType = 'summary' | 'schedule' | 'final';
type ExportFormat = 'pdf' | 'xlsx';

const STATUS_LABELS: Record<string, string> = {
	draft: 'Nháp',
	submitted: 'Chờ duyệt',
	approved: 'Đã phê duyệt',
	rejected: 'Từ chối',
	supplement: 'Bổ sung',
	completed: 'Hoàn thành',
};
const STATUS_OPTIONS = [
	{ value: '', label: 'Tất cả trạng thái' },
	...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
];

const SUMMARY_COLS = [
	{ key: 'id', label: 'Mã đề tài', w: 14 },
	{ key: 'title', label: 'Tên đề tài', w: 52 },
	{ key: 'category_name', label: 'Phân loại', w: 20 },
	{ key: 'level_name', label: 'Cấp độ', w: 14 },
	{ key: 'department_name', label: 'Phòng ban', w: 26 },
	{ key: 'round_name', label: 'Đợt', w: 20 },
	{ key: 'status', label: 'Trạng thái', w: 16 },
	{ key: 'leader', label: 'Chủ nhiệm', w: 30 },
	{ key: 'created_at', label: 'Ngày tạo', w: 14 },
	{ key: 'member_count', label: 'Số TV', w: 8 },
] as const;
type SummaryColKey = (typeof SUMMARY_COLS)[number]['key'];

const DEFAULT_COLS: SummaryColKey[] = [
	'id',
	'title',
	'category_name',
	'level_name',
	'department_name',
	'status',
	'leader',
];

const FINAL_SECTIONS: { key: ReportSection; label: string }[] = [
	{ key: 'overview',     label: 'Thống kê tổng quan' },
	{ key: 'topics',       label: 'Danh sách đề tài (đầy đủ)' },
	{ key: 'members',      label: 'Danh sách thành viên' },
	{ key: 'by_category',  label: 'Sheet riêng theo phân loại' },
];

interface ScheduleOpts {
	title: string;
	subtitle: string;
	refNumber: string;
	refDate: string;
	fileName: string;
}

const REPORT_TYPES: {
	key: ReportType;
	label: string;
	desc: string;
	color: string;
}[] = [
	{
		key: 'summary',
		label: 'Tổng hợp đề tài',
		color: 'green',
		desc: 'Danh sách đề tài kèm phân loại, trạng thái, chủ nhiệm — chọn cột tùy ý',
	},
	{
		key: 'schedule',
		label: 'Lịch báo cáo',
		color: 'blue',
		desc: 'Lịch bảo vệ đề cương theo mẫu bệnh viện, có tiêu đề và số thông báo',
	},
	{
		key: 'final',
		label: 'File tổng kết',
		color: 'amber',
		desc: 'Báo cáo đầy đủ: thống kê tổng quan, danh sách đề tài và thành viên',
	},
];

// ─── Helpers ──────────────────────────────
function esc(s: string | null | undefined): string {
	return (s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
function fmtDate(iso: string | null | undefined) {
	if (!iso) return '';
	const d = new Date(iso);
	return isNaN(d.getTime())
		? ''
		: d.toLocaleDateString('vi-VN', {
				timeZone: 'Asia/Ho_Chi_Minh',
				day: '2-digit',
				month: '2-digit',
				year: 'numeric',
			});
}
function getLeader(t: ExportTopic) {
	return t.members.find((m) => m.role === 'leader')?.ho_ten ?? '';
}
function toRoman(n: number) {
	return (
		['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ??
		String(n)
	);
}
function cellVal(t: ExportTopic, key: SummaryColKey): string {
	switch (key) {
		case 'id':
			return t.id;
		case 'title':
			return t.title;
		case 'category_name':
			return t.category_name ?? '';
		case 'level_name':
			return t.level_name ?? '';
		case 'department_name':
			return t.department_name ?? '';
		case 'round_name':
			return t.round_name ?? '';
		case 'status':
			return STATUS_LABELS[t.status] ?? t.status;
		case 'leader':
			return getLeader(t);
		case 'created_at':
			return fmtDate(t.created_at);
		case 'member_count':
			return String(t.members.length);
	}
}




// ─── PDF (print window) ───────────────────
const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Times,serif;font-size:11pt;color:#000}
h1{font-size:13pt;text-align:center;text-transform:uppercase;font-weight:bold;margin-bottom:4pt}
h2{font-size:11pt;text-align:center;font-style:italic;margin-bottom:8pt}
.ref{text-align:center;font-size:10pt;font-style:italic;margin-bottom:8pt;color:#444}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid #444;padding:3pt 5pt;vertical-align:middle}
th{background:#d4edda;font-weight:bold;text-align:center;font-size:10pt}
.stt{text-align:center;width:26pt}
.sh{font-size:12pt;font-weight:bold;margin:14pt 0 6pt}
.sw{max-width:360pt}
.sw td:last-child{text-align:right;font-weight:600}
.foot{margin-top:8pt;font-size:9pt;color:#888;text-align:right}
@media print{*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`;

function openPrint(
	body: string,
	orient: 'portrait' | 'landscape',
	title: string,
) {
	const win = window.open('', '_blank', 'width=1000,height=700');
	if (!win) {
		alert('Vui lòng cho phép mở popup để xuất PDF');
		return;
	}
	const now = new Date().toLocaleDateString('vi-VN', {
		timeZone: 'Asia/Ho_Chi_Minh',
	});
	win.document.write(
		`<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><title>${esc(title)}</title>` +
			`<style>${BASE_CSS}@page{size:A4 ${orient};margin:15mm}</style></head><body>` +
			`${body}<p class="foot">Xuất ngày ${now} — Hệ thống Quản lý NCKH</p>` +
			`<script>window.onload=function(){setTimeout(function(){window.print();},350)}</` +
			`script>` +
			`</body></html>`,
	);
	win.document.close();
}

function buildSummaryHtml(
	topics: ExportTopic[],
	cols: Set<SummaryColKey>,
	heading: string,
) {
	const active = SUMMARY_COLS.filter((c) => cols.has(c.key));
	const rows =
		topics
			.map(
				(t, i) =>
					`<tr><td class="stt">${i + 1}</td>${active.map((c) => `<td>${esc(cellVal(t, c.key))}</td>`).join('')}</tr>`,
			)
			.join('') ||
		`<tr><td colspan="${active.length + 1}" style="text-align:center">Không có dữ liệu</td></tr>`;
	return (
		`<h1>${esc(heading)}</h1>` +
		`<p style="text-align:center;font-size:10pt;margin-bottom:8pt">Tổng số: <strong>${topics.length}</strong> đề tài</p>` +
		`<table><thead><tr><th class="stt">STT</th>${active.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>` +
		`<tbody>${rows}</tbody></table>`
	);
}

function buildScheduleHtml(topics: ExportTopic[], o: ScheduleOpts) {
	const ref =
		o.refNumber || o.refDate
			? `<p class="ref">Căn cứ Thông báo số <strong>${esc(o.refNumber)}</strong> ngày ${esc(o.refDate)}</p>`
			: '';
	const rows =
		topics
			.map(
				(t, i) =>
					`<tr><td class="stt">${i + 1}</td><td>${esc(t.id)}</td><td>${esc(t.title)}</td>` +
					`<td>${esc(t.category_name ?? '')}</td><td>${esc(t.level_name ?? '')}</td>` +
					`<td>${esc(t.department_name ?? '')}</td><td>${esc(getLeader(t))}</td><td></td><td></td><td></td></tr>`,
			)
			.join('') ||
		`<tr><td colspan="10" style="text-align:center">Không có dữ liệu</td></tr>`;
	return (
		`<h1>${esc(o.title)}</h1>${o.subtitle ? `<h2>${esc(o.subtitle)}</h2>` : ''}${ref}` +
		`<table><thead><tr><th class="stt">STT</th><th>Mã ĐT</th><th>Tên đề tài</th><th>Phân loại</th><th>Cấp độ</th>` +
		`<th>Phòng ban</th><th>Chủ nhiệm</th><th>Ngày bảo vệ</th><th>Giờ</th><th>Ghi chú</th>` +
		`</tr></thead><tbody>${rows}</tbody></table>`
	);
}

function buildFinalHtml(
	topics: ExportTopic[],
	sections: Set<string>,
	year: string,
) {
	let html = `<h1>Báo cáo tổng kết nghiên cứu khoa học năm ${esc(year)}</h1>`;
	let n = 1;
	if (sections.has('overview')) {
		const byStatus = Object.entries(STATUS_LABELS)
			.map(([k, lbl]) => ({
				lbl,
				cnt: topics.filter((t) => t.status === k).length,
			}))
			.filter((x) => x.cnt > 0);
		const deptMap = new Map<string, number>();
		topics.forEach((t) => {
			const k = t.department_name ?? '(Chưa phân)';
			deptMap.set(k, (deptMap.get(k) ?? 0) + 1);
		});
		const byDept = [...deptMap.entries()].sort((a, b) => b[1] - a[1]);
		html +=
			`<p class="sh">${toRoman(n++)}. Thống kê tổng quan</p>` +
			`<div class="sw"><table><tbody>` +
			`<tr><td><strong>Tổng số đề tài</strong></td><td>${topics.length}</td></tr>` +
			byStatus
				.map(
					(x) =>
						`<tr><td>&nbsp;&nbsp;— ${esc(x.lbl)}</td><td>${x.cnt}</td></tr>`,
				)
				.join('') +
			`</tbody></table></div>` +
			`<p style="font-weight:bold;margin:8pt 0 4pt">Theo phòng ban:</p>` +
			`<div class="sw"><table><thead><tr><th>Phòng ban</th><th>Số đề tài</th></tr></thead>` +
			`<tbody>${byDept.map(([name, cnt]) => `<tr><td>${esc(name)}</td><td>${cnt}</td></tr>`).join('')}</tbody></table></div>`;
	}
	if (sections.has('topics')) {
		const allCols = new Set(SUMMARY_COLS.map((c) => c.key) as SummaryColKey[]);
		html += `<div style="margin-top:14pt">${buildSummaryHtml(topics, allCols, `${toRoman(n++)}. Danh sách đề tài nghiên cứu`)}</div>`;
	}
	if (sections.has('members')) {
		const rows: { t: ExportTopic; m: ExportTopic['members'][0] }[] = [];
		topics.forEach((t) => t.members.forEach((m) => rows.push({ t, m })));
		html +=
			`<div style="margin-top:14pt"><h1 style="font-size:12pt">${toRoman(n++)}. Danh sách thành viên tham gia</h1>` +
			`<p style="text-align:center;font-size:10pt;margin-bottom:8pt">Tổng: <strong>${rows.length}</strong> thành viên</p>` +
			`<table><thead><tr><th class="stt">STT</th><th>Mã ĐT</th><th>Tên đề tài</th><th>Họ tên</th><th>Vai trò</th><th>Chức vụ</th><th>Email</th></tr></thead>` +
			`<tbody>${rows
				.map(
					({ t, m }, i) =>
						`<tr><td class="stt">${i + 1}</td><td>${esc(t.id)}</td><td>${esc(t.title)}</td><td>${esc(m.ho_ten)}</td>` +
						`<td>${m.role === 'leader' ? 'Chủ nhiệm' : m.role === 'secretary' ? 'Thư ký' : 'Thành viên'}</td>` +
						`<td>${esc(m.chuc_vu ?? '')}</td><td>${esc(m.email ?? '')}</td></tr>`,
				)
				.join('')}</tbody></table></div>`;
	}
	return html;
}

// ─── Icons ────────────────────────────────
function IcFilter() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 14, height: 14 }}
		>
			<polygon points='22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3' />
		</svg>
	);
}
function IcFileText() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
			<polyline points='14 2 14 8 20 8' />
			<line
				x1='16'
				y1='13'
				x2='8'
				y2='13'
			/>
			<line
				x1='16'
				y1='17'
				x2='8'
				y2='17'
			/>
		</svg>
	);
}
function IcCalendar() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<rect
				x='3'
				y='4'
				width='18'
				height='18'
				rx='2'
			/>
			<line
				x1='16'
				y1='2'
				x2='16'
				y2='6'
			/>
			<line
				x1='8'
				y1='2'
				x2='8'
				y2='6'
			/>
			<line
				x1='3'
				y1='10'
				x2='21'
				y2='10'
			/>
		</svg>
	);
}
function IcClipboard() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
		>
			<path d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' />
			<rect
				x='8'
				y='2'
				width='8'
				height='4'
				rx='1'
				ry='1'
			/>
		</svg>
	);
}
function IcDownload() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 14, height: 14 }}
		>
			<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
			<polyline points='7 10 12 15 17 10' />
			<line
				x1='12'
				y1='15'
				x2='12'
				y2='3'
			/>
		</svg>
	);
}
function IcFilePdf() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2.5'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 14, height: 14 }}
		>
			<path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' />
			<polyline points='14 2 14 8 20 8' />
		</svg>
	);
}
function IcCheck() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='3'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 11, height: 11 }}
		>
			<polyline points='20 6 9 17 4 12' />
		</svg>
	);
}
function IcAlert() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 13, height: 13, verticalAlign: 'middle', marginRight: 4 }}
		>
			<circle
				cx='12'
				cy='12'
				r='10'
			/>
			<line
				x1='12'
				y1='8'
				x2='12'
				y2='12'
			/>
			<line
				x1='12'
				y1='16'
				x2='12.01'
				y2='16'
			/>
		</svg>
	);
}
function IcBarChart() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 15, height: 15 }}
		>
			<line
				x1='18'
				y1='20'
				x2='18'
				y2='10'
			/>
			<line
				x1='12'
				y1='20'
				x2='12'
				y2='4'
			/>
			<line
				x1='6'
				y1='20'
				x2='6'
				y2='14'
			/>
			<line
				x1='2'
				y1='20'
				x2='22'
				y2='20'
			/>
		</svg>
	);
}
function IcExport() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 15, height: 15 }}
		>
			<path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
			<polyline points='17 8 12 3 7 8' />
			<line
				x1='12'
				y1='3'
				x2='12'
				y2='15'
			/>
		</svg>
	);
}
function IcRefresh() {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			style={{ width: 13, height: 13 }}
		>
			<polyline points='23 4 23 10 17 10' />
			<path d='M20.49 15a9 9 0 1 1-2.12-9.36L23 10' />
		</svg>
	);
}

// ─── Stats Panel ──────────────────────────
function StatsPanel({
	stats,
	loading,
	error,
	onRetry,
}: {
	stats: DashboardStats | null;
	loading: boolean;
	error: string;
	onRetry: () => void;
}) {
	if (loading)
		return (
			<div className={styles.statsState}>
				<span className={styles.dotSpin} />
				Đang tải thống kê...
			</div>
		);
	if (error)
		return (
			<div className={`${styles.statsState} ${styles.statsErr}`}>
				<IcAlert />
				{error}
				<button
					className={styles.retryBtn}
					onClick={onRetry}
				>
					<IcRefresh /> Thử lại
				</button>
			</div>
		);
	if (!stats) return null;

	const { overview, by_department, by_category, by_level, recent_approvals } =
		stats;
	const s = overview.by_status;

	const cards = [
		{ label: 'Tổng số đề tài', value: overview.total, cls: styles.scTotal },
		{ label: 'Đã phê duyệt', value: s.approved, cls: styles.scApproved },
		{ label: 'Chờ duyệt', value: s.submitted, cls: styles.scSubmitted },
		{ label: 'Hoàn thành', value: s.completed, cls: styles.scCompleted },
		{ label: 'Từ chối', value: s.rejected, cls: styles.scRejected },
		{
			label: 'Nháp / Bổ sung',
			value: s.draft + s.supplement,
			cls: styles.scDraft,
		},
	];

	const maxDept = Math.max(...by_department.map((d) => d.total), 1);
	const maxCat = Math.max(...by_category.map((c) => c.count), 1);
	const maxLvl = Math.max(...by_level.map((l) => l.count), 1);

	return (
		<div className={styles.statsRoot}>
			{/* Overview cards */}
			<div className={styles.overviewGrid}>
				{cards.map((c) => (
					<div
						key={c.label}
						className={`${styles.statCard} ${c.cls}`}
					>
						<div className={styles.statValue}>{c.value}</div>
						<div className={styles.statLabel}>{c.label}</div>
					</div>
				))}
			</div>

			{/* Main grid: dept table + category / level */}
			<div className={styles.statsMainGrid}>
				<div className={styles.statsCard}>
					<div className={styles.statsCardHead}>Theo phòng ban (Top 10)</div>
					<div className={styles.statsCardBody}>
						{by_department.length === 0 ? (
							<p className={styles.statsEmpty}>Chưa có dữ liệu</p>
						) : (
							<table className={styles.deptTable}>
								<thead>
									<tr>
										<th className={styles.dtTh}>#</th>
										<th className={`${styles.dtTh} ${styles.dtThName}`}>
											Phòng ban
										</th>
										<th className={`${styles.dtTh} ${styles.dtThNum}`}>
											Đề tài
										</th>
										<th className={styles.dtTh}>Tỷ lệ</th>
									</tr>
								</thead>
								<tbody>
									{by_department.map((d, i) => (
										<tr
											key={d.name}
											className={styles.dtRow}
										>
											<td className={`${styles.dtTd} ${styles.dtNum}`}>
												{i + 1}
											</td>
											<td className={styles.dtTd}>{d.name}</td>
											<td className={`${styles.dtTd} ${styles.dtNum}`}>
												<strong>{d.total}</strong>
											</td>
											<td className={styles.dtTd}>
												<div className={styles.barTrack}>
													<div
														className={styles.barFill}
														style={{ width: `${(d.total / maxDept) * 100}%` }}
													/>
												</div>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						)}
					</div>
				</div>

				<div className={styles.statsRightCol}>
					<div className={styles.statsCard}>
						<div className={styles.statsCardHead}>Theo phân loại</div>
						<div className={styles.statsCardBody}>
							{by_category.length === 0 ? (
								<p className={styles.statsEmpty}>Chưa có dữ liệu</p>
							) : (
								<ul className={styles.barList}>
									{by_category.map((c) => (
										<li
											key={c.name}
											className={styles.barItem}
										>
											<div className={styles.barMeta}>
												<span className={styles.barName}>{c.name}</span>
												<span className={styles.barCount}>{c.count}</span>
											</div>
											<div className={styles.barTrack}>
												<div
													className={styles.barFill}
													style={{ width: `${(c.count / maxCat) * 100}%` }}
												/>
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
					<div className={styles.statsCard}>
						<div className={styles.statsCardHead}>Theo cấp độ</div>
						<div className={styles.statsCardBody}>
							{by_level.length === 0 ? (
								<p className={styles.statsEmpty}>Chưa có dữ liệu</p>
							) : (
								<ul className={styles.barList}>
									{by_level.map((l) => (
										<li
											key={l.name}
											className={styles.barItem}
										>
											<div className={styles.barMeta}>
												<span className={styles.barName}>{l.name}</span>
												<span className={styles.barCount}>{l.count}</span>
											</div>
											<div className={styles.barTrack}>
												<div
													className={styles.barFill}
													style={{ width: `${(l.count / maxLvl) * 100}%` }}
												/>
											</div>
										</li>
									))}
								</ul>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* Recent approvals */}
			{recent_approvals.length > 0 && (
				<div className={styles.statsCard}>
					<div className={styles.statsCardHead}>Xét duyệt gần đây</div>
					<div className={styles.statsCardBody}>
						<ul className={styles.approvalList}>
							{recent_approvals.map((a) => (
								<li
									key={a.id}
									className={styles.approvalItem}
								>
									<span
										className={`${styles.approvalBadge} ${
											a.status === 'approved'
												? styles.badgeApproved
												: styles.badgeRejected
										}`}
									>
										{a.status === 'approved' ? 'Đã duyệt' : 'Từ chối'}
									</span>
									<span className={styles.approvalTitle}>{a.topic_title}</span>
									<span className={styles.approvalMeta}>
										{a.approver_name ?? '—'} · {fmtDate(a.created_at)}
									</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			)}
		</div>
	);
}

// ─── MAIN ─────────────────────────────────
export default function Reports() {
	const year = String(currentYear);

	// Tab
	const [activeTab, setActiveTab] = useState<'stats' | 'export'>('stats');

	// Stats
	const [stats, setStats] = useState<DashboardStats | null>(null);
	const [statsPhase, setStatsPhase] = useState<'loading' | 'ok' | 'err'>(
		'loading',
	);
	const [statsError, setStatsError] = useState('');
	const [statsKey, setStatsKey] = useState(0);

	// Retry resets state via event handler (not inside effect) to satisfy linter
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
					reportType === 'summary'
						? ['topics']
						: [...finalSections];
				const fnMap: Record<string, string> = {
					summary: `tong-hop-de-tai-${yearFilter}`,
					final:   `bao-cao-nckh-${yearFilter}`,
				};
				const titleMap: Record<string, string> = {
					summary: `TỔNG HỢP ĐỀ TÀI NGHIÊN CỨU KHOA HỌC NĂM ${yearFilter}`,
					final:   `BÁO CÁO TỔNG KẾT NGHIÊN CỨU KHOA HỌC NĂM ${yearFilter}`,
				};
				const fn = fnMap[reportType] ?? `bao-cao-nckh-${yearFilter}`;
				const blob = await exportTopicsReport({
					ids,
					fileName: fn,
					title:    titleMap[reportType] ?? fn,
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

			const data = await getTopicsExportData(ids);
			// PDF path
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
		const next = new Set(summaryCols);
		if (on) next.add(key);
		else next.delete(key);
		setSummaryCols(next);
	};
	const toggleSection = (key: ReportSection, on: boolean) => {
		const next = new Set(finalSections);
		if (on) next.add(key);
		else next.delete(key);
		setFinalSections(next);
	};
	const setOpt = <K extends keyof ScheduleOpts>(k: K, v: ScheduleOpts[K]) =>
		setScheduleOpts((p) => ({ ...p, [k]: v }));

	const activeType = REPORT_TYPES.find((r) => r.key === reportType)!;

	return (
		<AdminLayout
			pageTitle='Báo cáo & Thống kê'
			pageSubtitle='Thống kê tổng quan và xuất dữ liệu nghiên cứu khoa học'
		>
			{/* ── Tab bar ──────────────────────────── */}
			<div className={styles.tabBar}>
				<button
					className={activeTab === 'stats' ? styles.tabActive : styles.tab}
					onClick={() => setActiveTab('stats')}
				>
					<IcBarChart /> Thống kê tổng quan
				</button>
				<button
					className={activeTab === 'export' ? styles.tabActive : styles.tab}
					onClick={() => setActiveTab('export')}
				>
					<IcExport /> Xuất dữ liệu
				</button>
			</div>

			{/* ── Stats tab ────────────────────────── */}
			{activeTab === 'stats' && (
				<StatsPanel
					stats={stats}
					loading={statsPhase === 'loading'}
					error={statsError}
					onRetry={retryStats}
				/>
			)}

			{/* ── Export tab ───────────────────────── */}
			{activeTab === 'export' && (
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
									onClick={handleExport}
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
