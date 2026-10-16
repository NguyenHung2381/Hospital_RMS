import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
	BadgeSvg,
	CheckSvg,
	ChevLSvg,
	ClipboardCheckSvg,
	DownloadSvg,
	EditSvg,
	FileTextSvg,
	MonitorSvg,
	PlusSvg,
	QrSvg,
	TrashSvg,
	UploadSvg,
	XSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { Badge } from '@/shared/components';
import { InlineLoading } from '../../../shared/components/Loading';
import {
	BulkBar,
	DeleteAllButton,
	SelectCheckbox,
} from '../../../shared/components/Table/RowSelect';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import { IssueCmeModal } from '../components/IssueCmeModal';
import { ParticipantFormModal } from '../components/ParticipantFormModal';
import { ParticipantImportModal } from '../components/ParticipantImportModal';
import { SeminarCheckInQrModal } from '../components/SeminarCheckInQrModal';
import { SeminarQrPresentation } from '../components/SeminarQrPresentation';
import { SeminarRegistrationQrModal } from '../components/SeminarRegistrationQrModal';
import { SeminarTestModal } from '../components/SeminarTestModal';
import { useSeminarDetail } from '../hooks/useSeminarDetail';
import { useSeminarPerms } from '../utils/perms';
import {
	CME_STATUS_LABELS,
	EVENT_TYPE_LABELS,
	PARTICIPATION_LABELS,
	SCOPE_LABELS,
	SOURCE_LABELS,
	type ParticipationType,
	type Seminar,
	type SeminarParticipant,
} from '../types/seminar.type';
import { SeminarAgendaModal } from '../components/SeminarAgendaModal';
import { parseAgenda } from '../utils/agenda';
import { exportSeminarDetailExcel } from '../api/seminarApi';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import styles from './Seminar.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

const TABS: { key: 'all' | ParticipationType; label: string }[] = [
	{ key: 'all', label: 'Tất cả' },
	{ key: 'attendee', label: 'Đại biểu' },
	{ key: 'speaker', label: 'Báo cáo viên' },
	{ key: 'trainee', label: 'Học viên' },
];

// Người tự đăng ký qua QR (có vé) phải điểm danh + nộp bài test (nếu có) mới
// được cấp CME — khớp CME_ELIGIBLE_SQL ở backend seminarParticipantService.
const cmeEligible = (p: SeminarParticipant, hasTest: boolean) =>
	!p.ticket_code || (!!p.checked_in_at && (!!p.test_submitted_at || !hasTest));

