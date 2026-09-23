import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckSvg, InfoSvg, PaperclipSvg, PlusSvg, SearchSvg, TrashSvg, UploadSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Badge, Modal } from '@/shared/components';
import { InlineLoading } from '../../../shared/components/Loading';
import { apiClient } from '../../../shared/api/axios';
import {
	addCmeRecordEvidence,
	createCmeRecord,
	deleteCmeRecord,
	getCmeCreditCategories,
	getCmeRecords,
	importCmeRecordsExcel,
	updateCmeRecord,
} from '../api/cmeRecordApi';
import { useSeminarPerms } from '../utils/perms';
import {
	EMPTY_CME_RECORD_FORM,
	type CmeCreditCategory,
	type CmeRecord,
	type CmeRecordFormData,
	type CmeRecordImportResult,
} from '../types/cmeRecord.type';
import styles from './Seminar.module.css';

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => THIS_YEAR + 1 - i);

interface SimpleUser {
	id: string;
	full_name: string;
}

function suggestCredits(category: CmeCreditCategory | undefined): string {
	if (!category || category.conversion_value == null) return '';
	if (category.conversion_method === 'fixed' || category.conversion_method === 'per_year') {
		return String(category.conversion_value);
	}
	return '';
}

function RecordFormModal({
	record,
	users,
	categories,
	onClose,
	onSaved,
}: {
	record: CmeRecord | null;
	users: SimpleUser[];
	categories: CmeCreditCategory[];
	onClose: () => void;
	onSaved: () => void;
}) {
	const [form, setForm] = useState<CmeRecordFormData>(
		record
			? {
					user_id: record.user_id,
					category_id: record.category_id ?? '',
					title: record.title,
					activity_date: record.activity_date,
					credits: String(record.credits),
					note: record.note ?? '',
				}
			: EMPTY_CME_RECORD_FORM,
	);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const fileInputRef = useRef<HTMLInputElement>(null);

	const save = async () => {
		if (!form.user_id || !form.title.trim() || !form.activity_date || !form.credits) return;
		setBusy(true);
		setError('');
		try {
			const saved = record ? await updateCmeRecord(record.id, form) : await createCmeRecord(form);
			const file = fileInputRef.current?.files?.[0];
			if (file) await addCmeRecordEvidence(saved.id, file);
			onSaved();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Lưu thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			title={record ? 'Chỉnh sửa ghi nhận CME' : 'Ghi nhận CME độc lập'}
			size='md'
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={busy}>
						Huỷ
					</button>
					<button className={styles.btnPrimary} onClick={save} disabled={busy}>
						{busy ? <span className={styles.spinner} /> : <CheckSvg />} Lưu
					</button>
				</>
			}
		>
			{error && <div className={styles.fieldError}>{error}</div>}
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Nhân viên *</label>
				<select
					className={styles.formInput}
					value={form.user_id}
					onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
				>
					<option value=''>-- Chọn nhân viên --</option>
					{users.map((u) => (
						<option key={u.id} value={u.id}>
							{u.full_name}
						</option>
					))}
				</select>
			</div>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Danh mục quy đổi</label>
				<select
					className={styles.formInput}
					value={form.category_id}
					onChange={(e) => {
						const catId = e.target.value;
						const cat = categories.find((c) => c.id === catId);
						setForm((f) => ({
							...f,
							category_id: catId,
							credits: f.credits || suggestCredits(cat),
						}));
					}}
				>
					<option value=''>-- Không thuộc danh mục --</option>
					{categories.map((c) => (
						<option key={c.id} value={c.id}>
							{c.name}
						</option>
					))}
				</select>
			</div>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Nội dung hoạt động *</label>
				<input
					className={styles.formInput}
					value={form.title}
					onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
					placeholder='VD: Tự học chuyên đề X'
				/>
			</div>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Ngày hoạt động *</label>
				<input
					type='date'
					className={styles.formInput}
					value={form.activity_date}
					onChange={(e) => setForm((f) => ({ ...f, activity_date: e.target.value }))}
				/>
			</div>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Số tín chỉ *</label>
				<input
					type='number'
					step='0.1'
					className={styles.formInput}
					value={form.credits}
					onChange={(e) => setForm((f) => ({ ...f, credits: e.target.value }))}
				/>
			</div>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Ghi chú</label>
				<input
					className={styles.formInput}
					value={form.note}
					onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
				/>
			</div>
			<div className={styles.formGroup}>
				<label className={styles.formLabel}>Minh chứng đính kèm</label>
				<input ref={fileInputRef} type='file' className={styles.formInput} />
				{record?.evidence_file_url && (
					<div className={styles.modalSub}>
						Hiện có: <a href={record.evidence_file_url} target='_blank' rel='noreferrer'>{record.evidence_file_name}</a>
					</div>
				)}
			</div>
		</Modal>
	);
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
	const [file, setFile] = useState<File | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [preview, setPreview] = useState<CmeRecordImportResult | null>(null);
	const [result, setResult] = useState<CmeRecordImportResult | null>(null);

	const runDryRun = async (f: File) => {
		setLoading(true);
		setError('');
		setPreview(null);
		try {
			setPreview(await importCmeRecordsExcel(f, true));
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Đọc file thất bại');
		} finally {
			setLoading(false);
		}
	};

	const commit = async () => {
		if (!file) return;
		setLoading(true);
		setError('');
		try {
			const res = await importCmeRecordsExcel(file, false);
			setResult(res);
			onDone();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Nhập thất bại');
		} finally {
			setLoading(false);
		}
	};

	const rows = preview?.rows ?? [];

	return (
		<Modal
			open
			onClose={onClose}
			title='Nhập ghi nhận CME từ Excel'
			size='lg'
			footer={
				<>
					<button className={styles.btnCancel} onClick={onClose} disabled={loading}>
						{result ? 'Đóng' : 'Huỷ'}
					</button>
					{!result && (
						<button className={styles.btnPrimary} onClick={commit} disabled={loading || !preview || rows.length === 0}>
							{loading ? <span className={styles.spinner} /> : <UploadSvg />} Nhập {preview?.summary?.valid || ''} dòng hợp lệ
						</button>
					)}
				</>
			}
		>
			{!result && (
				<>
					<div className={styles.noticeBox}>
						<InfoSvg />
						<span>
							Cột nhận diện: MNV hoặc <b>Họ và tên</b>, Danh mục, Nội dung, Ngày hoạt động, Số tín chỉ, Ghi
							chú. Chỉ nhập các dòng khớp được nhân viên và có đủ ngày + số tín chỉ.
						</span>
					</div>
					<div className={styles.formGroup}>
						<label className={styles.formLabel}>File Excel (.xlsx)</label>
						<input
							type='file'
							accept='.xlsx'
							className={styles.formInput}
							onChange={(e) => {
								const f = e.target.files?.[0] ?? null;
								setFile(f);
								setResult(null);
								if (f) runDryRun(f);
							}}
						/>
					</div>
					{loading && <InlineLoading label='Đang đọc file…' />}
					{error && <div className={styles.fieldError}>{error}</div>}
					{preview?.summary && (
						<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
							<CheckSvg />
							<span>
								Đọc được <b>{preview.summary.total}</b> dòng · {preview.summary.matched} khớp nhân viên ·{' '}
								{preview.summary.valid} hợp lệ để nhập.
							</span>
						</div>
					)}
					{preview && preview.warnings.length > 0 && (
						<ul className={styles.warnList}>
							{preview.warnings.slice(0, 50).map((w, i) => (
								<li key={i}>{w}</li>
							))}
						</ul>
					)}
					{rows.length > 0 && (
						<div className={styles.importPreview}>
							<table className={styles.table}>
								<thead>
									<tr>
										<th>#</th>
										<th>Nhân viên</th>
										<th>Nội dung</th>
										<th>Ngày</th>
										<th>Tín chỉ</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((r, i) => (
										<tr key={r.row}>
											<td className={styles.tdIdx}>{i + 1}</td>
											<td>
												{r.matched_user_name || r.full_name_raw || '—'}
												{!r.valid && <div className={styles.rowWarn}>Sẽ bị bỏ qua</div>}
											</td>
											<td>{r.title}</td>
											<td>{r.activity_date || '—'}</td>
											<td>{r.credits ?? '—'}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</>
			)}
			{result && (
				<div className={`${styles.noticeBox} ${styles.noticeOk}`}>
					<CheckSvg />
					<span>
						Đã nhập <b>{result.inserted}</b> ghi nhận.
					</span>
				</div>
			)}
		</Modal>
	);
}

export default function CmeManualRecords() {
	const perms = useSeminarPerms();
	const [year, setYear] = useState(THIS_YEAR);
	const [records, setRecords] = useState<CmeRecord[]>([]);
	const [users, setUsers] = useState<SimpleUser[]>([]);
	const [categories, setCategories] = useState<CmeCreditCategory[]>([]);
	const [search, setSearch] = useState('');
	const [loading, setLoading] = useState(true);
	const [editing, setEditing] = useState<CmeRecord | null | 'new'>(null);
	const [showImport, setShowImport] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);
	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('cme_record', refresh);

	useEffect(() => {
		apiClient.get<{ data: SimpleUser[] }>('/users?limit=0').then((r) => setUsers(r.data)).catch(() => {});
		getCmeCreditCategories().then((r) => setCategories(r.data)).catch(() => {});
	}, []);

	useEffect(() => {
		const load = () => {
			setLoading(true);
			getCmeRecords({ year })
				.then((r) => setRecords(r.data))
				.finally(() => setLoading(false));
		};
		load();
	}, [year, refreshKey]);

	const filtered = records.filter((r) => !search || r.user_name.toLowerCase().includes(search.toLowerCase()));

	const handleDelete = async (id: string) => {
		await deleteCmeRecord(id);
		setDeletingId(null);
		refresh();
	};

	return (
		<AdminLayout
			pageTitle='Ghi nhận CME độc lập'
			pageSubtitle='Ghi nhận tín chỉ CME không qua sự kiện hội thảo (tự học, học online, minh chứng đính kèm)'
			breadcrumbs={[{ label: 'Đào tạo' }]}
			headerActions={
				perms.canCme ? (
					<div style={{ display: 'flex', gap: 8 }}>
						<button className={styles.btnGhost} onClick={() => setShowImport(true)}>
							<UploadSvg /> Nhập từ Excel
						</button>
						<button className={styles.btnPrimary} onClick={() => setEditing('new')}>
							<PlusSvg /> Ghi nhận mới
						</button>
					</div>
				) : undefined
			}
		>
			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách ghi nhận CME</span>
						<span className={styles.tableCount}>{filtered.length} bản ghi</span>
					</div>
					<div className={styles.tableControls}>
						<div className={styles.searchBox}>
							<SearchSvg className={styles.searchIcon} />
							<input
								className={styles.searchInput}
								placeholder='Tìm theo tên nhân viên...'
								value={search}
								onChange={(e) => setSearch(e.target.value)}
							/>
						</div>
						<select className={styles.formInput} value={year} onChange={(e) => setYear(Number(e.target.value))}>
							{YEARS.map((y) => (
								<option key={y} value={y}>
									Năm {y}
								</option>
							))}
						</select>
					</div>
				</div>

				{loading ? (
					<InlineLoading />
				) : filtered.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyTitle}>Chưa có ghi nhận CME nào</div>
					</div>
				) : (
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Nhân viên</th>
								<th>Khoa/phòng</th>
								<th>Nội dung</th>
								<th>Danh mục</th>
								<th>Ngày</th>
								<th>Tín chỉ</th>
								<th>Minh chứng</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{filtered.map((r) => (
								<tr key={r.id} className={styles.tr}>
									<td>{r.user_name}</td>
									<td>{r.department_name ?? '—'}</td>
									<td>{r.title}</td>
									<td>{r.category_name ? <Badge tone='blue'>{r.category_name}</Badge> : '—'}</td>
									<td>{r.activity_date}</td>
									<td>{r.credits}</td>
									<td>
										{r.evidence_file_url ? (
											<a href={r.evidence_file_url} target='_blank' rel='noreferrer'>
												<PaperclipSvg />
											</a>
										) : (
											'—'
										)}
									</td>
									<td className={styles.tdActions}>
										{perms.canCme && (
											<div className={styles.actionBtns}>
												<div className={styles.actionBtn} title='Sửa' onClick={() => setEditing(r)}>
													<CheckSvg />
												</div>
												<div
													className={`${styles.actionBtn} ${styles.danger}`}
													title='Xoá'
													onClick={() => setDeletingId(r.id)}
												>
													<TrashSvg />
												</div>
											</div>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{editing && (
				<RecordFormModal
					record={editing === 'new' ? null : editing}
					users={users}
					categories={categories}
					onClose={() => setEditing(null)}
					onSaved={refresh}
				/>
			)}
			{showImport && <ImportModal onClose={() => setShowImport(false)} onDone={refresh} />}

			<Modal
				open={!!deletingId}
				onClose={() => setDeletingId(null)}
				title='Xoá ghi nhận CME'
				footer={
					<>
						<button className={styles.btnCancel} onClick={() => setDeletingId(null)}>
							Huỷ
						</button>
						<button className={styles.btnDanger} onClick={() => deletingId && handleDelete(deletingId)}>
							<TrashSvg /> Xoá
						</button>
					</>
				}
			>
				Bạn có chắc muốn xoá ghi nhận CME này? Hành động này không thể hoàn tác.
			</Modal>
		</AdminLayout>
	);
}
