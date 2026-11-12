import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { showToast } from '@/shared/utils/feedback';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, type MenuProps } from 'antd';
import {
	DownloadSvg,
	EditSvg,
	MoreVSvg,
	PlusSvg,
	QrSvg,
	TrashSvg,
	UploadSvg,
	UsersSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge, TableEmpty, type BadgeTone } from '@/shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import { formatDateVN, toIsoDate } from '@/shared/utils/formatDate';
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
import ls from './Seminars.module.css';

/** "12–14/03/2026", "28/02 – 02/03/2026", "30/12/2025 – 02/01/2026"; không có ngày → date_text. */
function dateRange(row: Seminar): string {
	const start = toIsoDate(row.start_date);
	const end = toIsoDate(row.end_date);
	if (!start) return row.date_text || '';
	if (!end || end === start) return formatDateVN(start);
	const [sy, sm, sd] = start.split('-');
	const [ey, em, ed] = end.split('-');
	if (sy !== ey) return `${formatDateVN(start)} – ${formatDateVN(end)}`;
	return sm === em ? `${sd}–${ed}/${em}/${ey}` : `${sd}/${sm} – ${ed}/${em}/${ey}`;
}

function timeRange(row: Seminar): string {
	if (row.start_time && row.end_time) return `${row.start_time} – ${row.end_time}`;
	return row.start_time ? `Từ ${row.start_time}` : '';
}

/** Trạng thái suy từ ngày diễn ra so với hôm nay (không có ngày → không xác định). */
function eventPhase(row: Seminar): { label: string; tone: BadgeTone } | null {
	const start = toIsoDate(row.start_date);
	if (!start) return null;
	const end = toIsoDate(row.end_date) || start;
	const today = toIsoDate(new Date());
	if (today < start) return { label: 'Sắp diễn ra', tone: 'blue' };
	if (today > end) return { label: 'Đã kết thúc', tone: 'gray' };
	return { label: 'Đang diễn ra', tone: 'green' };
}

/** Nối các phần dòng phụ bằng dấu "·", bỏ phần rỗng. */
function joinMeta(parts: ReactNode[]): ReactNode[] {
	return parts
		.filter((p) => p !== null && p !== undefined && p !== false && p !== '')
		.flatMap((p, i) => [
			...(i > 0
				? [
						<span
							key={`sep${i}`}
							className={ls.sep}
						>
							·
						</span>,
					]
				: []),
			<span key={i}>{p}</span>,
		]);
}

const COLS = 6;

/**
 * Danh sách hội thảo; `hospitalTraining` = trang Tập huấn bệnh viện (cùng trang,
 * cố định loại 'training' + BV tổ chức, cột chủ đề / khoa tổ chức).
 */