const fmtDate = (s: string | null | undefined) => {
	if (!s) return '';
	const d = new Date(s);
	return Number.isNaN(d.getTime())
		? s
		: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const withTime = (date: string | null, time: string | null) =>
	[time, fmtDate(date)].filter(Boolean).join(' ');
const timeRange = (a?: string | null, b?: string | null) =>
	a && b ? `${a} – ${b}` : a ? `từ ${a}` : b ? `đến ${b}` : '';

// "08:00 05/06/2026 – 17:00 06/06/2026"; không có ngày thì dùng chuỗi nhập tay
const seminarWhen = (s: Seminar) => {
	const from = withTime(s.start_date, s.start_time);
	const to = withTime(s.end_date || (s.end_time ? s.start_date : null), s.end_time);
	const sameDay = !s.end_date || s.end_date === s.start_date;
	const range =
		sameDay && s.start_time && s.end_time
			? `${s.start_time} – ${s.end_time} ${fmtDate(s.start_date)}`
			: [from, to && to !== from ? to : null].filter(Boolean).join(' – ');
	return range || s.date_text || '';
};

// Khung giờ làm bài test — ngày trống = ngày kết thúc (hoặc bắt đầu), khớp backend testWindow()
const testWhen = (s: Seminar) => {
	if (!s.test_start_time && !s.test_end_time) return '';
	const day = s.test_date || s.end_date || s.start_date;
	return `${timeRange(s.test_start_time, s.test_end_time)}${day ? ` · ${fmtDate(day)}` : ''}`;
};

export default function SeminarDetail() {
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const d = useSeminarDetail(id);
	const perms = useSeminarPerms();

	const [tab, setTab] = useState<'all' | ParticipationType>('all');
	const [formModal, setFormModal] = useState<'add' | 'edit' | null>(null);
	const [editing, setEditing] = useState<SeminarParticipant | null>(null);
	const [issueOpen, setIssueOpen] = useState(false);
	const [importOpen, setImportOpen] = useState(false);
	const [checkInQrOpen, setCheckInQrOpen] = useState(false);
	// ?qr=1: vừa tạo hội nghị → mở luôn QR đăng ký để tải về
	const [searchParams, setSearchParams] = useSearchParams();
	const [regQrOpen, setRegQrOpen] = useState(searchParams.get('qr') === '1');
	const [presentOpen, setPresentOpen] = useState(false);
	const [testOpen, setTestOpen] = useState(false);
	const [agendaOpen, setAgendaOpen] = useState(false);
	const [exporting, setExporting] = useState<'participants' | 'agenda' | null>(null);
	const agenda = useMemo(() => parseAgenda(d.seminar?.agenda ?? null), [d.seminar?.agenda]);

	// File luôn kèm sheet "Thông tin" (thời gian, khung giờ bài test...)
	const handleExport = async (part: 'participants' | 'agenda') => {
		if (!d.seminar) return;
		setExporting(part);
		try {
			const blob = await exportSeminarDetailExcel(d.seminar.id, [part]);
			const name = part === 'participants' ? 'nguoi-tham-du' : 'bai-hoc';
			saveBlob(blob, `${name}-${fileSlug(d.seminar.title).slice(0, 60)}.xlsx`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(null);
		}
	};

	const filtered = useMemo(
		() =>
			tab === 'all'
				? d.participants
				: d.participants.filter((p) => p.participation_type === tab),
		[d.participants, tab],
	);
	const pg = useClientPaging(filtered);
	const rowSel = useRowSelection(pg.paged.map((p) => p.id));
	const selected = filtered.filter((p) => rowSel.isSelected(p.id));
	const hasTest = !!d.seminar?.test_questions;
	const issuable = selected.filter((p) => p.cme_seq == null && cmeEligible(p, hasTest));
	const notEligible = selected.filter((p) => p.cme_seq == null).length - issuable.length;
	const hosted = d.seminar?.scope === 'hosted';

	if (d.notFound) {
		return (
			<AdminLayout pageTitle='Không tìm thấy'>
				<button className={styles.backLink} onClick={() => navigate('/admin/seminars')}>
					<ChevLSvg /> Quay lại danh sách
				</button>
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Sự kiện không tồn tại</div>
				</div>
			</AdminLayout>
		);
	}

	const sem = d.seminar;

	return (
		<AdminLayout
			pageTitle={sem?.title ?? 'Chi tiết hội thảo'}
			pageSubtitle={sem ? SCOPE_LABELS[sem.scope] : ''}
		>
			<button className={styles.backLink} onClick={() => navigate('/admin/seminars')}>
				<ChevLSvg /> Danh sách hội thảo
			</button>

			{d.loadingData || !sem ? (
				<InlineLoading />
			) : (
				<>
					<div className={styles.infoCard}>
						<div className={styles.infoGrid}>
							<Info label='Hình thức' value={EVENT_TYPE_LABELS[sem.event_type]} />
							<Info label='Thời gian' value={seminarWhen(sem) || '—'} />
							{sem.test_questions && (
								<Info
									label='Bài test cuối buổi'
									value={`${testWhen(sem) || 'Không giới hạn giờ'} · ${sem.test_open ? 'đang bật' : 'chưa bật'}`}
								/>
							)}
							<Info label='Địa điểm' value={sem.location || '—'} />
							<Info label='Năm' value={sem.event_year ?? '—'} />
							{sem.scope === 'hosted' && (
								<>
									<Info label='Chủ tọa' value={sem.host_chair || '—'} />
									<Info label='Báo cáo viên' value={sem.speakers || '—'} />
									<Info label='Công văn cấp phép' value={sem.permit_doc_no || '—'} />
									<Info label='Đơn vị phối hợp' value={sem.co_organizers || '—'} />
								</>
							)}
							<Info label='Người điều phối' value={sem.coordinator || '—'} />
							<Info
								label='Cấp CME'
								value={
									sem.grants_cme
										? `Có${sem.cme_default_credits ? ` · ${sem.cme_default_credits} tín chỉ` : ''}`
										: 'Không'
								}
							/>
						</div>
						{sem.notes && (
							<p style={{ marginTop: 12 }} className={styles.muted}>
								{sem.notes}
							</p>
						)}
					</div>

					<div className={styles.statsRow}>
						<Stat
							label='Người tham dự'
							value={sem.manual_participant_count ?? sem.participant_count ?? 0}
							hint={sem.manual_participant_count != null ? 'nhập tay' : undefined}
						/>
						<Stat
							label='Nội viện'
							value={sem.manual_internal_count ?? sem.internal_count ?? 0}
						/>
						<Stat
							label='Ngoại viện'
							value={sem.manual_external_count ?? sem.external_count ?? 0}
						/>
						<Stat
							label='Nước ngoài'
							value={sem.manual_foreign_count ?? sem.foreign_count ?? 0}
						/>
						<Stat
							label='Chứng chỉ CME'
							value={sem.manual_cme_count ?? sem.cme_issued_count ?? 0}
							hint={sem.manual_cme_count != null ? 'nhập tay' : undefined}
						/>
					</div>
					{(sem.manual_participant_count != null ||
						sem.manual_cme_count != null) && (
						<p className={styles.muted} style={{ marginTop: -8, marginBottom: 12 }}>
							Đang hiển thị số liệu tổng hợp nhập tay. Danh sách bên dưới chỉ là
							chi tiết bổ sung (có thể để trống).
						</p>
					)}

					<div className={styles.tableCard} style={{ marginBottom: 16 }}>
						<div className={styles.tableHeader}>
							<div className={styles.tableHeaderLeft}>
								<span className={styles.tableTitle}>Chương trình — Bài học</span>
								<span className={styles.tableCount}>{agenda.length} bài</span>
							</div>
							<div className={styles.tableControls}>
								{perms.canUpdate && (
									<button
										className={styles.btnGhost}
										onClick={() => setAgendaOpen(true)}
									>
										{agenda.length ? <EditSvg /> : <PlusSvg />}{' '}
										{agenda.length ? 'Sửa chương trình' : 'Thêm bài học'}
									</button>
								)}
								{perms.canExport && (
									<button
										className={styles.btnGhost}
										onClick={() => void handleExport('agenda')}
										disabled={!!exporting || agenda.length === 0}
									>
										{exporting === 'agenda' ? <span className={styles.spinner} /> : <DownloadSvg />} Xuất Excel
									</button>
								)}
							</div>
						</div>
						{agenda.length > 0 && (
							<div className={styles.tableWrap}>
								<table className={styles.table}>
									<thead>
										<tr>
											<th className={tbl.thIdx}>STT</th>
											<th>Thời gian</th>
											<th>Tên bài học / bài báo cáo</th>
											<th>Báo cáo viên</th>
											<th>Ghi chú</th>
										</tr>
									</thead>
									<tbody>
										{agenda.map((a, i) => (
											<tr key={i}>
												<td className={styles.tdIdx}>{i + 1}</td>
												<td>
													{timeRange(a.start_time, a.end_time) || <span className={styles.muted}>—</span>}
													{a.date && <div className={styles.muted}>{fmtDate(a.date)}</div>}
												</td>
												<td>
													<span className={tbl.cellTitle}>{a.title}</span>
												</td>
												<td>{a.speaker || <span className={styles.muted}>—</span>}</td>
												<td>{a.note || <span className={styles.muted}>—</span>}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</div>

					<div className={styles.tableCard}>
						<div className={styles.tableHeader}>
							<div className={styles.tableHeaderLeft}>
								<span className={styles.tableTitle}>Danh sách người tham dự</span>
								<span className={styles.tableCount}>{filtered.length} người</span>
							</div>
							<div className={styles.tableControls}>
								{perms.canUpdate && (
									<button
										className={styles.btnPrimary}
										onClick={() => {
											setEditing(null);
											setFormModal('add');
										}}
									>
										<PlusSvg /> Thêm người
									</button>
								)}
								{perms.canImport && (
									<button
										className={styles.btnGhost}
										onClick={() => setImportOpen(true)}
									>
										<UploadSvg /> Nhập Excel
									</button>
								)}
								{perms.canExport && (
									<button
										className={styles.btnGhost}
										onClick={() => void handleExport('participants')}
										disabled={!!exporting || d.participants.length === 0}
									>
										{exporting === 'participants' ? <span className={styles.spinner} /> : <DownloadSvg />} Xuất Excel
									</button>
								)}
								{perms.canUpdate && hosted && (
									<>
										<button
											className={styles.btnGhost}
											onClick={() => setRegQrOpen(true)}
										>
											<QrSvg /> QR đăng ký
										</button>
										<button
											className={styles.btnGhost}
											onClick={() => setPresentOpen(true)}
										>
											<MonitorSvg /> Trình chiếu QR
										</button>
										<button
											className={styles.btnGhost}
											onClick={() => navigate(`/admin/quet-ve/${sem.id}`)}
										>
											<ClipboardCheckSvg /> Quét vé điểm danh
										</button>
										<button
											className={styles.btnGhost}
											onClick={() => setTestOpen(true)}
										>
											<FileTextSvg /> Bài test{sem.test_open ? ' (đang mở)' : ''}
										</button>
									</>
								)}
								{perms.canUpdate && (
									<button
										className={styles.btnGhost}
										onClick={() => setCheckInQrOpen(true)}
									>
										<ClipboardCheckSvg /> Mã QR điểm danh
									</button>
								)}
								{perms.canCme && sem.grants_cme && selected.length > 0 && (
									<>
										<button className={styles.btnGhost} onClick={() => setIssueOpen(true)}>
											<BadgeSvg /> Cấp CME ({issuable.length})
										</button>
										<button
											className={styles.btnGhost}
											onClick={() =>
												d.setStatus(
													selected.filter((p) => p.cme_seq != null).map((p) => p.id),
													'signed',
												)
											}
										>
											<CheckSvg /> Đánh dấu đã ký
										</button>
									</>
								)}
								{perms.canUpdate && (
									<DeleteAllButton
										count={filtered.length}
										itemLabel='người tham dự'
										getIds={() => filtered.map((p) => p.id)}
										onDelete={d.removeMany}
										onDone={rowSel.clearSelection}
										disabled={d.loading}
									/>
								)}
							</div>
						</div>

						<div className={styles.tabs}>
							{TABS.map((t) => (
								<button
									key={t.key}
									className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
									onClick={() => {
										setTab(t.key);
										rowSel.clearSelection();
									}}
								>
									{t.label}
								</button>
							))}
						</div>

						<div className={styles.tableWrap}>
						<BulkBar
							rowSel={rowSel}
							itemLabel='người'
							loading={d.loading}
							onBulkDelete={d.removeMany}
						/>
						<table className={styles.table}>
							<thead>
								<tr>
									<th className={sel.checkCol}>
										<SelectCheckbox
											title='Chọn tất cả'
											checked={rowSel.allPageSelected}
											indeterminate={rowSel.somePageSelected && !rowSel.allPageSelected}
											onChange={rowSel.toggleSelectAll}
										/>
									</th>
									<th className={tbl.thIdx}>STT</th>
									<th>Họ tên</th>
									<th>Vai trò</th>
									<th>Nguồn</th>
									<th>Đơn vị / Khoa</th>
									{hosted && <th>Điểm danh</th>}
									{hosted && hasTest && <th>Bài test</th>}
									{sem.grants_cme && <th>SQĐ</th>}
									{sem.grants_cme && <th>Tín chỉ</th>}
									{sem.grants_cme && <th>CME</th>}
									<th className={styles.thRight}>Thao tác</th>
								</tr>
							</thead>
							<tbody>
								{filtered.length === 0 ? (
									<tr>
										<td colSpan={13}>
											<div className={styles.emptyState}>
												<div className={styles.emptyDesc}>Chưa có người nào</div>
											</div>
										</td>
									</tr>
								) : (
									pg.paged.map((p, i) => (
										<tr
											key={p.id}
											className={rowSel.isSelected(p.id) ? sel.rowSelected : undefined}
										>
											<td className={sel.checkCol}>
												<SelectCheckbox
													title='Chọn'
													checked={rowSel.isSelected(p.id)}
													onChange={() => rowSel.toggleSelect(p.id)}
												/>
											</td>
											<td className={styles.tdIdx}>{pg.offset + i + 1}</td>
											<td>
												<span className={tbl.cellTitle}>
													{p.title_prefix ? `${p.title_prefix} ` : ''}
													{p.full_name}
												</span>
												{p.phone && <div className={styles.muted}>{p.phone}</div>}
												{p.is_foreign && (
													<Badge
														tone='amber'
														style={{ marginLeft: 6 }}
													>
														NN
													</Badge>
												)}
											</td>
											<td>{PARTICIPATION_LABELS[p.participation_type]}</td>
											<td>{SOURCE_LABELS[p.source]}</td>
											<td>
												{p.organization ||
													p.user_department_name ||
													p.department_raw || <span className={styles.muted}>—</span>}
											</td>
											{hosted && (
												<td>
													{p.checked_in_at ? (
														<Badge tone='green'>{formatDateTimeVN(p.checked_in_at)}</Badge>
													) : (
														<span className={styles.muted}>—</span>
													)}
												</td>
											)}
											{hosted && hasTest && (
												<td>
													{p.test_submitted_at ? (
														`${p.test_correct}/${p.test_total}`
													) : (
														<span className={styles.muted}>—</span>
													)}
												</td>
											)}
											{sem.grants_cme && (
												<td className={styles.mono}>
													{p.cme_certificate_no || <span className={styles.muted}>—</span>}
												</td>
											)}
											{sem.grants_cme && (
												<td>{p.cme_credits ?? <span className={styles.muted}>—</span>}</td>
											)}
											{sem.grants_cme && (
												<td>
													<Badge
														tone={
															p.cme_status === 'signed'
																? 'green'
																: p.cme_status === 'issued'
																	? 'blue'
																	: 'gray'
														}
													>
														{CME_STATUS_LABELS[p.cme_status]}
													</Badge>
												</td>
											)}
											<td className={styles.tdRight}>
												<div className={styles.actionBtns}>
													{perms.canUpdate && (
														<button
															className={styles.actionBtn}
															title='Sửa'
															onClick={() => {
																setEditing(p);
																setFormModal('edit');
															}}
														>
															<EditSvg />
														</button>
													)}
													{perms.canCme && p.cme_seq != null && (
														<button
															className={styles.actionBtn}
															title='Thu hồi số CME'
															onClick={() => d.revoke(p.id)}
														>
															<XSvg />
														</button>
													)}
													{perms.canUpdate && (
														<button
															className={`${styles.actionBtn} ${styles.danger}`}
															title='Xoá'
															onClick={() => d.removeOne(p.id)}
														>
															<TrashSvg />
														</button>
													)}
												</div>
											</td>
										</tr>
									))
								)}
							</tbody>
						</table>
						</div>
						<Pagination
							{...pg.pagination}
							itemLabel='người'
						/>
					</div>
				</>
			)}

			{formModal && (
				<ParticipantFormModal
					mode={formModal}
					participant={editing}
					loading={d.loading}
					onClose={() => {
						setFormModal(null);
						setEditing(null);
					}}
					onSave={async (form) => {
						const ok = editing
							? await d.editOne(editing.id, form)
							: await d.addOne(form);
						if (ok) {
							setFormModal(null);
							setEditing(null);
						}
					}}
				/>
			)}

			{checkInQrOpen && sem && (
				<SeminarCheckInQrModal
					seminarId={sem.id}
					onClose={() => setCheckInQrOpen(false)}
				/>
			)}

			{regQrOpen && sem && (
				<SeminarRegistrationQrModal
					seminar={sem}
					onClose={() => {
						setRegQrOpen(false);
						if (searchParams.has('qr')) setSearchParams({}, { replace: true });
					}}
					onPresent={() => {
						setRegQrOpen(false);
						if (searchParams.has('qr')) setSearchParams({}, { replace: true });
						setPresentOpen(true);
					}}
				/>
			)}

			{presentOpen && sem && (
				<SeminarQrPresentation
					seminar={sem}
					onClose={() => setPresentOpen(false)}
				/>
			)}


			{testOpen && sem && (
				<SeminarTestModal
					seminar={sem}
					onClose={() => setTestOpen(false)}
					onSaved={d.refresh}
				/>
			)}

			{agendaOpen && sem && (
				<SeminarAgendaModal
					seminar={sem}
					onClose={() => setAgendaOpen(false)}
					onSaved={d.refresh}
				/>
			)}

			{importOpen && sem && (
				<ParticipantImportModal
					seminarId={sem.id}
					grantsCme={sem.grants_cme}
					eventYear={sem.event_year}
					defaultCredits={sem.cme_default_credits}
					onClose={() => setImportOpen(false)}
					onDone={() => d.refresh()}
				/>
			)}

			{issueOpen && sem && (
				<IssueCmeModal
					targets={issuable}
					notEligible={notEligible}
					defaultYear={sem.event_year}
					registerLastSeq={null}
					loading={d.loading}
					onClose={() => setIssueOpen(false)}
					onConfirm={async (year) => {
						const ok = await d.issue(
							issuable.map((p) => p.id),
							year,
						);
						if (ok) {
							setIssueOpen(false);
							rowSel.clearSelection();
						}
					}}
				/>
			)}

		</AdminLayout>
	);
}

function Info({ label, value }: { label: string; value: ReactNode }) {
	return (
		<div className={styles.infoItem}>
			<span className={styles.infoLabel}>{label}</span>
			<span className={styles.infoValue}>{value}</span>
		</div>
	);
}

function Stat({
	label,
	value,
	hint,
}: {
	label: string;
	value: ReactNode;
	hint?: string;
}) {
	return (
		<div className={styles.statCard}>
			<div className={styles.statValue}>{value}</div>
			<div className={styles.statLabel}>
				{label}
				{hint ? ` · ${hint}` : ''}
			</div>
		</div>
	);
}
