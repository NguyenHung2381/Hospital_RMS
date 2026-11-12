import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
	BadgeSvg,
	BuildingSvg,
	ChevLSvg,
	ClipboardCheckSvg,
	ClockSvg,
	DownloadSvg,
	FileTextSvg,
	InfoSvg,
	ListSvg,
	QrSvg,
	UsersSvg,
} from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { ConfirmDeleteModal } from '@/shared/components';
import { InlineLoading } from '../../../shared/components/Loading';
import { cx } from '@/shared/utils/cx';
import { DepartmentStaffModal } from '../components/DepartmentStaffModal';
import { CertificateModal } from '../components/CertificateModal';
import { IssueCmeModal } from '../components/IssueCmeModal';
import { ParticipantFormModal } from '../components/ParticipantFormModal';
import { ParticipantImportModal } from '../components/ParticipantImportModal';
import { SeminarQrPresentation } from '../components/SeminarQrPresentation';
import { SeminarRegistrationQrModal } from '../components/SeminarRegistrationQrModal';
import { SeminarTicketQrModal } from '../components/SeminarTicketQrModal';
import { SeminarTestModal } from '../components/SeminarTestModal';
import { SeminarAgendaModal } from '../components/SeminarAgendaModal';
import { AgendaTab } from '../components/detail/AgendaTab';
import { CheckinTab } from '../components/detail/CheckinTab';
import { CmeTab } from '../components/detail/CmeTab';
import { OverviewTab } from '../components/detail/OverviewTab';
import { ParticipantDrawer } from '../components/detail/ParticipantDrawer';
import { ParticipantsTab } from '../components/detail/ParticipantsTab';
import { TestTab } from '../components/detail/TestTab';
import { computeCounts, fullName, seminarWhen } from '../components/detail/detailUtils';
import type { DetailActions, DetailTab } from '../components/detail/types';
import d$ from '../components/detail/Detail.module.css';
import { useSeminarDetail } from '../hooks/useSeminarDetail';
import { useSeminarPerms } from '../utils/perms';
import {
	EVENT_TYPE_LABELS,
	isHospitalTraining,
	SCOPE_LABELS,
	type SeminarParticipant,
} from '../types/seminar.type';
import { parseAgenda } from '../utils/agenda';
import { exportSeminarDetailExcel } from '../api/seminarApi';
import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import styles from './Seminar.module.css';
import { useFormConfig } from '@/shared/formConfig';

const TAB_KEYS: DetailTab[] = ['overview', 'participants', 'agenda', 'checkin', 'test', 'cme'];

/**
 * Chi tiết hội nghị / hội thảo / tập huấn — chia tab (lưu ở ?tab=), bấm 1 người tham dự
 * mở drawer bên phải (lưu ở ?p=<id>) để reload vẫn giữ nguyên chỗ đang xem.
 */
