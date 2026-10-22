import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
	BadgeSvg,
	BookOpenSvg,
	CalendarSvg,
	ChevLSvg,
	ClipboardCheckSvg,
	EditSvg,
	FileTextSvg,
	UserCheckSvg,
} from '@/assets/icons';
import { apiClient } from '@/shared/api/axios';
import { avatarColor, getInitials } from '@/shared/utils';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { getTrainee, updateTrainee } from '../api/traineeApi';
import { TraineeAttendanceTab } from '../components/TraineeAttendanceTab';
import { TraineeDocumentsTab } from '../components/TraineeDocumentsTab';
import { TraineeEnrollmentsTab } from '../components/TraineeEnrollmentsTab';
import { TraineeFormModal } from '../components/TraineeFormModal';
import { TraineeInfoTab } from '../components/TraineeInfoTab';
import { TraineeScheduleTab } from '../components/TraineeScheduleTab';
import { TraineeCertificatesTab, TraineeResultsTab } from '../components/TraineeResultsTab';
import type { SimpleItem } from '../hooks/useTrainees';
import type { Trainee, TraineeFormData } from '../types/trainee.type';
import styles from './Trainees.module.css';
import ds from './TraineeDetail.module.css';

export type TraineeDetailTab = 'info' | 'documents' | 'courses' | 'schedule' | 'attendance' | 'results' | 'certificates';

const TABS: { key: TraineeDetailTab; label: string; icon: ReactNode }[] = [
	{ key: 'info', label: 'Thông tin cá nhân', icon: <UserCheckSvg /> },
	{ key: 'documents', label: 'Hồ sơ & file scan', icon: <FileTextSvg /> },
	{ key: 'courses', label: 'Khóa học / chương trình', icon: <BookOpenSvg /> },
	{ key: 'schedule', label: 'Lịch học', icon: <CalendarSvg /> },
	{ key: 'attendance', label: 'Điểm danh', icon: <CalendarSvg /> },
	{ key: 'results', label: 'Kết quả & điểm', icon: <ClipboardCheckSvg /> },
	{ key: 'certificates', label: 'Chứng chỉ / CME', icon: <BadgeSvg /> },
];

/** Hồ sơ học viên đầy đủ (giai đoạn 3) — trang riêng /admin/trainees/:id?tab=… thay cho modal 3 tab. */
export default function TraineeDetail() {
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const [params, setParams] = useSearchParams();
	const { has } = usePermission();
	const [trainee, setTrainee] = useState<Trainee | null>(null);
	const [notFound, setNotFound] = useState(false);
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [traineeTypes, setTraineeTypes] = useState<SimpleItem[]>([]);
	const [departments, setDepartments] = useState<SimpleItem[]>([]);

	// File hồ sơ là dữ liệu nhạy cảm — backend chặn bằng trainees:read_sensitive
	const tabs = TABS.filter((t) => t.key !== 'documents' || has('trainees:read_sensitive'));
	const tab = tabs.find((t) => t.key === params.get('tab'))?.key ?? 'info';

	const load = useCallback(
		() =>
			getTrainee(id)
				.then(setTrainee)
				.catch(() => setNotFound(true)),
		[id],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate('trainee', load);

	useEffect(() => {
		if (!editing || traineeTypes.length) return;
		apiClient
			.get<{ data: SimpleItem[] }>('/trainee-types?limit=0')
			.then((r) => setTraineeTypes(r.data))
			.catch(() => {});
		apiClient
			.get<{ data: SimpleItem[] }>('/departments?limit=0')
			.then((r) => setDepartments(r.data))
			.catch(() => {});
	}, [editing, traineeTypes.length]);

	const handleEdit = async (form: TraineeFormData) => {
		setSaving(true);
		try {
			setTrainee(await updateTrainee(id, form));
			setEditing(false);
			showToast('success', 'Đã cập nhật học viên');
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : 'Cập nhật thất bại');
		} finally {
			setSaving(false);
		}
	};

	const back = (
		<button
			className={ds.backLink}
			onClick={() => navigate('/admin/trainees')}
		>
			<ChevLSvg /> Danh sách học viên
		</button>
	);

	if (notFound)
		return (
			<AdminLayout pageTitle='Không tìm thấy'>
				{back}
				<div className={styles.subEmpty}>Học viên không tồn tại hoặc bạn không có quyền xem.</div>
			</AdminLayout>
		);

	const go = (t: TraineeDetailTab) => setParams({ tab: t }, { replace: true });
	const canEdit = has('trainees:update');

	return (
		<AdminLayout
			pageTitle={trainee?.full_name ?? 'Hồ sơ học viên'}
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={
				trainee &&
				canEdit && (
					<button
						className={styles.btnGhost}
						onClick={() => setEditing(true)}
					>
						<EditSvg /> Chỉnh sửa thông tin
					</button>
				)
			}
		>
			{back}
			{trainee && (
				<>
					<TraineeSummary
						trainee={trainee}
						showDocs={tabs.some((t) => t.key === 'documents')}
						onOpen={go}
					/>
					<div className={ds.panel}>
						<div
							className={ds.tabs}
							role='tablist'
						>
							{tabs.map((t) => (
								<button
									key={t.key}
									role='tab'
									aria-selected={tab === t.key}
									className={`${styles.detailTabBtn} ${tab === t.key ? styles.detailTabBtnActive : ''}`}
									onClick={() => go(t.key)}
								>
									{t.icon} {t.label}
								</button>
							))}
						</div>
						<div className={ds.body}>
							{tab === 'info' && <TraineeInfoTab trainee={trainee} />}
							{tab === 'documents' && (
								<TraineeDocumentsTab
									traineeId={id}
									canEdit={canEdit}
								/>
							)}
							{tab === 'courses' && <TraineeEnrollmentsTab traineeId={id} />}
							{tab === 'schedule' && <TraineeScheduleTab traineeId={id} />}
							{tab === 'attendance' && <TraineeAttendanceTab traineeId={id} />}
							{tab === 'results' && <TraineeResultsTab traineeId={id} />}
							{tab === 'certificates' && <TraineeCertificatesTab traineeId={id} />}
						</div>
					</div>
				</>
			)}
			{editing && trainee && (
				<TraineeFormModal
					mode='edit'
					trainee={trainee}
					traineeTypes={traineeTypes}
					departments={departments}
					onClose={() => setEditing(false)}
					onSave={handleEdit}
					loading={saving}
				/>
			)}
		</AdminLayout>
	);
}

