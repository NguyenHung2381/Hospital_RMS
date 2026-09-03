import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSvg, SearchSvg, UsersSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Badge } from '@/shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import {
	getCmeRegister,
	getCmeStats,
	revokeCme,
	updateCmeRegisterSeq,
} from '../api/seminarApi';
import { useSeminarPerms } from '../utils/perms';
import {
	CME_STATUS_LABELS,
	PARTICIPATION_LABELS,
	SOURCE_LABELS,
	type CmeRegister as CmeRegisterT,
	type CmeStats,
} from '../types/seminar.type';
import styles from './Seminar.module.css';

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => THIS_YEAR + 1 - i);
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const fmtDate = (s: string | null) => {
	if (!s) return '';
	const d = new Date(s);
	return Number.isNaN(d.getTime())
		? s
		: d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function CmeRegister() {
	const perms = useSeminarPerms();
	const navigate = useNavigate();
	const [year, setYear] = useState(THIS_YEAR);
	const [reg, setReg] = useState<CmeRegisterT | null>(null);
	const [stats, setStats] = useState<CmeStats | null>(null);
	const [loading, setLoading] = useState(true);
	const [seqDraft, setSeqDraft] = useState('');
	const [savingSeq, setSavingSeq] = useState(false);
	const [revokingId, setRevokingId] = useState<string | null>(null);
	const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(25);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('seminar', refresh);

	const showToast = (type: 'success' | 'error', msg: string) => {
		setToast({ type, msg });
		setTimeout(() => setToast(null), 3000);
	};

	useEffect(() => {
		let alive = true;
		const load = () => {
			setLoading(true);
			Promise.all([getCmeRegister(year), getCmeStats(year)])
				.then(([r, s]) => {
					if (!alive) return;
					setReg(r);
					setStats(s);
					setSeqDraft(String(r.last_seq));
				})
				.catch(() => alive && showToast('error', 'Không tải được sổ cấp CME'))
				.finally(() => alive && setLoading(false));
		};
		load();
		return () => {
			alive = false;
		};
	}, [year, refreshKey]);

	// Đổi năm / từ khoá thì quay về trang đầu
	useEffect(() => setPage(1), [year, search]);

	const saveSeq = async () => {
		const n = Number(seqDraft);
		if (!Number.isInteger(n) || n < 0) return;
		setSavingSeq(true);
		try {
			await updateCmeRegisterSeq(year, n);
			showToast('success', 'Đã cập nhật số cuối đã cấp');
			refresh();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Cập nhật thất bại');
		} finally {
			setSavingSeq(false);
		}
	};

	const handleRevoke = async (seminarId: string, pid: string, seq: number) => {
		if (!window.confirm(`Thu hồi số quyết định ${seq}? Dòng này sẽ bị xoá khỏi sổ.`)) return;
		setRevokingId(pid);
		try {
			await revokeCme(seminarId, pid);
			showToast('success', 'Đã thu hồi số CME');
			refresh();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Thu hồi thất bại');
		} finally {
			setRevokingId(null);
		}
	};

	const allEntries = reg?.entries ?? [];

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return allEntries;
		return allEntries.filter((e) =>
			[e.cme_certificate_no, e.full_name, e.organization, e.seminar_title]
				.filter(Boolean)
				.some((v) => String(v).toLowerCase().includes(q)),
		);
	}, [allEntries, search]);

	const total = filtered.length;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(page, totalPages);
	const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

	return (
		<AdminLayout
			pageTitle='Sổ cấp CME'
			pageSubtitle='Số quyết định chạy liên tục theo năm, hết năm bắt đầu chu trình mới'
		>
			<div className={styles.regHead}>
				<div className={styles.formGroup}>
					<label className={styles.formLabel}>Năm chu trình</label>
					<select
						className={styles.filterSelect}
						value={year}
						onChange={(e) => setYear(Number(e.target.value))}
					>
						{YEARS.map((y) => (
							<option key={y} value={y}>
								{y}
							</option>
						))}
					</select>
				</div>

				<div className={styles.seqBox}>
					<span className={styles.infoLabel}>Số cuối đã cấp</span>
					{perms.canCme ? (
						<>
							<input
								className={styles.seqInput}
								value={seqDraft}
								onChange={(e) => setSeqDraft(e.target.value.replace(/\D/g, ''))}
							/>
							<button
								className={styles.btnGhost}
								onClick={saveSeq}
								disabled={savingSeq || seqDraft === String(reg?.last_seq ?? '')}
							>
								{savingSeq ? <span className={styles.spinner} /> : <CheckSvg />} Lưu
							</button>
						</>
					) : (
						<strong className={styles.mono}>{reg?.last_seq ?? 0}</strong>
					)}
				</div>
			</div>

			{stats && (
				<div className={styles.statsRow}>
					<Stat label='Tổng lượt cấp' value={stats.total} />
					<Stat label='Đại biểu' value={stats.attendees} />
					<Stat label='Báo cáo viên' value={stats.speakers} />
					<Stat label='Nội viện' value={stats.internal_count} />
					<Stat label='Ngoại viện' value={stats.external_count} />
					<Stat label='Đã ký nhận' value={stats.signed_count} />
					<Stat label='Tổng tín chỉ' value={stats.total_credits} />
				</div>
			)}

			<div className={styles.toolbar}>
				<div className={styles.searchBox}>
					<SearchSvg />
					<input
						className={styles.searchInput}
						placeholder='Tìm theo SQĐ, họ tên, đơn vị, hội nghị...'
						value={search}
						onChange={(e) => setSearch(e.target.value)}
					/>
					{search && (
						<button className={styles.searchClear} onClick={() => setSearch('')}>
							<XSvg />
						</button>
					)}
				</div>
				<span className={styles.resultCount}>{total} lượt cấp</span>
			</div>

			<div className={styles.tableWrap}>
				<table className={styles.table}>
					<thead>
						<tr>
							<th>SQĐ</th>
							<th>Họ và tên</th>
							<th>Ngày sinh</th>
							<th>Đơn vị</th>
							<th>Nguồn</th>
							<th>Vai trò</th>
							<th>Tín chỉ</th>
							<th>Trạng thái</th>
							<th>Hội nghị</th>
							<th className={styles.thRight}>Thao tác</th>
						</tr>
					</thead>
					<tbody>
						{loading ? (
							<SkeletonTable
								rows={8}
								cols={10}
							/>
						) : total === 0 ? (
							<tr>
								<td colSpan={10}>
									<div className={styles.emptyState}>
										<div className={styles.emptyTitle}>
											{search
												? 'Không tìm thấy lượt cấp nào'
												: `Chưa cấp số CME nào trong năm ${year}`}
										</div>
										<div className={styles.emptyDesc}>
											{search
												? 'Thử đổi từ khoá tìm kiếm'
												: 'Sổ sẽ tự ghi khi cấp CME từ danh sách đại biểu của hội nghị'}
										</div>
									</div>
								</td>
							</tr>
						) : (
							paged.map((e) => (
								<tr key={e.id}>
									<td className={styles.mono}>{e.cme_certificate_no}</td>
									<td>
										{e.title_prefix ? `${e.title_prefix} ` : ''}
										{e.full_name}
									</td>
									<td>
										{e.dob_text || fmtDate(e.dob) || <span className={styles.muted}>—</span>}
									</td>
									<td>{e.organization || <span className={styles.muted}>—</span>}</td>
									<td>{SOURCE_LABELS[e.source]}</td>
									<td>{PARTICIPATION_LABELS[e.participation_type]}</td>
									<td>{e.cme_credits ?? <span className={styles.muted}>—</span>}</td>
									<td>
										<Badge
											tone={
												e.cme_status === 'signed'
													? 'green'
													: e.cme_status === 'issued'
														? 'blue'
														: 'gray'
											}
										>
											{CME_STATUS_LABELS[e.cme_status]}
										</Badge>
									</td>
									<td className={styles.muted}>{e.seminar_title}</td>
									<td className={styles.tdRight}>
										<button
											className={styles.actionBtn}
											title='Mở hội nghị'
											onClick={() => navigate(`/admin/seminars/${e.seminar_id}`)}
										>
											<UsersSvg />
										</button>
										{perms.canCme && (
											<button
												className={`${styles.actionBtn} ${styles.actionDelete}`}
												title='Thu hồi số CME'
												disabled={revokingId !== null}
												style={revokingId === e.id ? { opacity: 0.5 } : undefined}
												onClick={() => handleRevoke(e.seminar_id, e.id, e.cme_seq)}
											>
												<XSvg />
											</button>
										)}
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{total > 0 && (
				<Pagination
					page={safePage}
					totalPages={totalPages}
					total={total}
					rowsPerPage={pageSize}
					pageSizeOptions={PAGE_SIZE_OPTIONS}
					onPageChange={setPage}
					onRowsPerPageChange={(n) => {
						setPageSize(n);
						setPage(1);
					}}
					itemLabel='lượt cấp'
				/>
			)}

			{toast && (
				<div
					className={`${styles.toast} ${toast.type === 'success' ? styles.toastSuccess : styles.toastError}`}
				>
					{toast.type === 'success' ? <CheckSvg /> : <XSvg />}
					{toast.msg}
				</div>
			)}
		</AdminLayout>
	);
}

function Stat({ label, value }: { label: string; value: number | string }) {
	return (
		<div className={styles.statCard}>
			<div className={styles.statValue}>{value}</div>
			<div className={styles.statLabel}>{label}</div>
		</div>
	);
}
