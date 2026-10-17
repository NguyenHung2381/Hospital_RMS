import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
	BadgeSvg,
	BuildingSvg,
	CheckSvg,
	ChevLSvg,
	ChevRSvg,
	ClipboardCheckSvg,
	ClockSvg,
	DownloadSvg,
	EditSvg,
	FileTextSvg,
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
	BulkButton,
	DeleteAllButton,
	SelectCheckbox,
} from '../../../shared/components/Table/RowSelect';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import { formatDateTimeVN } from '../../../shared/utils/formatDate';
import { IssueCmeModal } from '../components/IssueCmeModal';
import { ParticipantFormModal } from '../components/ParticipantFormModal';
import { ParticipantImportModal } from '../components/ParticipantImportModal';
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

// Điểm bài test — bài nộp trước khi có điểm từng câu: mỗi câu đúng 1 điểm
const testScore = (p: SeminarParticipant) => p.test_score ?? p.test_correct;
const testPassed = (s: Seminar, p: SeminarParticipant) =>
	s.test_pass_score == null || (testScore(p) ?? -1) >= s.test_pass_score;

// Người tự đăng ký qua QR (có vé) phải điểm danh + nộp bài test (nếu có, và đạt
// điểm đạt nếu đặt) mới được cấp CME — khớp CME_ELIGIBLE_SQL ở backend seminarParticipantService.
const cmeEligible = (p: SeminarParticipant, s: Seminar) =>
	!p.ticket_code || (!!p.checked_in_at && (!s.test_questions || (!!p.test_submitted_at && testPassed(s, p))));

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

// Khung giờ làm bài test — ngày mở trống = ngày kết thúc (hoặc bắt đầu), ngày dừng
// tiếp nhận trống = ngày mở; khớp backend testWindow()
const testWhen = (s: Seminar) => {
	if (!s.test_start_time && !s.test_end_time) return '';
	const day = s.test_date || s.end_date || s.start_date;
	const endDay = s.test_end_date || day;
	if (s.test_end_time && endDay && endDay.slice(0, 10) !== day?.slice(0, 10))
		return [withTime(s.test_start_time ? day : null, s.test_start_time), withTime(endDay, s.test_end_time)]
			.filter(Boolean)
			.join(' – ');
	return `${timeRange(s.test_start_time, s.test_end_time)}${day ? ` · ${fmtDate(day)}` : ''}`;
};

