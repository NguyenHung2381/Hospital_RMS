import * as XLSX from 'xlsx';
import type { DashboardStats } from '../types/report.type';

export function exportStatsExcel(stats: DashboardStats, year: string) {
	const { by_department, by_article_type, overview } = stats;
	const deTai = by_article_type.find((a) => a.type === 'de_tai')?.count ?? 0;
	const baiBao = by_article_type.find((a) => a.type === 'bai_bao')?.count ?? 0;

	const wsPhanHe = XLSX.utils.aoa_to_sheet([
		['Phân hệ', 'Số lượng'],
		['Đề tài NCKH', deTai],
		['Bài báo & Tập san', baiBao],
		['Tổng cộng', overview.total],
	]);
	wsPhanHe['!cols'] = [{ wch: 24 }, { wch: 12 }];

	const wsDept = XLSX.utils.aoa_to_sheet([
		[
			'STT',
			'Khoa / Phòng / Trung tâm',
			'Đề tài NCKH',
			'Bài báo',
			'Tổng',
			'Chờ duyệt',
			'Đã duyệt',
			'Từ chối',
			'Bổ sung',
			'Huỷ',
			'Tỷ lệ duyệt (%)',
		],
		...by_department.map((d, i) => [
			i + 1,
			d.name,
			d.de_tai,
			d.bai_bao,
			d.total,
			d.by_status.submitted,
			d.by_status.approved,
			d.by_status.rejected,
			d.by_status.supplement,
			d.by_status.cancelled,
			Math.round(d.approval_rate * 1000) / 10,
		]),
	]);
	wsDept['!cols'] = [
		{ wch: 5 },
		{ wch: 32 },
		{ wch: 12 },
		{ wch: 10 },
		{ wch: 8 },
		{ wch: 10 },
		{ wch: 10 },
		{ wch: 10 },
		{ wch: 10 },
		{ wch: 8 },
		{ wch: 14 },
	];

	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, wsPhanHe, 'Theo phân hệ');
	XLSX.utils.book_append_sheet(wb, wsDept, 'Theo khoa-phòng-TT');

	XLSX.writeFile(wb, `thong-ke-de-tai-${year}.xlsx`);
}
