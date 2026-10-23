import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { showToast } from '@/shared/utils/feedback';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSvg, TrashSvg, UsersSvg, XSvg } from '@/assets/icons';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { Badge, Button, Modal, TableEmpty } from '@/shared/components';
import { SkeletonTable } from '../../../shared/components/Loading';
import { Pagination } from '../../../shared/components/Table/Pagination';
import sel from '../../../shared/components/Table/RowSelect.module.css';
import {
	BulkButton,
	SelectCheckbox,
	SelectionBar,
} from '../../../shared/components/Table/RowSelect';
import { useRowSelection } from '../../../shared/hooks/useRowSelection';
import {
	bulkCmeStatus,
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
	type CmeRegisterEntry,
	type CmeStats,
} from '../types/seminar.type';
import styles from './Seminar.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';

const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => THIS_YEAR + 1 - i);

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
	const [bulkBusy, setBulkBusy] = useState(false);
	const [revokeAllOpen, setRevokeAllOpen] = useState(false);
	const [revokeAllBusy, setRevokeAllBusy] = useState(false);
	const [revokeAllDone, setRevokeAllDone] = useState(0);
	const [confirmText, setConfirmText] = useState('');
	const [refreshKey, setRefreshKey] = useState(0);

	const [search, setSearch] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

	// id → entry, gom dần theo từng trang đã tải — cần vì bulk-action (đánh dấu
	// ký nhận/thu hồi) cần seminar_id của dòng, mà lựa chọn có thể trải qua nhiều
	// trang trong khi server giờ chỉ trả về đúng 1 trang mỗi lần (xem useRowSelection).
	const entryMapRef = useRef<Map<string, CmeRegisterEntry>>(new Map());

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
	useRealtimeUpdate('seminar', refresh);

	// Debounce ô tìm kiếm 300ms rồi mới gọi API
	useEffect(() => {
		const t = setTimeout(() => setDebouncedSearch(search), 300);
		return () => clearTimeout(t);
	}, [search]);

	// Năm mà dữ liệu đang hiển thị thuộc về. Chỉ hiện skeleton khi tải lần đầu
	// hoặc khi đổi năm — các lần refetch nền (thu hồi / lưu số / realtime) giữ
	// nguyên bảng để không bị nháy mỗi lần refreshKey tăng.
	const loadedYearRef = useRef<number | null>(null);

	useEffect(() => {
		if (loadedYearRef.current !== null && loadedYearRef.current !== year) {
			entryMapRef.current = new Map();
		}
		let alive = true;
		const load = () => {
			if (loadedYearRef.current !== year) setLoading(true);
			Promise.all([
				getCmeRegister(year, { page, limit: pageSize, search: debouncedSearch || undefined }),
				getCmeStats(year),
			])
				.then(([r, s]) => {
					if (!alive) return;
					loadedYearRef.current = year;
					r.entries.forEach((e) => entryMapRef.current.set(e.id, e));
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
	}, [year, page, pageSize, debouncedSearch, refreshKey]);

	// Đổi năm / từ khoá (đã debounce) thì quay về trang đầu (điều chỉnh khi
	// render, không dùng effect, để tránh 1 lượt fetch thừa ở trang cũ)
	const [pageResetKey, setPageResetKey] = useState(`${year}|${debouncedSearch}`);
	if (pageResetKey !== `${year}|${debouncedSearch}`) {
		setPageResetKey(`${year}|${debouncedSearch}`);
		setPage(1);
	}

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

	// Server đã lọc + cắt trang theo debouncedSearch/page — không lọc lại ở client
	const paged = reg?.entries ?? [];
	const total = reg?.pagination.total ?? 0;
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	const safePage = Math.min(page, totalPages);

	const rowSel = useRowSelection(paged.map((e) => e.id));
	// Lựa chọn có thể trải qua nhiều trang — tra theo cache thay vì mảng trang hiện
	// tại. Chỉ gọi trong handler (không phải lúc render) vì đọc ref.current.
	const getSelectedEntries = useCallback(
		() =>
			[...rowSel.selectedIds]
				.map((id) => entryMapRef.current.get(id))
				.filter((e): e is CmeRegisterEntry => !!e),
		[rowSel.selectedIds],
	);

	// Đổi năm / từ khoá thì bỏ chọn (điều chỉnh khi render, đồng bộ với reset trang ở trên).
	const [selResetKey, setSelResetKey] = useState(`${year}|${debouncedSearch}`);
	if (selResetKey !== `${year}|${debouncedSearch}` && !revokeAllBusy) {
		setSelResetKey(`${year}|${debouncedSearch}`);
		rowSel.clearSelection();
		setRevokeAllOpen(false);
		setConfirmText('');
	}

	// Gom các dòng đã chọn theo hội nghị vì API cấp/thu hồi CME chạy theo từng seminar.
	const groupBySeminar = (entries: CmeRegisterEntry[]) => {
		const map = new Map<string, CmeRegisterEntry[]>();
		for (const e of entries) {
			const list = map.get(e.seminar_id);
			if (list) list.push(e);
			else map.set(e.seminar_id, [e]);
		}
		return [...map.entries()];
	};

	const bulkMarkSigned = async () => {
		const targets = getSelectedEntries().filter((e) => e.cme_status !== 'signed');
		if (targets.length === 0) {
			showToast('error', 'Các dòng đã chọn đều đã ký nhận');
			return;
		}
		setBulkBusy(true);
		try {
			for (const [seminarId, list] of groupBySeminar(targets))
				await bulkCmeStatus(seminarId, list.map((e) => e.id), 'signed');
			showToast('success', `Đã đánh dấu ký nhận ${targets.length} lượt cấp`);
			rowSel.clearSelection();
			refresh();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Thao tác thất bại');
		} finally {
			setBulkBusy(false);
		}
	};

	const bulkRevoke = async () => {
		const targets = getSelectedEntries();
		const n = targets.length;
		if (n === 0) return;
		if (
			!window.confirm(
				`Thu hồi số quyết định của ${n} lượt cấp đã chọn? Các dòng này sẽ bị xoá khỏi sổ.`,
			)
		)
			return;
		setBulkBusy(true);
		try {
			for (const [seminarId, list] of groupBySeminar(targets))
				for (const e of list) await revokeCme(seminarId, e.id);
			showToast('success', `Đã thu hồi ${n} số CME`);
			rowSel.clearSelection();
			refresh();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Thu hồi thất bại');
		} finally {
			setBulkBusy(false);
		}
	};

	// Thu hồi TẤT CẢ lượt cấp đang khớp bộ lọc (năm + từ khoá), kể cả trang chưa
	// hiển thị — tải riêng toàn bộ tập khớp bộ lọc ngay lúc thực hiện (server giờ
	// chỉ trả về đúng 1 trang cho phần hiển thị), tránh xoá nhầm/thiếu do dữ liệu cũ.
	const handleRevokeAll = async () => {
		if (confirmText.trim() !== String(total)) return;
		setRevokeAllBusy(true);
		setRevokeAllDone(0);
		let done = 0;
		try {
			const full = await getCmeRegister(year, { search: debouncedSearch || undefined, limit: 0 });
			const targets = full.entries;
			for (const [seminarId, list] of groupBySeminar(targets))
				for (const e of list) {
					await revokeCme(seminarId, e.id);
					done += 1;
					setRevokeAllDone(done);
				}
			showToast('success', `Đã thu hồi ${done} số CME`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Thu hồi thất bại';
			showToast('error', `${msg} (đã thu hồi ${done}/${total})`);
		} finally {
			setRevokeAllBusy(false);
			setRevokeAllOpen(false);
			setConfirmText('');
			rowSel.clearSelection();
			refresh();
		}
	};

	return (
		<AdminLayout
			pageTitle='Sổ cấp chứng nhận'
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

			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Danh sách lượt cấp</span>
						<span className={styles.tableCount}>{total} lượt cấp</span>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={search}
							onChange={setSearch}
							placeholder='Tìm theo SQĐ, họ tên, đơn vị, hội nghị...'
						/>
						{perms.canCme && total > 0 && (
							<Button
								variant='danger'
								size='sm'
								icon={<TrashSvg />}
								onClick={() => {
									setConfirmText('');
									setRevokeAllOpen(true);
								}}
							>
								Thu hồi tất cả{search ? ' (theo lọc)' : ''}
							</Button>
						)}
					</div>
				</div>

				<div className={styles.tableWrap}>
				{perms.canCme && (
					<SelectionBar
						count={rowSel.selectedCount}
						onClear={rowSel.clearSelection}
						itemLabel='lượt cấp'
						actions={
							<>
								<BulkButton onClick={bulkMarkSigned} disabled={bulkBusy}>
									<CheckSvg /> Đánh dấu đã ký
								</BulkButton>
								<BulkButton danger onClick={bulkRevoke} disabled={bulkBusy}>
									<XSvg /> Thu hồi số CME
								</BulkButton>
							</>
						}
					/>
				)}
				<table className={styles.table}>
					<thead>
						<tr>
							{perms.canCme && (
								<th className={sel.checkCol}>
									<SelectCheckbox
										title='Chọn tất cả'
										checked={rowSel.allPageSelected}
										indeterminate={rowSel.somePageSelected && !rowSel.allPageSelected}
										onChange={rowSel.toggleSelectAll}
									/>
								</th>
							)}
							<th className={tbl.thIdx}>STT</th>
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
								cols={perms.canCme ? 12 : 11}
							/>
						) : total === 0 ? (
							<TableEmpty
								colSpan={perms.canCme ? 12 : 11}
								title={search ? 'Không tìm thấy lượt cấp nào' : `Chưa cấp số CME nào trong năm ${year}`}
								desc={search ? 'Thử đổi từ khoá tìm kiếm' : 'Sổ sẽ tự ghi khi cấp CME từ danh sách đại biểu của hội nghị'}
							/>
						) : (
							paged.map((e, i) => (
								<tr
									key={e.id}
									className={rowSel.isSelected(e.id) ? sel.rowSelected : undefined}
								>
									{perms.canCme && (
										<td className={sel.checkCol}>
											<SelectCheckbox
												title='Chọn lượt cấp'
												checked={rowSel.isSelected(e.id)}
												onChange={() => rowSel.toggleSelect(e.id)}
											/>
										</td>
									)}
									<td className={tbl.tdIdx}>{(safePage - 1) * pageSize + i + 1}</td>
									<td className={styles.mono}>{e.cme_certificate_no}</td>
									<td>
										<span className={tbl.cellTitle}>
											{e.title_prefix ? `${e.title_prefix} ` : ''}
											{e.full_name}
										</span>
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
										<div className={styles.actionBtns}>
											<button
												className={styles.actionBtn}
												title='Mở hội nghị'
												onClick={() => navigate(`/admin/seminars/${e.seminar_id}`)}
											>
												<UsersSvg />
											</button>
											{perms.canCme && (
												<button
													className={`${styles.actionBtn} ${styles.danger}`}
													title='Thu hồi số CME'
													disabled={revokingId !== null}
													style={revokingId === e.id ? { opacity: 0.5 } : undefined}
													onClick={() => handleRevoke(e.seminar_id, e.id, e.cme_seq)}
												>
													<XSvg />
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
					page={safePage}
					totalPages={totalPages}
					total={total}
					rowsPerPage={pageSize}
					onPageChange={setPage}
					onRowsPerPageChange={(n) => {
						setPageSize(n);
						setPage(1);
					}}
					itemLabel='lượt cấp'
				/>
			</div>

			<Modal
				open={revokeAllOpen}
				onClose={() => !revokeAllBusy && setRevokeAllOpen(false)}
				title='Thu hồi tất cả số CME'
				size='sm'
				closeOnBackdrop={!revokeAllBusy}
				footer={
					<>
						<Button
							variant='ghost'
							onClick={() => setRevokeAllOpen(false)}
							disabled={revokeAllBusy}
						>
							Huỷ
						</Button>
						<Button
							variant='danger'
							onClick={handleRevokeAll}
							loading={revokeAllBusy}
							disabled={confirmText.trim() !== String(total)}
						>
							Thu hồi {total} lượt cấp
						</Button>
					</>
				}
			>
				<p style={{ margin: '0 0 12px', lineHeight: 1.6, fontSize: 'var(--font-size-sm)' }}>
					Sẽ thu hồi số quyết định của{' '}
					<strong>toàn bộ {total} lượt cấp</strong>{' '}
					{search ? (
						<>
							đang khớp từ khoá “<strong>{search}</strong>”
						</>
					) : (
						<>trong năm {year}</>
					)}
					. Các dòng này sẽ bị xoá khỏi sổ và <strong>không thể hoàn tác</strong>.
				</p>
				<label className={styles.formLabel} style={{ display: 'block', marginBottom: 6 }}>
					Nhập số <strong>{total}</strong> để xác nhận
				</label>
				<input
					className={styles.seqInput}
					value={confirmText}
					onChange={(e) => setConfirmText(e.target.value.replace(/\D/g, ''))}
					disabled={revokeAllBusy}
					autoFocus
					inputMode='numeric'
				/>
				{revokeAllBusy && (
					<p className={styles.muted} style={{ marginTop: 10 }}>
						Đang thu hồi {revokeAllDone}/{total}…
					</p>
				)}
			</Modal>

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