export default function Seminars({ hospitalTraining = false }: { hospitalTraining?: boolean }) {
	const s = useSeminars(hospitalTraining);
	const navigate = useNavigate();
	const ht = hospitalTraining;
	const base = ht ? '/admin/hospital-trainings' : '/admin/seminars';

	const perms = useSeminarPerms();
	const [importOpen, setImportOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	// QR đăng ký của sự kiện BV tổ chức: xem/tải (modal) hoặc chiếu toàn màn hình
	const [qrSeminar, setQrSeminar] = useState<Seminar | null>(null);
	const [presenting, setPresenting] = useState<Seminar | null>(null);

	// Menu "…" của từng dòng: QR đăng ký (sự kiện BV tổ chức) · Sửa · Xóa
	const rowMenu = (row: Seminar): MenuProps['items'] => [
		...(row.scope === 'hosted' && row.public_token
			? [{ key: 'qr', icon: <QrSvg width={14} />, label: 'Mã QR đăng ký (tải / trình chiếu)' }]
			: []),
		{ key: 'edit', icon: <EditSvg width={14} />, label: 'Sửa thông tin sự kiện' },
		{ type: 'divider' as const },
		{ key: 'delete', icon: <TrashSvg width={14} />, label: 'Xóa', danger: true },
	];
	const onRowMenu = (row: Seminar, key: string) => {
		if (key === 'qr') setQrSeminar(row);
		else if (key === 'edit') {
			s.setEditing(row);
			s.setModal('edit');
		} else if (key === 'delete') {
			s.setDeleting(row);
			s.setModal('delete');
		}
	};

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
				hospital_training: ht ? '1' : '0',
			});
			saveBlob(blob, `${ht ? 'tap-huan-benh-vien' : 'hoi-thao-hoi-nghi'}${s.year ? `-${s.year}` : ''}.xlsx`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	const headerActions = (
		<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
			{perms.canImport && !ht && (
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
				<PlusSvg /> {ht ? 'Thêm buổi tập huấn' : 'Thêm hội thảo'}
			</button>
		</div>
	);

	return (
		<AdminLayout
			pageTitle={ht ? 'Tập huấn bệnh viện' : 'Hội thảo & hội nghị'}
			pageSubtitle={
				ht
					? 'Buổi tập huấn nội bộ · khoa bắt buộc tham dự · cấp CME theo số tiết'
					: 'Theo dõi cán bộ cử đi dự · sự kiện bệnh viện tổ chức · cấp CME'
			}
			headerActions={headerActions}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>{ht ? 'Danh sách buổi tập huấn' : 'Danh sách sự kiện'}</span>
						<span className={styles.tableCount}>
							{s.total} {ht ? 'buổi' : 'sự kiện'}
						</span>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={s.search}
							onChange={s.setSearch}
							placeholder='Tìm theo tên, địa điểm, báo cáo viên...'
						/>

						{!ht && (
							<>
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
							</>
						)}

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
					<table className={ls.table}>
						<thead>
							<tr>
								<th className={ls.thIdx}>STT</th>
								<th>{ht ? 'Buổi tập huấn' : 'Sự kiện'}</th>
								<th>Thời gian</th>
								<th className={ls.thStatus}>Trạng thái</th>
								<th>Tham dự</th>
								<th className={ls.thActions}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{s.loadingData ? (
								<SkeletonTable
									rows={s.pageSize || 8}
									cols={COLS}
								/>
							) : s.rows.length === 0 ? (
								<TableEmpty
									colSpan={COLS}
									title={ht ? 'Chưa có buổi tập huấn nào' : 'Chưa có sự kiện nào'}
									desc={<>{ht ? 'Thêm buổi tập huấn' : 'Thêm hội thảo/hội nghị'} hoặc đổi bộ lọc</>}
								/>
							) : (
								s.rows.map((row, i) => {
									const detailUrl = `${base}/${row.id}`;
									const when = dateRange(row);
									const time = timeRange(row);
									const phase = eventPhase(row);
									const phaseBadge = phase && (
										<Badge
											tone={phase.tone}
											dot
										>
											{phase.label}
										</Badge>
									);
									const people = row.manual_participant_count ?? row.participant_count ?? 0;
									const cmeCount = row.manual_cme_count ?? row.cme_issued_count ?? 0;
									const credits = ht ? row.lesson_hours : row.cme_default_credits;
									const meta = joinMeta(
										ht
											? [row.topic_name, row.organizer_department_name, row.location]
											: [
													<span className={ls.metaType}>{EVENT_TYPE_LABELS[row.event_type]}</span>,
													row.scope === 'hosted' ? (
														<span className={ls.hostedTag}>BV tổ chức</span>
													) : (
														'Cử đi dự'
													),
													row.location,
												],
									);
									const metaTitle = (
										ht
											? [row.topic_name, row.organizer_department_name, row.location]
											: [
													EVENT_TYPE_LABELS[row.event_type],
													row.scope === 'hosted' ? 'Bệnh viện tổ chức' : 'Cử cán bộ đi dự',
													row.location,
												]
									)
										.filter(Boolean)
										.join(' · ');

									return (
										<tr key={row.id}>
											<td className={ls.colIdx}>{(s.page - 1) * s.pageSize + i + 1}</td>
											<td className={ls.colEvent}>
												<button
													type='button'
													className={ls.title}
													title={row.title}
													onClick={() => navigate(detailUrl)}
												>
													{row.title}
												</button>
												{meta.length > 0 && (
													<div
														className={ls.meta}
														title={metaTitle}
													>
														{meta}
													</div>
												)}
											</td>
											<td className={ls.colTime}>
												{when ? (
													<div
														className={ls.main}
														title={row.date_text && row.date_text !== when ? row.date_text : undefined}
													>
														{when}
													</div>
												) : (
													<span className={ls.muted}>Chưa có ngày</span>
												)}
												{time && <div className={ls.sub}>{time}</div>}
												{phaseBadge && <div className={ls.phaseInline}>{phaseBadge}</div>}
											</td>
											<td className={ls.colStatus}>{phaseBadge ?? <span className={ls.muted}>—</span>}</td>
											<td className={ls.colPeople}>
												<div
													className={`${ls.main} ${ls.people}`}
													title={
														row.manual_participant_count != null
															? 'Số người tham dự (nhập tay)'
															: 'Số người trong danh sách tham dự'
													}
												>
													<UsersSvg /> {people}
												</div>
												<div className={ls.cmeLine}>
													{row.grants_cme ? (
														<>
															<Badge
																tone='green'
																title='Số người đã được cấp CME'
															>
																CME {cmeCount}
															</Badge>
															{credits != null && (
																<span className={ls.sub}>
																	{credits} {ht ? 'tiết' : 'tín chỉ'}
																</span>
															)}
														</>
													) : (
														<span className={ls.sub}>Không cấp CME</span>
													)}
												</div>
											</td>
											<td className={ls.colActions}>
												<div className={ls.actions}>
													<button
														type='button'
														className={ls.actionBtn}
														title='Người tham dự & cấp CME'
														aria-label='Người tham dự & cấp CME'
														onClick={() => navigate(detailUrl)}
													>
														<UsersSvg />
													</button>
													<Dropdown
														trigger={['click']}
														placement='bottomRight'
														menu={{
															items: rowMenu(row),
															onClick: ({ key, domEvent }) => {
																domEvent.stopPropagation();
																onRowMenu(row, key);
															},
														}}
													>
														<button
															type='button'
															className={ls.actionBtn}
															title='Thao tác khác'
															aria-label='Thao tác khác'
														>
															<MoreVSvg />
														</button>
													</Dropdown>
												</div>
											</td>
										</tr>
									);
								})
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
					itemLabel={ht ? 'buổi' : 'sự kiện'}
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
					hospitalTraining={ht}
					loading={s.loading}
					onClose={() => s.setModal(null)}
					onSave={async (form) => {
						// BV tổ chức → sang trang chi tiết, mở sẵn QR đăng ký để tải về
						const created = await s.handleAdd(form);
						if (created?.scope === 'hosted') navigate(`${base}/${created.id}?qr=1`);
					}}
				/>
			)}
			{s.modal === 'edit' && s.editing && (
				<SeminarFormModal
					mode='edit'
					hospitalTraining={ht}
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
