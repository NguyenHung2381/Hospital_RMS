import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { showToast } from '@/shared/utils/feedback';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	DownloadSvg,
	EditSvg,
	PlusSvg,
	QrSvg,
	TrashSvg,
	UploadSvg,
	UsersSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge } from '@/shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import { SeminarDeleteModal } from '../components/SeminarDeleteModal';
import { SeminarFormModal } from '../components/SeminarFormModal';
import { SeminarListImportModal } from '../components/SeminarListImportModal';
import { SeminarQrPresentation } from '../components/SeminarQrPresentation';
import { SeminarRegistrationQrModal } from '../components/SeminarRegistrationQrModal';
import { exportSeminarsExcel } from '../api/seminarApi';
import { saveBlob } from '@/shared/utils/saveBlob';
import { useSeminarPerms } from '../utils/perms';
import { useSeminars } from '../hooks/useSeminars';
import { EVENT_TYPE_LABELS, type Seminar, type SeminarEventType } from '../types/seminar.type';
import styles from './Seminar.module.css';
import tbl from '@/shared/components/Table/Table.module.css';


const fmtDate = (s: string | null, text: string | null) => {
	if (text) return text;
	if (!s) return '';
	const d = new Date(s);
	return Number.isNaN(d.getTime())
		? s
		: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function Seminars() {
	const s = useSeminars();
	const navigate = useNavigate();

	const perms = useSeminarPerms();
	const [importOpen, setImportOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	// QR đăng ký của sự kiện BV tổ chức: xem/tải (modal) hoặc chiếu toàn màn hình
	const [qrSeminar, setQrSeminar] = useState<Seminar | null>(null);
	const [presenting, setPresenting] = useState<Seminar | null>(null);

	// Xuất đúng tập đang lọc trên bảng (mọi trang, không chỉ trang hiện tại)
	const handleExport = async () => {
		setExporting(true);
		try {
			const blob = await exportSeminarsExcel({
				search: s.search.trim() || undefined,
				scope: s.scope || undefined,
				event_type: s.eventType || undefined,
				year: s.year || undefined,
				grants_cme: s.onlyCme ? '1' : undefined,
			});
			saveBlob(blob, `hoi-thao-hoi-nghi${s.year ? `-${s.year}` : ''}.xlsx`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	const headerActions = (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
			{perms.canImport && (
				<button className={styles.btnGhost} onClick={() => setImportOpen(true)}>
					<UploadSvg /> Nhập Excel
				</button>
			)}
			{perms.canExport && (
				<button
					className={styles.btnGhost}
					onClick={handleExport}
					disabled={exporting || s.total === 0}
					title={s.total === 0 ? 'Không có sự kiện nào để xuất' : 'Xuất các sự kiện đang lọc'}
				>
					{exporting ? <span className={styles.spinner} /> : <DownloadSvg />} Xuất Excel
				</button>
			)}
			<button className={styles.btnAddHeader} onClick={() => s.setModal('add')}>
				<PlusSvg /> Thêm hội thảo
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle='Hội thảo & Hội nghị'
			pageSubtitle='Theo dõi cán bộ cử đi dự · sự kiện bệnh viện tổ chức · cấp CME'
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách sự kiện</span>
						<span className={styles.tableCount}>{s.total} sự kiện</span>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={s.search}
							onChange={s.setSearch}
							placeholder='Tìm theo tên, địa điểm, báo cáo viên...'
						/>

						<select
							className={styles.filterSelect}
							value={s.scope}
							onChange={(e) => {
								s.setScope(e.target.value);
								s.setPage(1);
							}}
						>
							<option value=''>Mọi phạm vi</option>
							<option value='external'>Đơn vị ngoài tổ chức</option>
							<option value='hosted'>Bệnh viện tổ chức</option>
						</select>

						<select
							className={styles.filterSelect}
							value={s.eventType}
							onChange={(e) => {
								s.setEventType(e.target.value);
								s.setPage(1);
							}}
						>
							<option value=''>Mọi hình thức</option>
							{(Object.keys(EVENT_TYPE_LABELS) as SeminarEventType[]).map((t) => (
								<option key={t} value={t}>
									{EVENT_TYPE_LABELS[t]}
								</option>
							))}
						</select>

						<input
							className={styles.filterSelect}
							style={{ width: 90 }}
							placeholder='Năm'
							inputMode='numeric'
							value={s.year}
							onChange={(e) => {
								s.setYear(e.target.value.replace(/\D/g, ''));
								s.setPage(1);
							}}
						/>

						<label className={styles.checkFilter}>
							<input
								type='checkbox'
								checked={s.onlyCme}
								onChange={(e) => {
									s.setOnlyCme(e.target.checked);
									s.setPage(1);
								}}
							/>
							Có cấp CME
						</label>
					</div>
				</div>

				<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th className={tbl.thIdx}>STT</th>
							<th>Tên / Nội dung</th>
							<th>Hình thức</th>
							<th>Phạm vi</th>
							<th>Thời gian</th>
							<th>Địa điểm</th>
							<th className={styles.thCenter}>Người dự</th>
							<th className={styles.thCenter}>CME</th>
							<th className={styles.thRight}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{s.loadingData ? (
							<SkeletonTable
								rows={s.pageSize || 8}
								cols={9}
							/>
						) : s.rows.length === 0 ? (
							<tr>
								<td colSpan={9}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>Chưa có sự kiện nào</div>
										<div className={styles.emptyDesc}>
											Thêm hội thảo/hội nghị hoặc đổi bộ lọc
										</div>
									</div>
								</td>
							</tr>
						) : (
							s.rows.map((row, i) => (
								<tr key={row.id}>
									<td className={styles.tdIdx}>
										{(s.page - 1) * s.pageSize + i + 1}
									</td>
									<td>
										<span
											className={styles.linkTitle}
											onClick={() => navigate(`/admin/seminars/${row.id}`)}
										>
											{row.title}
										</span>
									</td>
									<td>
										<Badge tone='blue'>
											{EVENT_TYPE_LABELS[row.event_type]}
										</Badge>
									</td>
									<td>
										<Badge tone='gray'>
											{row.scope === 'hosted' ? 'BV tổ chức' : 'Cử đi dự'}
										</Badge>
									</td>
									<td>{fmtDate(row.start_date, row.date_text) || <span className={styles.muted}>—</span>}</td>
									<td>{row.location || <span className={styles.muted}>—</span>}</td>
									<td className={styles.tdCenter}>
										{row.manual_participant_count ?? row.participant_count ?? 0}
									</td>
									<td className={styles.tdCenter}>
										{row.grants_cme ? (
											<Badge tone='green'>
												{row.manual_cme_count ?? row.cme_issued_count ?? 0}
											</Badge>
										) : (
											<span className={styles.muted}>—</span>
										)}
									</td>
									<td className={styles.tdRight}>
										<div className={styles.actionBtns}>
											{row.scope === 'hosted' && row.public_token && (
												<button
													className={styles.actionBtn}
													title='Mã QR đăng ký (tải / trình chiếu)'
													onClick={() => setQrSeminar(row)}
												>
													<QrSvg />
												</button>
											)}
											<button
												className={styles.actionBtn}
												title='Người tham dự & cấp CME'
												onClick={() => navigate(`/admin/seminars/${row.id}`)}
											>
												<UsersSvg />
											</button>
											<button
												className={styles.actionBtn}
												title='Sửa thông tin sự kiện'
												onClick={() => {
													s.setEditing(row);
													s.setModal('edit');
												}}
											>
												<EditSvg />
											</button>
											<button
												className={`${styles.actionBtn} ${styles.danger}`}
												title='Xoá'
												onClick={() => {
													s.setDeleting(row);
													s.setModal('delete');
												}}
											>
												<TrashSvg />
											</button>
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
				</div>

								<Pagination
					page={s.page}
					totalPages={s.totalPages}
					total={s.total}
					rowsPerPage={s.pageSize}
					onPageChange={s.setPage}
					onRowsPerPageChange={(n) => {
						s.setPageSize(n);
						s.setPage(1);
					}}
					itemLabel='sự kiện'
				/>
			</div>

			{qrSeminar && (
				<SeminarRegistrationQrModal
					seminar={qrSeminar}
					onClose={() => setQrSeminar(null)}
					onPresent={() => {
						setPresenting(qrSeminar);
						setQrSeminar(null);
					}}
				/>
			)}

			{presenting && (
				<SeminarQrPresentation
					seminar={presenting}
					onClose={() => setPresenting(null)}
				/>
			)}

			{importOpen && (
				<SeminarListImportModal
					onClose={() => setImportOpen(false)}
					onDone={() => {
						s.refresh();
						showToast('success', 'Đã nhập danh sách hội thảo từ Excel');
					}}
				/>
			)}

			{s.modal === 'add' && (
				<SeminarFormModal
					mode='add'
					loading={s.loading}
					onClose={() => s.setModal(null)}
					onSave={async (form) => {
						// BV tổ chức → sang trang chi tiết, mở sẵn QR đăng ký để tải về
						const created = await s.handleAdd(form);
						if (created?.scope === 'hosted') navigate(`/admin/seminars/${created.id}?qr=1`);
					}}
				/>
			)}
			{s.modal === 'edit' && s.editing && (
				<SeminarFormModal
					mode='edit'
					seminar={s.editing}
					loading={s.loading}
					onClose={() => {
						s.setModal(null);
						s.setEditing(null);
					}}
					onSave={s.handleEdit}
				/>
			)}
			{s.modal === 'delete' && s.deleting && (
				<SeminarDeleteModal
					seminar={s.deleting}
					loading={s.loading}
					onClose={() => {
						s.setModal(null);
						s.setDeleting(null);
					}}
					onConfirm={s.handleDelete}
				/>
			)}

		</AdminLayout>
	);
}
