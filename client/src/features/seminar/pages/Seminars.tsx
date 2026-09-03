import { useNavigate } from 'react-router-dom';
import {
	CheckSvg,
	EditSvg,
	PlusSvg,
	SearchSvg,
	TrashSvg,
	UsersSvg,
	XSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge } from '@/shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import { SeminarDeleteModal } from '../components/SeminarDeleteModal';
import { SeminarFormModal } from '../components/SeminarFormModal';
import { useSeminars } from '../hooks/useSeminars';
import { EVENT_TYPE_LABELS, type SeminarEventType } from '../types/seminar.type';
import styles from './Seminar.module.css';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

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

	const headerActions = (
		<button className={styles.btnAddHeader} onClick={() => s.setModal('add')}>
			<PlusSvg /> Thêm hội thảo
		</button>
	);

	return (
		<AdminLayout
			pageTitle='Hội thảo & Hội nghị'
			pageSubtitle='Theo dõi cán bộ cử đi dự · sự kiện bệnh viện tổ chức · cấp CME'
			headerActions={headerActions}
		>
			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo tên, địa điểm, báo cáo viên...'
						value={s.search}
						onChange={(e) => s.setSearch(e.target.value)}
					/>
					{s.search && (
						<button className={styles.searchClear} onClick={() => s.setSearch('')}>
							<XSvg />
						</button>
					)}
				</div>

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

				<span className={styles.resultCount}>{s.total} sự kiện</span>
			</div>

			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th>#</th>
							<th>Tên / Nội dung</th>
							<th>Hình thức</th>
							<th>Phạm vi</th>
							<th>Thời gian</th>
							<th>Địa điểm</th>
							<th style={{ textAlign: 'center' }}>Người dự</th>
							<th style={{ textAlign: 'center' }}>CME</th>
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
									<td style={{ textAlign: 'center' }}>
										{row.manual_participant_count ?? row.participant_count ?? 0}
									</td>
									<td style={{ textAlign: 'center' }}>
										{row.grants_cme ? (
											<Badge tone='green'>
												{row.manual_cme_count ?? row.cme_issued_count ?? 0}
											</Badge>
										) : (
											<span className={styles.muted}>—</span>
										)}
									</td>
									<td className={styles.tdRight}>
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
											className={`${styles.actionBtn} ${styles.actionDelete}`}
											title='Xoá'
											onClick={() => {
												s.setDeleting(row);
												s.setModal('delete');
											}}
										>
											<TrashSvg />
										</button>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{s.total > 0 && (
				<Pagination
					page={s.page}
					totalPages={s.totalPages}
					total={s.total}
					rowsPerPage={s.pageSize}
					pageSizeOptions={PAGE_SIZE_OPTIONS}
					onPageChange={s.setPage}
					onRowsPerPageChange={(n) => {
						s.setPageSize(n);
						s.setPage(1);
					}}
					itemLabel='sự kiện'
				/>
			)}

			{s.modal === 'add' && (
				<SeminarFormModal
					mode='add'
					loading={s.loading}
					onClose={() => s.setModal(null)}
					onSave={s.handleAdd}
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

			{s.toast && (
				<div
					className={`${styles.toast} ${s.toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
				>
					{s.toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{s.toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}
