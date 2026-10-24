import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChartSvg, CalendarSvg, DownloadSvg, EditSvg, FileTextSvg, PaperclipSvg, PlusSvg, TrashSvg, UploadSvg, XSvg } from '@/assets/icons';
import { Badge, Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { CME_STATUS_LABELS, EVENT_TYPE_LABELS, PARTICIPATION_LABELS } from '../../seminar/types/seminar.type';
import { saveBlob } from '@/shared/utils/saveBlob';
import MyCmeRecordModal from '../components/MyCmeRecordModal';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';
import {
	addMyCmeResultFile,
	deleteMyCmeRecord,
	deleteMyCmeResultFile,
	exportMyCmeExcel,
	getMyCme,
	getMyCmeCategories,
	type CmeApprovalStatus,
	type MyCme as Data,
	type MyCmeCategory,
	type MyCmeRecord,
} from '../api/meApi';
import styles from './SelfService.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { Pagination } from '@/shared/components/Table/Pagination';

const THIS_YEAR = new Date().getFullYear();
const APPROVAL_LABEL: Record<CmeApprovalStatus, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối' };
const APPROVAL_TONE = { pending: 'amber', approved: 'green', rejected: 'red' } as const;
const YEARS = Array.from({ length: 5 }, (_, i) => THIS_YEAR - i);

type Tab = 'seminars' | 'records';

export default function MyCme() {
	// Tab giữ trên URL (?tab=) — tải lại / quay lại vẫn đúng tab đang xem.
	const [params, setParams] = useSearchParams();
	const tab: Tab = params.get('tab') === 'records' ? 'records' : 'seminars';
	const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
	const [year, setYear] = useState<number | 'all'>('all');
	const allYears = year === 'all';
	const [data, setData] = useState<Data | null>(null);
	const semPg = useClientPaging(data?.seminars ?? []);
	const recPg = useClientPaging(data?.records ?? []);
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

	// File bổ sung chứng minh kết quả — chỉ cho ghi nhận đã duyệt (1 input ẩn dùng chung)
	const uploadPolicy = useUploadPolicy();
	const fileInput = useRef<HTMLInputElement>(null);
	const [uploadFor, setUploadFor] = useState<string | null>(null);
	const [uploadingId, setUploadingId] = useState<string | null>(null);
	const pickResultFile = (id: string) => {
		setUploadFor(id);
		fileInput.current?.click();
	};
	const handleResultFile = async (file: File | undefined) => {
		const id = uploadFor;
		if (fileInput.current) fileInput.current.value = '';
		if (!file || !id) return;
		const invalid = uploadPolicy.check(file);
		if (invalid) return setExportError(invalid);
		setExportError('');
		setUploadingId(id);
		try {
			await addMyCmeResultFile(id, file);
			load();
		} catch (err) {
			setExportError(err instanceof Error ? err.message : 'Tải file thất bại');
		} finally {
			setUploadingId(null);
		}
	};
	const handleDeleteResultFile = async (id: string, fileId: string, name: string) => {
		if (!window.confirm(`Xoá file "${name}"?`)) return;
		try {
			await deleteMyCmeResultFile(id, fileId);
			load();
		} catch (err) {
			setExportError(err instanceof Error ? err.message : 'Xoá file thất bại');
		}
	};

	const handleExport = async () => {
		if (year === 'all') return;
		setExporting(true);
		setExportError('');
		try {
			saveBlob(await exportMyCmeExcel(year), `bao-cao-cme-${year}.xlsx`);
		} catch (err) {
			setExportError(err instanceof Error ? err.message : 'Xuất Excel thất bại');
		} finally {
			setExporting(false);
		}
	};

	const req = data?.required_credits != null ? Number(data.required_credits) : null;
	const pct = data && req ? Math.min(100, (data.earned_credits / req) * 100) : 0;
	const done = req != null && data != null && data.earned_credits >= req;
	const rejected = data?.records.filter((r) => r.approval_status === 'rejected').length ?? 0;

	return (
		<UserLayout
			pageTitle='Tín chỉ CME của tôi'
			pageSubtitle='Tín chỉ đào tạo liên tục tích luỹ qua hội thảo, hội nghị và ghi nhận độc lập'
			headerActions={
				<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
					{exportError && <Badge tone='red'>{exportError}</Badge>}
					<select
						className={styles.yearSelect}
						value={year}
						onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
						aria-label='Chọn năm'
					>
						<option value='all'>Tất cả các năm</option>
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
						disabled={!data || allYears}
						onClick={handleExport}
						title={allYears ? 'Chọn 1 năm để xuất phiếu' : 'Phiếu theo dõi CME năm đang chọn, kèm tổng hợp 5 năm gần nhất'}
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
							title={data.year == null ? 'Tổng tín chỉ CME tất cả các năm' : `Tín chỉ CME năm ${data.year}`}
						/>
						<Card.Body>
							<div className={styles.progressRow}>
								<div>
									<span className={styles.bigNumber}>{data.earned_credits}</span>
									{req != null && <span> / {req} tín chỉ</span>}
								</div>
								{allYears ? null : req == null ? (
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
						<div
							className={styles.tabs}
							role='tablist'
						>
							{[
								{ key: 'seminars' as Tab, label: 'Hội thảo, hội nghị đã tham dự', icon: <CalendarSvg />, count: data.seminars.length },
								{ key: 'records' as Tab, label: 'Ghi nhận CME khác', icon: <FileTextSvg />, count: data.records.length, alert: rejected > 0 },
							].map((t) => (
								<button
									key={t.key}
									type='button'
									role='tab'
									aria-selected={tab === t.key}
									className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`}
									onClick={() => setTab(t.key)}
								>
									{t.icon}
									{t.label}
									<span className={`${styles.tabCount} ${t.alert ? styles.tabCountAlert : ''}`}>{t.count}</span>
								</button>
							))}
						</div>
						{tab === 'seminars' && (
							<Card.Body>
								{data.seminars.length === 0 ? (
									<EmptyState title={allYears ? 'Chưa có sự kiện nào' : 'Chưa có sự kiện nào trong năm'} />
								) : (
									<div className={styles.tableWrap}>
										<table className={styles.table}>
											<thead>
												<tr>
													<th className={tbl.thIdx}>STT</th>
													<th>Sự kiện</th>
													<th>Thời gian</th>
													<th>Vai trò</th>
													<th>SQĐ</th>
													<th>Tín chỉ</th>
													<th>Trạng thái</th>
												</tr>
											</thead>
											<tbody>
												{semPg.paged.map((s, i) => (
													<tr key={s.id}>
														<td className={tbl.tdIdx}>{semPg.offset + i + 1}</td>
														<td>
															<div className={tbl.cellTitle}>{s.seminar_title}</div>
															<div className={tbl.dateText}>
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
										<Pagination
											{...semPg.pagination}
											itemLabel='sự kiện'
										/>
									</div>
								)}
							</Card.Body>
						)}

						{tab === 'records' && (
							<Card.Body>
								<div className={styles.tabToolbar}>
									<span>Tự khai báo — quản lý nhập số tín chỉ khi phê duyệt, chỉ được tính sau khi duyệt</span>
									<Button size='sm' icon={<PlusSvg />} onClick={() => setEditing('new')}>
										Khai báo CME
									</Button>
								</div>
								{data.records.length === 0 ? (
									<EmptyState title={allYears ? 'Chưa có khai báo nào' : 'Chưa có khai báo nào trong năm'} />
								) : (
									<div className={styles.tableWrap}>
										<table className={styles.table}>
											<thead>
												<tr>
													<th className={tbl.thIdx}>STT</th>
													<th>Tên hoạt động</th>
													<th>Ngày</th>
													<th>Loại hoạt động</th>
													<th>Tín chỉ</th>
													<th>Trạng thái</th>
													<th />
												</tr>
											</thead>
											<tbody>
												{recPg.paged.map((r, i) => (
													<tr key={r.id}>
														<td className={tbl.tdIdx}>{recPg.offset + i + 1}</td>
														<td>
															<span className={tbl.cellTitle}>{r.title}</span>
															{r.evidence_file_url && (
																<a href={r.evidence_file_url} target='_blank' rel='noreferrer' title={r.evidence_file_name ?? 'Minh chứng'}>
																	{' '}
																	<PaperclipSvg />
																</a>
															)}
															{r.result_files.map((f) => (
																<div key={f.id} className={tbl.dateText}>
																	<a href={f.file_url} target='_blank' rel='noreferrer'>
																		<FileTextSvg /> {f.file_name}
																	</a>
																	<button
																		type='button'
																		onClick={() => handleDeleteResultFile(r.id, f.id, f.file_name)}
																		title='Xoá file'
																		aria-label={`Xoá file ${f.file_name}`}
																		style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', verticalAlign: 'middle' }}
																	>
																		<XSvg width={12} height={12} />
																	</button>
																</div>
															))}
														</td>
														<td>{r.activity_date ? formatDateVN(r.activity_date) : `Năm ${r.year}`}</td>
														<td>{r.category_name ?? '—'}</td>
														{/* Tín chỉ do người quản lý nhập khi duyệt */}
														<td>{r.approval_status === 'approved' ? r.credits : '—'}</td>
														<td>
															<Badge tone={APPROVAL_TONE[r.approval_status]}>{APPROVAL_LABEL[r.approval_status]}</Badge>
															{r.approval_status === 'rejected' && r.reject_reason && (
																<div className={tbl.dateText} style={{ color: '#b91c1c' }}>{r.reject_reason}</div>
															)}
														</td>
														<td>
															{r.approval_status === 'approved' ? (
																<Button
																	size='sm'
																	variant='secondary'
																	icon={<UploadSvg />}
																	loading={uploadingId === r.id}
																	onClick={() => pickResultFile(r.id)}
																	title='Tải lên file bổ sung chứng minh kết quả'
																>
																	Bổ sung file
																</Button>
															) : (
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
										<Pagination
											{...recPg.pagination}
											itemLabel='hoạt động'
										/>
									</div>
								)}
							</Card.Body>
						)}
					</Card>
				</div>
			)}
			<input
				ref={fileInput}
				type='file'
				hidden
				accept={uploadPolicy.accept}
				onChange={(e) => handleResultFile(e.target.files?.[0])}
			/>
			{editing && (
				<MyCmeRecordModal
					record={editing === 'new' ? null : editing}
					categories={categories}
					defaultYear={year === 'all' ? THIS_YEAR : year}
					onClose={() => setEditing(null)}
					onSaved={load}
				/>
			)}
		</UserLayout>
	);
}
