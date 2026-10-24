import { useEffect, useState } from 'react';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { InlineLoading } from '@/shared/components/Loading';
import { Pagination } from '@/shared/components/Table/Pagination';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { showToast } from '@/shared/utils/feedback';
import { addRequiredStaff, getRequiredAbsentees } from '../api/seminarApi';
import type { RequiredAbsentee } from '../types/seminar.type';
import styles from '../pages/Seminar.module.css';

const REASON_LABELS: Record<RequiredAbsentee['reason'], string> = {
	not_listed: 'Chưa có trong danh sách',
	not_checked_in: 'Đăng ký nhưng chưa điểm danh',
};

const EXCEL_COLS: ExcelColumn<RequiredAbsentee>[] = [
	{ header: 'Mã NV', value: (x) => x.staff_number },
	{ header: 'Họ và tên', value: (x) => x.full_name },
	{ header: 'Khoa/phòng', value: (x) => x.department_name },
	{ header: 'Tình trạng', value: (x) => REASON_LABELS[x.reason] },
];

/**
 * Tập huấn bệnh viện: nhân viên thuộc khoa bắt buộc nhưng chưa tham dự. canAdd: nút
 * "Thêm N người chưa có trong danh sách" (thêm cả khoa bắt buộc 1 lần — GĐ6).
 */
export function RequiredAbsenteesCard({
	seminarId,
	version,
	canAdd = false,
	onAdded,
}: {
	seminarId: string;
	version: unknown;
	canAdd?: boolean;
	onAdded?: () => void;
}) {
	const [rows, setRows] = useState<RequiredAbsentee[]>([]);
	const [loading, setLoading] = useState(true);
	const [adding, setAdding] = useState(false);
	const notListed = rows.filter((x) => x.reason === 'not_listed').length;

	const addAll = async () => {
		if (!confirm(`Thêm ${notListed} nhân viên các khoa bắt buộc vào danh sách người tham dự (vai trò Học viên)?`)) return;
		setAdding(true);
		try {
			const r = await addRequiredStaff(seminarId);
			showToast('success', `Đã thêm ${r.inserted} người vào danh sách`);
			onAdded?.();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Thêm thất bại');
		} finally {
			setAdding(false);
		}
	};

	// version: đổi khi chi tiết buổi tập huấn tải lại (thêm/xoá người, điểm danh)
	useEffect(() => {
		let alive = true;
		getRequiredAbsentees(seminarId)
			.then((r) => alive && setRows(r))
			.catch(() => alive && showToast('error', 'Không tải được danh sách chưa tham dự'))
			.finally(() => alive && setLoading(false));
		return () => {
			alive = false;
		};
	}, [seminarId, version]);

	const pg = useClientPaging(rows);

	return (
		<div className={styles.tableCard} style={{ marginTop: 16 }}>
			<div className={styles.tableHeader}>
				<div className={styles.tableHeaderLeft}>
					<span className={styles.tableTitle}>Khoa bắt buộc — chưa tham dự</span>
					<span className={styles.tableCount}>{rows.length} người</span>
				</div>
				<div className={styles.tableControls}>
					{canAdd && notListed > 0 && (
						<button
							type='button'
							className={styles.btnPrimary}
							disabled={adding}
							title='Thêm mọi nhân viên đang làm việc của các khoa bắt buộc chưa có trong danh sách — chạy lại chỉ thêm người mới'
							onClick={() => void addAll()}
						>
							{adding ? 'Đang thêm…' : `Thêm ${notListed} người chưa có trong danh sách`}
						</button>
					)}
					<ExcelActions
						fileName='chua-tham-du-tap-huan'
						itemLabel='người chưa tham dự'
						columns={EXCEL_COLS}
						getRows={() => rows}
					/>
				</div>
			</div>
			{loading ? (
				<InlineLoading />
			) : (
				<>
					<div className={styles.tableWrap}>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={tbl.thIdx}>STT</th>
									<th>Mã NV</th>
									<th>Họ tên</th>
									<th>Khoa/phòng</th>
									<th>Tình trạng</th>
								</tr>
							</thead>
							<tbody>
								{rows.length === 0 ? (
									<tr>
										<td colSpan={5}>
											<div className={styles.emptyState}>
												<div className={styles.emptyDesc}>Mọi nhân viên thuộc khoa bắt buộc đã tham dự</div>
											</div>
										</td>
									</tr>
								) : (
									pg.paged.map((x, i) => (
										<tr key={x.id}>
											<td className={tbl.tdIdx}>{pg.offset + i + 1}</td>
											<td className={tbl.cellCode}>{x.staff_number ?? '—'}</td>
											<td className={tbl.cellTitle}>{x.full_name}</td>
											<td>{x.department_name || <span className={styles.muted}>—</span>}</td>
											<td>{REASON_LABELS[x.reason]}</td>
										</tr>
									))
								)}
							</tbody>
						</table>
					</div>
					<Pagination {...pg.pagination} itemLabel='người' />
				</>
			)}
		</div>
	);
}