const parseTestQuestions = (s: Seminar): { points?: number }[] => {
	try {
		const list = JSON.parse(s.test_questions || '[]');
		return Array.isArray(list) ? list : [];
	} catch {
		return [];
	}
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
	// ?qr=1: vừa tạo hội nghị → mở luôn QR đăng ký để tải về
	const [searchParams, setSearchParams] = useSearchParams();
	const [regQrOpen, setRegQrOpen] = useState(searchParams.get('qr') === '1');
	const [presentOpen, setPresentOpen] = useState(false);
	const [testOpen, setTestOpen] = useState(false);
	const [agendaOpen, setAgendaOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	const agenda = useMemo(() => parseAgenda(d.seminar?.agenda ?? null), [d.seminar?.agenda]);

	// 1 file gồm sheet Thông tin + Người tham dự + Chương trình
	const handleExport = async () => {
		if (!d.seminar) return;
		setExporting(true);
		try {
			const blob = await exportSeminarDetailExcel(d.seminar.id);
			saveBlob(blob, `hoi-nghi-${fileSlug(d.seminar.title).slice(0, 60)}.xlsx`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	const filtered = useMemo(
		() => (tab === 'all' ? d.participants : d.participants.filter((p) => p.participation_type === tab)),
		[d.participants, tab],
	);
	const pg = useClientPaging(filtered);
	const rowSel = useRowSelection(pg.paged.map((p) => p.id));
	const selected = filtered.filter((p) => rowSel.isSelected(p.id));
	const hasTest = !!d.seminar?.test_questions;
	const issuable = selected.filter((p) => p.cme_seq == null && !!d.seminar && cmeEligible(p, d.seminar));
	const notEligible = selected.filter((p) => p.cme_seq == null).length - issuable.length;
	const signable = selected.filter((p) => p.cme_seq != null && p.cme_status !== 'signed');
	const hosted = d.seminar?.scope === 'hosted';

	const counts = useMemo(
		() => ({
			registered: d.participants.filter((p) => p.ticket_code).length,
			checkedIn: d.participants.filter((p) => p.checked_in_at).length,
			submitted: d.participants.filter((p) => p.test_submitted_at).length,
		}),
		[d.participants],
	);

	const closeRegQr = () => {
		setRegQrOpen(false);
		if (searchParams.has('qr')) setSearchParams({}, { replace: true });
	};

	if (d.notFound) {
		return (
			<AdminLayout pageTitle='Không tìm thấy'>
				<button
					className={styles.backLink}
					onClick={() => navigate('/admin/seminars')}
				>
					<ChevLSvg /> Quay lại danh sách
				</button>
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Sự kiện không tồn tại</div>
				</div>
			</AdminLayout>
		);
	}

	const sem = d.seminar;
	const testQuestions = sem ? parseTestQuestions(sem) : [];
	const testPoints =
		Math.round(testQuestions.reduce((n, q) => n + (q.points && q.points > 0 ? q.points : 1), 0) * 100) / 100;
	// Thông tin phụ — chỉ hiện ô có dữ liệu
	const details = sem
		? ([
				['Chủ tọa', sem.host_chair],
				['Báo cáo viên', sem.speakers],
				['Người điều phối', sem.coordinator],
				['Đơn vị phối hợp', sem.co_organizers],
				['Công văn cấp phép', sem.permit_doc_no],
			].filter(([, v]) => !!v) as [string, string][])
		: [];

	return (
		<AdminLayout
			pageTitle={sem?.title ?? 'Chi tiết hội thảo'}
			pageSubtitle={sem ? SCOPE_LABELS[sem.scope] : ''}
		>
			<button
				className={styles.backLink}
				onClick={() => navigate('/admin/seminars')}
			>
				<ChevLSvg /> Danh sách hội thảo
			</button>

			{d.loadingData || !sem ? (
				<InlineLoading />
			) : (
				<>
					{/* ── Tổng quan ── */}
					<section className={styles.overview}>
						<div className={styles.overviewHead}>
							<div className={styles.chips}>
								<span className={styles.chip}>{EVENT_TYPE_LABELS[sem.event_type]}</span>
								{sem.event_year && <span className={styles.chip}>Năm {sem.event_year}</span>}
								{sem.grants_cme && (
									<span className={`${styles.chip} ${styles.chipGreen}`}>
										Cấp CME{sem.cme_default_credits ? ` · ${sem.cme_default_credits} tín chỉ` : ''}
									</span>
								)}
							</div>
							{perms.canExport && (
								<button
									className={styles.btnGhost}
									onClick={() => void handleExport()}
									disabled={exporting}
									title='Một file gồm thông tin, người tham dự và chương trình'
								>
									{exporting ? <span className={styles.spinner} /> : <DownloadSvg />} Xuất Excel
								</button>
							)}
						</div>

						<div className={styles.metaRow}>
							<span className={styles.metaItem}>
								<ClockSvg /> {seminarWhen(sem) || 'Chưa có thời gian'}
							</span>
							{sem.location && (
								<span className={styles.metaItem}>
									<BuildingSvg /> {sem.location}
								</span>
							)}
						</div>

						{details.length > 0 && (
							<dl className={styles.detailGrid}>
								{details.map(([label, value]) => (
									<div key={label}>
										<dt>{label}</dt>
										<dd>{value}</dd>
									</div>
								))}
							</dl>
						)}
						{sem.notes && <p className={styles.overviewNote}>{sem.notes}</p>}

						<div className={styles.statStrip}>
							<Stat
								label='Người tham dự'
								value={sem.manual_participant_count ?? sem.participant_count ?? 0}
								manual={sem.manual_participant_count != null}
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
							{sem.grants_cme && (
								<Stat
									label='Đã cấp CME'
									value={sem.manual_cme_count ?? sem.cme_issued_count ?? 0}
									manual={sem.manual_cme_count != null}
								/>
							)}
						</div>
						{(sem.manual_participant_count != null || sem.manual_cme_count != null) && (
							<p className={styles.hint}>
								* Số liệu nhập tay — danh sách bên dưới chỉ là chi tiết bổ sung.
							</p>
						)}
					</section>

					{/* ── Công cụ tổ chức (hội nghị BV tổ chức) ── */}
					{hosted && perms.canUpdate && (
						<section className={styles.orgGrid}>
							<OrgTile
								icon={<QrSvg />}
								title='Đăng ký tham dự'
								status={<span className={styles.orgCount}>{counts.registered}</span>}
								desc='người tự đăng ký qua QR'
								action='Mở mã QR'
								onClick={() => setRegQrOpen(true)}
							/>
							<OrgTile
								icon={<ClipboardCheckSvg />}
								title='Điểm danh'
								status={
									<span className={styles.orgCount}>
										{counts.checkedIn}
										<small>/{d.participants.length}</small>
									</span>
								}
								desc='người đã điểm danh'
								action='Quét vé'
								onClick={() => navigate(`/admin/quet-ve/${sem.id}`)}
							/>
							<OrgTile
								icon={<FileTextSvg />}
								title='Bài test cuối buổi'
								status={
									!testQuestions.length ? (
										<Badge tone='gray'>Chưa soạn</Badge>
									) : sem.test_open ? (
										<Badge tone='green'>Đang mở</Badge>
									) : (
										<Badge tone='amber'>Chưa bật</Badge>
									)
								}
								desc={
									testQuestions.length
										? [
												`${testQuestions.length} câu · ${testPoints} điểm`,
												sem.test_duration_minutes ? `${sem.test_duration_minutes} phút` : null,
												`${counts.submitted} đã nộp`,
											]
												.filter(Boolean)
												.join(' · ')
										: 'Soạn câu hỏi, đặt giờ mở và điểm đạt'
								}
								hint={testQuestions.length ? testWhen(sem) : undefined}
								action={testQuestions.length ? 'Cấu hình' : 'Soạn bài test'}
								onClick={() => setTestOpen(true)}
							/>
						</section>
					)}

					{/* ── Chương trình ── */}
					<div
						className={styles.tableCard}
						style={{ marginBottom: 16 }}
					>
						<div className={styles.tableHeader}>
							<div className={styles.tableHeaderLeft}>
								<span className={styles.tableTitle}>Chương trình</span>
								<span className={styles.tableCount}>{agenda.length} bài</span>
							</div>
							{perms.canUpdate && (
								<div className={styles.tableControls}>
									<button
										className={styles.btnGhost}
										onClick={() => setAgendaOpen(true)}
									>
										{agenda.length ? <EditSvg /> : <PlusSvg />} {agenda.length ? 'Sửa' : 'Thêm bài học'}
									</button>
								</div>
							)}
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
												<td className={styles.cmeNowrap}>
													{timeRange(a.start_time, a.end_time) || <span className={styles.muted}>—</span>}
													{a.date && <div className={styles.cellSub}>{fmtDate(a.date)}</div>}
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

					{/* ── Người tham dự ── */}
					<div className={styles.tableCard}>
						<div className={styles.tableHeader}>
							<div className={styles.tableHeaderLeft}>
								<span className={styles.tableTitle}>Người tham dự</span>
								<span className={styles.tableCount}>{filtered.length} người</span>
							</div>
							<div className={styles.tableControls}>
								{perms.canImport && (
									<button
										className={styles.btnGhost}
										onClick={() => setImportOpen(true)}
									>
										<UploadSvg /> Nhập Excel
									</button>
								)}
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
							</div>
						</div>

						<div className={styles.tabsRow}>
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

						<div className={styles.tableWrap}>
							<BulkBar
								rowSel={rowSel}
								itemLabel='người'
								loading={d.loading}
								onBulkDelete={d.removeMany}
								extraActions={
									perms.canCme &&
									sem.grants_cme && (
										<>
											<BulkButton
												onClick={() => setIssueOpen(true)}
												disabled={!issuable.length}
											>
												<BadgeSvg /> Cấp CME ({issuable.length})
											</BulkButton>
											<BulkButton
												onClick={() =>
													d.setStatus(
														signable.map((p) => p.id),
														'signed',
													)
												}
												disabled={!signable.length}
											>
												<CheckSvg /> Đã ký ({signable.length})
											</BulkButton>
										</>
									)
								}
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
										<th>Đơn vị / Khoa</th>
										{hosted && <th>Điểm danh</th>}
										{hosted && hasTest && <th>Bài test</th>}
										{sem.grants_cme && <th>CME</th>}
										<th className={styles.thRight} />
									</tr>
								</thead>
								<tbody>
									{filtered.length === 0 ? (
										<tr>
											<td colSpan={10}>
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
													{p.is_foreign && (
														<Badge
															tone='amber'
															style={{ marginLeft: 6 }}
														>
															NN
														</Badge>
													)}
													{p.phone && <div className={styles.cellSub}>{p.phone}</div>}
												</td>
												<td>
													{PARTICIPATION_LABELS[p.participation_type]}
													<div className={styles.cellSub}>{SOURCE_LABELS[p.source]}</div>
												</td>
												<td>
													{p.organization || p.user_department_name || p.department_raw || (
														<span className={styles.muted}>—</span>
													)}
												</td>
												{hosted && (
													<td className={styles.cmeNowrap}>
														{p.checked_in_at ? (
															<span
																className={styles.okText}
																title={formatDateTimeVN(p.checked_in_at)}
															>
																<CheckSvg /> {formatDateTimeVN(p.checked_in_at)}
															</span>
														) : (
															<span className={styles.muted}>—</span>
														)}
													</td>
												)}
												{hosted && hasTest && (
													<td className={styles.cmeNowrap}>
														{p.test_submitted_at ? (
															<span title={`Đúng ${p.test_correct}/${p.test_total} câu`}>
																<b>{testScore(p)}</b>/{p.test_max_score ?? p.test_total}
																{sem.test_pass_score != null && (
																	<span
																		className={testPassed(sem, p) ? styles.okText : styles.badText}
																		style={{ marginLeft: 6 }}
																	>
																		{testPassed(sem, p) ? 'Đạt' : 'Chưa đạt'}
																	</span>
																)}
															</span>
														) : p.test_started_at ? (
															<span className={styles.muted}>Đang làm</span>
														) : (
															<span className={styles.muted}>—</span>
														)}
													</td>
												)}
												{sem.grants_cme && (
													<td className={styles.cmeNowrap}>
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
														{(p.cme_certificate_no || p.cme_credits != null) && (
															<div className={styles.cellSub}>
																{[
																	p.cme_certificate_no && `Số ${p.cme_certificate_no}`,
																	p.cme_credits != null && `${p.cme_credits} TC`,
																]
																	.filter(Boolean)
																	.join(' · ')}
															</div>
														)}
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
						const ok = editing ? await d.editOne(editing.id, form) : await d.addOne(form);
						if (ok) {
							setFormModal(null);
							setEditing(null);
						}
					}}
				/>
			)}

			{regQrOpen && sem && (
				<SeminarRegistrationQrModal
					seminar={sem}
					onClose={closeRegQr}
					onPresent={() => {
						closeRegQr();
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

function Stat({ label, value, manual }: { label: string; value: ReactNode; manual?: boolean }) {
	return (
		<div className={styles.statItem}>
			<span className={styles.statNum}>
				{value}
				{manual && <sup title='Số liệu nhập tay'>*</sup>}
			</span>
			<span className={styles.statText}>{label}</span>
		</div>
	);
}

// Ô công cụ tổ chức: bấm cả ô để mở
function OrgTile({
	icon,
	title,
	status,
	desc,
	hint,
	action,
	onClick,
}: {
	icon: ReactNode;
	title: string;
	status: ReactNode;
	desc: string;
	hint?: string;
	action: string;
	onClick: () => void;
}) {
	return (
		<button
			type='button'
			className={styles.orgTile}
			onClick={onClick}
		>
			<span className={styles.orgHead}>
				<span className={styles.orgIcon}>{icon}</span>
				<span className={styles.orgTitle}>{title}</span>
				{status}
			</span>
			<span className={styles.orgDesc}>{desc}</span>
			{hint && <span className={styles.orgHint}>{hint}</span>}
			<span className={styles.orgAction}>
				{action} <ChevRSvg />
			</span>
		</button>
	);
}