/** Thẻ tóm tắt đầu trang: định danh nhanh + số khóa / giấy tờ bắt buộc (bấm để sang tab tương ứng). */
function TraineeSummary({
	trainee,
	showDocs,
	onOpen,
}: {
	trainee: Trainee;
	showDocs: boolean;
	onOpen: (tab: TraineeDetailTab) => void;
}) {
	const c = avatarColor(trainee.id);
	const unit = trainee.department_name ?? trainee.workplace;
	const docRequired = trainee.doc_required ?? 0;
	const docMissing = docRequired - (trainee.doc_done ?? 0);
	return (
		<div className={ds.summaryCard}>
			<div className={ds.identity}>
				<div
					className={ds.avatar}
					style={{ background: c.bg, color: c.color }}
				>
					{getInitials(trainee.full_name)}
				</div>
				<div className={ds.identityText}>
					<div className={ds.code}>
						{trainee.id}
						{trainee.legacy_code ? ` · Mã cũ ${trainee.legacy_code}` : ''}
					</div>
					<div className={ds.tags}>
						{trainee.trainee_type_name && <span className={ds.chipInfo}>{trainee.trainee_type_name}</span>}
						<span className={trainee.is_active ? ds.chipDone : ds.chipMuted}>
							{trainee.is_active ? 'Hoạt động' : 'Ngừng hoạt động'}
						</span>
						<span className={trainee.account_granted ? ds.chipDone : ds.chipMuted}>
							{trainee.account_granted ? 'Đã cấp tài khoản' : 'Chưa cấp tài khoản'}
						</span>
						{trainee.is_employee && <span className={ds.chipInfo}>Nhân viên BV</span>}
					</div>
				</div>
			</div>
			<div className={ds.facts}>
				<Fact label={trainee.is_employee ? 'Khoa / Phòng' : 'Đơn vị công tác'}>{unit ?? '—'}</Fact>
				<Fact label='Điện thoại'>{trainee.phone ?? '—'}</Fact>
				<Fact label='Trình độ'>{trainee.qualification ?? '—'}</Fact>
				<Fact
					label='Khóa học'
					onClick={() => onOpen('courses')}
				>
					{trainee.enrollment_count ?? 0} lượt ghi danh
				</Fact>
				{showDocs && (
					<Fact
						label='Giấy tờ bắt buộc'
						onClick={() => onOpen('documents')}
					>
						{docRequired ? (
							<>
								{trainee.doc_done ?? 0}/{docRequired}{' '}
								{docMissing > 0 ? (
									<span className={ds.chipMissing}>Thiếu {docMissing}</span>
								) : (
									<span className={ds.chipDone}>Đủ</span>
								)}
							</>
						) : (
							'Không yêu cầu'
						)}
					</Fact>
				)}
			</div>
		</div>
	);
}

function Fact({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
	const body = (
		<>
			<span className={ds.factLabel}>{label}</span>
			<span className={ds.factValue}>{children}</span>
		</>
	);
	return onClick ? (
		<button
			type='button'
			className={`${ds.fact} ${ds.factLink}`}
			onClick={onClick}
		>
			{body}
		</button>
	) : (
		<div className={ds.fact}>{body}</div>
	);
}