export default function SeminarDetail() {
	// Trường tùy chỉnh người tham dự điền khi đăng ký công khai (Cấu hình form 'seminar_participant')
	const partCfg = useFormConfig('seminar_participant', 'public');
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const d = useSeminarDetail(id);
	const perms = useSeminarPerms();
	// Tập huấn bệnh viện dùng chung trang này (/admin/hospital-trainings/:id)
	const { pathname } = useLocation();
	const ht = d.seminar ? isHospitalTraining(d.seminar) : pathname.startsWith('/admin/hospital-trainings');
	const listPath = ht ? '/admin/hospital-trainings' : '/admin/seminars';

	const [searchParams, setSearchParams] = useSearchParams();
	const setParam = useCallback(
		(key: string, value: string | null) =>
			setSearchParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (value) next.set(key, value);
					else next.delete(key);
					return next;
				},
				{ replace: true },
			),
		[setSearchParams],
	);

	const [staffOpen, setStaffOpen] = useState(false);
	const [formModal, setFormModal] = useState<'add' | 'edit' | null>(null);
	const [editing, setEditing] = useState<SeminarParticipant | null>(null);
	const [deleting, setDeleting] = useState<SeminarParticipant | null>(null);
	const [issueReq, setIssueReq] = useState<{
		targets: SeminarParticipant[];
		notEligible: number;
		onDone?: () => void;
	} | null>(null);
	const [cert, setCert] = useState<{ targets: SeminarParticipant[]; selectedCount: number } | null>(null);
	const [importOpen, setImportOpen] = useState(false);
	// ?qr=1: vừa tạo hội nghị → mở luôn QR đăng ký để tải về
	const [regQrOpen, setRegQrOpen] = useState(searchParams.get('qr') === '1');
	const [presentOpen, setPresentOpen] = useState(false);
	// Vé QR của người tự đăng ký — mở lại khi người tham dự mất vé (SeminarTicketQrModal)
	const [ticketOf, setTicketOf] = useState<(SeminarParticipant & { ticket_code: string }) | null>(null);
	const [testOpen, setTestOpen] = useState(false);
	const [agendaOpen, setAgendaOpen] = useState(false);
	const [exporting, setExporting] = useState(false);

	const sem = d.seminar;
	const agenda = useMemo(() => parseAgenda(sem?.agenda ?? null), [sem?.agenda]);
	const counts = useMemo(() => (sem ? computeCounts(sem, d.participants) : null), [sem, d.participants]);
	const hosted = sem?.scope === 'hosted';

	// Tab hiện có theo loại sự kiện / quyền
	const tabs = useMemo(() => {
		if (!sem) return [];
		const list: { key: DetailTab; label: string; icon: ReactNode; count?: number }[] = [
			{ key: 'overview', label: 'Tổng quan', icon: <InfoSvg /> },
			{ key: 'participants', label: 'Người tham gia', icon: <UsersSvg />, count: d.participants.length },
			{ key: 'agenda', label: 'Chương trình', icon: <ListSvg />, count: agenda.length },
		];
		if (sem.scope === 'hosted') {
			list.push({ key: 'checkin', label: 'Đăng ký & điểm danh', icon: <ClipboardCheckSvg /> });
			list.push({ key: 'test', label: 'Bài kiểm tra', icon: <FileTextSvg /> });
		}
		if (sem.grants_cme || perms.canCme) list.push({ key: 'cme', label: 'Chứng nhận CME', icon: <BadgeSvg /> });
		return list;
	}, [sem, d.participants.length, agenda.length, perms.canCme]);

	const rawTab = searchParams.get('tab') as DetailTab | null;
	const tab: DetailTab =
		rawTab && TAB_KEYS.includes(rawTab) && (!sem || tabs.some((t) => t.key === rawTab)) ? rawTab : 'overview';

	// Điện thoại: thanh tab cuộn ngang — đưa tab đang chọn vào khung nhìn
	const tabBarRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		tabBarRef.current
			?.querySelector<HTMLElement>('[aria-selected="true"]')
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}, [tab, sem]);

	const openId = searchParams.get('p');
	const openParticipant = openId ? (d.participants.find((p) => p.id === openId) ?? null) : null;

	// Người đang mở trong drawer đã bị xóa (hoặc link cũ) → bỏ ?p
	useEffect(() => {
		if (openId && sem && !d.loadingData && !d.participants.some((p) => p.id === openId)) setParam('p', null);
	}, [openId, sem, d.loadingData, d.participants, setParam]);

	// 1 file gồm sheet Thông tin + Người tham dự + Chương trình
	const handleExport = async () => {
		if (!sem) return;
		setExporting(true);
		try {
			const blob = await exportSeminarDetailExcel(sem.id);
			saveBlob(blob, `hoi-nghi-${fileSlug(sem.title).slice(0, 60)}.xlsx`);
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	const closeRegQr = () => {
		setRegQrOpen(false);
		if (searchParams.has('qr')) setParam('qr', null);
	};

	const actions: DetailActions = {
		goTab: (t) => setParam('tab', t === 'overview' ? null : t),
		openParticipant: (pid) => setParam('p', pid),
		addParticipant: () => {
			setEditing(null);
			setFormModal('add');
		},
		editParticipant: (p) => {
			setEditing(p);
			setFormModal('edit');
		},
		deleteParticipant: setDeleting,
		showTicket: (p) => p.ticket_code && setTicketOf({ ...p, ticket_code: p.ticket_code }),
		issueCme: (targets, notEligible, onDone) => setIssueReq({ targets, notEligible, onDone }),
		markSigned: (ids) => void d.setStatus(ids, 'signed'),
		revokeCme: (p) => void d.revoke(p.id),
		openCertificates: (targets, selectedCount) => setCert({ targets, selectedCount }),
		openRegQr: () => setRegQrOpen(true),
		openTest: () => setTestOpen(true),
		openAgenda: () => setAgendaOpen(true),
		openImport: () => setImportOpen(true),
		openStaff: () => setStaffOpen(true),
		scanTickets: () => sem && navigate(`/admin/quet-ve/${sem.id}`),
	};

	if (d.notFound) {
		return (
			<AdminLayout pageTitle='Không tìm thấy'>
				<button
					className={styles.backLink}
					onClick={() => navigate(listPath)}
				>
					<ChevLSvg /> Quay lại danh sách
				</button>
				<div className={styles.emptyState}>
					<div className={styles.emptyTitle}>Sự kiện không tồn tại</div>
				</div>
			</AdminLayout>
		);
	}

	const tabProps = sem && counts ? { seminar: sem, participants: d.participants, counts, perms, actions, ht } : null;

	return (
		<AdminLayout
			pageTitle={sem?.title ?? (ht ? 'Chi tiết buổi tập huấn' : 'Chi tiết hội thảo')}
			pageSubtitle={sem ? (ht ? 'Tập huấn bệnh viện' : SCOPE_LABELS[sem.scope]) : ''}
		>
			<button
				className={styles.backLink}
				onClick={() => navigate(listPath)}
			>
				<ChevLSvg /> {ht ? 'Danh sách tập huấn' : 'Danh sách hội thảo'}
			</button>

			{!sem || !tabProps ? (
				<InlineLoading />
			) : (
				<>
					{/* ── Đầu trang: loại sự kiện, thời gian, địa điểm ── */}
					<section className={d$.hero}>
						<div className={d$.heroMain}>
							<div className={styles.chips}>
								<span className={styles.chip}>{EVENT_TYPE_LABELS[sem.event_type]}</span>
								{sem.event_year && <span className={styles.chip}>Năm {sem.event_year}</span>}
								{sem.grants_cme && (
									<span className={`${styles.chip} ${styles.chipGreen}`}>
										Cấp CME{sem.cme_default_credits ? ` · ${sem.cme_default_credits} tín chỉ` : ''}
									</span>
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
						</div>
						<div className={d$.heroActions}>
							{hosted && perms.canUpdate && (
								<button
									className={styles.btnGhost}
									onClick={() => setRegQrOpen(true)}
								>
									<QrSvg /> Mã QR đăng ký
								</button>
							)}
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
					</section>

					{/* ── Thanh tab ── */}
					<div
						ref={tabBarRef}
						className={d$.tabBar}
						role='tablist'
						aria-label='Nội dung sự kiện'
					>
						{tabs.map((t) => (
							<button
								key={t.key}
								type='button'
								role='tab'
								id={`sem-tab-${t.key}`}
								aria-selected={tab === t.key}
								aria-controls='sem-tabpanel'
								className={cx(d$.tabBtn, tab === t.key && d$.tabActive)}
								onClick={() => actions.goTab(t.key)}
							>
								{t.icon}
								{t.label}
								{t.count != null && <span className={d$.tabCount}>{t.count}</span>}
							</button>
						))}
					</div>

					<div
						id='sem-tabpanel'
						role='tabpanel'
						aria-labelledby={`sem-tab-${tab}`}
					>
						{tab === 'overview' && <OverviewTab {...tabProps} />}
						{tab === 'participants' && (
							<ParticipantsTab
								{...tabProps}
								openId={openId}
								onRefresh={d.refresh}
								onBulkDelete={d.removeMany}
								busy={d.loading}
							/>
						)}
						{tab === 'agenda' && (
							<AgendaTab
								agenda={agenda}
								perms={perms}
								actions={actions}
							/>
						)}
						{tab === 'checkin' && <CheckinTab {...tabProps} />}
						{tab === 'test' && <TestTab {...tabProps} />}
						{tab === 'cme' && <CmeTab {...tabProps} />}
					</div>

					<ParticipantDrawer
						seminar={sem}
						participant={openParticipant}
						perms={perms}
						actions={actions}
						partCfg={partCfg}
						busy={d.loading}
						onClose={() => setParam('p', null)}
					/>
				</>
			)}

			{staffOpen && sem && (
				<DepartmentStaffModal
					seminarId={sem.id}
					onClose={() => setStaffOpen(false)}
					onDone={d.refresh}
				/>
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

			{deleting && (
				<ConfirmDeleteModal
					title='Xóa người tham dự'
					subtitle={fullName(deleting)}
					loading={d.loading}
					onClose={() => setDeleting(null)}
					onConfirm={async () => {
						await d.removeOne(deleting.id);
						setDeleting(null);
					}}
					warning={deleting.cme_seq != null ? 'Người này đã được cấp số CME — số sẽ bị bỏ trống, không tự dồn.' : undefined}
				>
					Xóa người này khỏi danh sách tham dự? Thông tin điểm danh và bài kiểm tra của họ cũng bị xóa.
				</ConfirmDeleteModal>
			)}

			{ticketOf && sem && (
				<SeminarTicketQrModal
					seminar={sem}
					participant={ticketOf}
					onClose={() => setTicketOf(null)}
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

			{cert && sem && (
				<CertificateModal
					seminarId={sem.id}
					seminarTitle={sem.title}
					startDate={sem.start_date}
					endDate={sem.end_date}
					numbered={cert.targets}
					selectedCount={cert.selectedCount}
					onClose={() => setCert(null)}
				/>
			)}

			{issueReq && sem && (
				<IssueCmeModal
					targets={issueReq.targets}
					notEligible={issueReq.notEligible}
					defaultYear={sem.event_year}
					registerLastSeq={null}
					loading={d.loading}
					onClose={() => setIssueReq(null)}
					onConfirm={async (year) => {
						const ok = await d.issue(
							issueReq.targets.map((p) => p.id),
							year,
						);
						if (ok) {
							setIssueReq(null);
							issueReq.onDone?.();
						}
					}}
				/>
			)}
		</AdminLayout>
	);
}
