import { formatDateVN as fmtDate } from '../../../shared/utils/formatDate';
import type { ExportTopic, ReportSection } from '../../topics/api/topicApi';
import type { StatsExportSection } from '../api/reportApi';

export { fmtDate };

export const currentYear = new Date().getFullYear();
export type ReportType = 'summary' | 'schedule' | 'final';
export type ExportFormat = 'pdf' | 'xlsx';

export const STATUS_LABELS: Record<string, string> = {
	submitted: 'Chờ duyệt',
	approved: 'Đã phê duyệt',
	rejected: 'Từ chối',
	supplement: 'Bổ sung',
	cancelled: 'Đã hủy',
};

export const STATUS_OPTIONS = [
	{ value: '', label: 'Tất cả trạng thái' },
	...Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
];

export const SUMMARY_COLS = [
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
export type SummaryColKey = (typeof SUMMARY_COLS)[number]['key'];

export const DEFAULT_COLS: SummaryColKey[] = [
	'id',
	'title',
	'category_name',
	'level_name',
	'department_name',
	'status',
	'leader',
];

export const STATS_EXPORT_SECTIONS: {
	key: StatsExportSection;
	label: string;
	desc: string;
}[] = [
	{ key: 'overview', label: 'Tổng quan', desc: 'Tổng số đề tài, theo phân hệ, theo trạng thái' },
	{ key: 'by_specialty_group', label: 'Theo hệ', desc: 'Tổng hợp theo hệ chuyên môn' },
	{
		key: 'by_department_table',
		label: 'Theo khoa-phòng-TT',
		desc: 'Bảng đầy đủ từng khoa/phòng/trung tâm',
	},
	{
		key: 'by_department_detail',
		label: '1 sheet riêng cho từng khoa',
		desc: 'Chi tiết trạng thái và phân loại của mỗi khoa/phòng',
	},
];

export const FINAL_SECTIONS: { key: ReportSection; label: string }[] = [
	{ key: 'overview', label: 'Thống kê tổng quan' },
	{ key: 'topics', label: 'Danh sách đề tài (đầy đủ)' },
	{ key: 'members', label: 'Danh sách thành viên' },
	{ key: 'by_category', label: 'Sheet riêng theo phân loại' },
	{ key: 'by_department', label: 'Sheet riêng theo khoa/phòng' },
	{ key: 'by_specialty_group', label: 'Sheet riêng theo hệ chuyên môn' },
];

export interface ScheduleOpts {
	title: string;
	subtitle: string;
	refNumber: string;
	refDate: string;
	fileName: string;
}

export const REPORT_TYPES: {
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

export const BASE_CSS = `
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

export function esc(s: string | null | undefined): string {
	return (s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}


export function getLeader(t: ExportTopic): string {
	return t.members.find((m) => m.role === 'leader')?.ho_ten ?? '';
}

export function toRoman(n: number): string {
	return (
		['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] ??
		String(n)
	);
}

export function cellVal(t: ExportTopic, key: SummaryColKey): string {
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

export function openPrint(
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
			`${body}<p class="foot">Xuất ngày ${now} — Hệ thống Quản lý NCKH – Đào tạo – CME</p>` +
			`<script>window.onload=function(){setTimeout(function(){window.print();},350)}</` +
			`script>` +
			`</body></html>`,
	);
	win.document.close();
}

export function buildSummaryHtml(
	topics: ExportTopic[],
	cols: Set<SummaryColKey>,
	heading: string,
): string {
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

export function buildScheduleHtml(
	topics: ExportTopic[],
	o: ScheduleOpts,
): string {
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

export function buildFinalHtml(
	topics: ExportTopic[],
	sections: Set<string>,
	year: string,
): string {
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
