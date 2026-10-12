import { useCallback, useEffect, useState } from 'react';
import { BarChartSvg, CalendarSvg, DownloadSvg, EditSvg, FileTextSvg, PaperclipSvg, PlusSvg, TrashSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { CME_STATUS_LABELS, EVENT_TYPE_LABELS, PARTICIPATION_LABELS } from '../../seminar/types/seminar.type';
import { saveBlob } from '../../seminar/utils/saveBlob';
import MyCmeRecordModal from '../components/MyCmeRecordModal';
import {
	deleteMyCmeRecord,
	exportMyCmeExcel,
	getMyCme,
	getMyCmeCategories,
	type CmeApprovalStatus,
	type MyCme as Data,
	type MyCmeCategory,
	type MyCmeRecord,
} from '../api/meApi';
import styles from './SelfService.module.css';

const THIS_YEAR = new Date().getFullYear();
const APPROVAL_LABEL: Record<CmeApprovalStatus, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối' };
const APPROVAL_TONE = { pending: 'amber', approved: 'green', rejected: 'red' } as const;
const YEARS = Array.from({ length: 5 }, (_, i) => THIS_YEAR - i);

export default function MyCme() {
	const [year, setYear] = useState(THIS_YEAR);
	const [data, setData] = useState<Data | null>(null);
	const [error, setError] = useState('');
	const [exporting, setExporting] = useState(false);
	const [exportError, setExportError] = useState('');
	const [editing, setEditing] = useState<MyCmeRecord | null | 'new'>(null);
	const [categories, setCategories] = useState<MyCmeCategory[]>([]);
	useEffect(() => {
		getMyCmeCategories().then(setCategories).catch(() => {});
	}, []);

	const load = useCallback(() => {
		getMyCme(year)
			.then(setData)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu CME'));
	}, [year]);
	useEffect(load, [load]);
	useRealtimeUpdate(['seminar', 'cme_record', 'cme_requirement'], load);

	const handleDelete = async (id: string) => {
		if (!window.confirm('Xoá khai báo CME này?')) return;
		try {
			await deleteMyCmeRecord(id);
			load();
		} catch (err) {
			setExportError(err instanceof Error ? err.message : 'Xoá thất bại');
		}
	};

	const handleExport = async () => {
		setExporting(true);
		setExportError('');
		try {
			saveBlob(await exportMyCmeExcel(year), `phieu-cme-${year}.xlsx`);
		} catch (err) {
			setExportError(err instanceof Error ? err.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	const req = data?.required_credits != null ? Number(data.required_credits) : null;
	const pct = data && req ? Math.min(100, (data.earned_credits / req) * 100) : 0;
	const done = req != null && data != null && data.earned_credits >= req;

	return (
		<UserLayout
			pageTitle='CME của tôi'
			pageSubtitle='Tín chỉ đào tạo liên tục tích luỹ qua hội thảo, hội nghị và ghi nhận độc lập'
			headerActions={
				<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
					{exportError && <Badge tone='red'>{exportError}</Badge>}
					<select
						className={styles.yearSelect}
						value={year}
						onChange={(e) => setYear(Number(e.target.value))}
						aria-label='Chọn năm'
					>
						{YEARS.map((y) => (
							<option
								key={y}
								value={y}
							>
								Năm {y}
							</option>
						))}
					</select>
					<Button
						size='sm'
						variant='secondary'
						icon={<DownloadSvg />}
						loading={exporting}
						disabled={!data}
						onClick={handleExport}
						title='Phiếu theo dõi CME năm đang chọn, kèm tổng hợp 5 năm gần nhất'
					>
						Xuất Excel
					</Button>
				</div>
			}
		>
			{error && (
				<EmptyState
					title='Không thể tải dữ liệu'
					desc={error}
				/>
			)}
			{!data && !error && <InlineLoading />}

			{data && (
				<div className={styles.stack}>
					<Card>
						<Card.Header
							icon={<BarChartSvg />}
							title={`Tín chỉ CME năm ${data.year}`}
						/>
						<Card.Body>
							<div className={styles.progressRow}>
								<div>
									<span className={styles.bigNumber}>{data.earned_credits}</span>
									{req != null && <span> / {req} tín chỉ</span>}
								</div>
								{req == null ? (
									<Badge>Chưa có ngưỡng yêu cầu cho năm này</Badge>
								) : done ? (
									<Badge tone='green'>Đã đạt yêu cầu</Badge>
								) : (
									<Badge tone='amber'>Còn thiếu {Math.round((req - data.earned_credits) * 100) / 100} tín chỉ</Badge>
								)}
							</div>
							{req != null && (
								<div className={styles.progressTrack}>
									<div
										className={`${styles.progressBar} ${done ? styles.progressDone : styles.progressLow}`}
										style={{ width: `${pct}%` }}
									/>
								</div>
							)}
						</Card.Body>
					</Card>

					<Card>
						<Card.Header
							icon={<CalendarSvg />}
							title='Hội thảo, hội nghị đã tham dự'
							sub={`${data.seminars.length} sự kiện`}
						/>
						<Card.Body>
							{data.seminars.length === 0 ? (
								<EmptyState title='Chưa có sự kiện nào trong năm' />
							) : (
								<div className={styles.tableWrap}>
									<table className={styles.table}>
										<thead>
											<tr>
												<th>Sự kiện</th>
												<th>Thời gian</th>
												<th>Vai trò</th>
												<th>SQĐ</th>
												<th>Tín chỉ</th>
												<th>Trạng thái</th>
											</tr>
										</thead>
										<tbody>
											{data.seminars.map((s) => (
												<tr key={s.id}>
													<td>
														<b>{s.seminar_title}</b>
														<div style={{ fontSize: 12, color: '#64748b' }}>
															{EVENT_TYPE_LABELS[s.event_type]}
															{s.location && ` · ${s.location}`}
														</div>
													</td>
													<td>{s.date_text || formatDateVN(s.start_date) || '—'}</td>
													<td>{PARTICIPATION_LABELS[s.participation_type]}</td>
													<td>{s.cme_certificate_no ?? '—'}</td>
													<td>{s.cme_credits ?? '—'}</td>
													<td>
														<Badge tone={s.cme_status === 'none' ? 'gray' : s.cme_status === 'pending' ? 'amber' : 'green'}>
															{CME_STATUS_LABELS[s.cme_status]}
														</Badge>
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							)}
						</Card.Body>
					</Card>

					<Card>
							<Card.Header
								icon={<FileTextSvg />}
								title='Ghi nhận CME khác'
								sub='Tự khai báo — chỉ được tính vào tín chỉ sau khi quản lý phê duyệt'
								actions={
									<Button size='sm' icon={<PlusSvg />} onClick={() => setEditing('new')}>
										Khai báo CME
									</Button>
								}
							/>
							<Card.Body>
								{data.records.length === 0 ? (
									<EmptyState title='Chưa có khai báo nào trong năm' />
								) : (
									<div className={styles.tableWrap}>
										<table className={styles.table}>
											<thead>
												<tr>
													<th>Nội dung</th>
													<th>Ngày</th>
													<th>Loại hoạt động</th>
													<th>Tín chỉ</th>
													<th>Trạng thái</th>
													<th />
												</tr>
											</thead>
											<tbody>
												{data.records.map((r) => (
													<tr key={r.id}>
														<td>
															{r.title}
															{r.evidence_file_url && (
																<a href={r.evidence_file_url} target='_blank' rel='noreferrer' title={r.evidence_file_name ?? 'Minh chứng'}>
																	{' '}
																	<PaperclipSvg />
																</a>
															)}
														</td>
														<td>{r.activity_date ? formatDateVN(r.activity_date) : `Năm ${r.year}`}</td>
														<td>{r.category_name ?? '—'}</td>
														<td>{r.credits}</td>
														<td>
															<Badge tone={APPROVAL_TONE[r.approval_status]}>{APPROVAL_LABEL[r.approval_status]}</Badge>
															{r.approval_status === 'rejected' && r.reject_reason && (
																<div style={{ fontSize: 12, color: '#b91c1c' }}>{r.reject_reason}</div>
															)}
														</td>
														<td>
															{r.approval_status !== 'approved' && (
																<div style={{ display: 'flex', gap: 6 }}>
																	<Button size='sm' variant='secondary' icon={<EditSvg />} onClick={() => setEditing(r)} title='Sửa' />
																	<Button size='sm' variant='secondary' icon={<TrashSvg />} onClick={() => handleDelete(r.id)} title='Xoá' />
																</div>
															)}
														</td>
													</tr>
												))}
											</tbody>
										</table>
									</div>
								)}
							</Card.Body>
						</Card>
					
				</div>
			)}
			{editing && (
				<MyCmeRecordModal
					record={editing === 'new' ? null : editing}
					categories={categories}
					defaultYear={year}
					onClose={() => setEditing(null)}
					onSaved={load}
				/>
			)}
		</UserLayout>
	);
}
