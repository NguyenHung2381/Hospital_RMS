import { useEffect, useMemo, useState } from 'react';
import { AlertSvg, CheckSvg } from '@/assets/icons';
import { Badge, Button, Pagination, SearchInput, SkeletonTable, TableEmpty } from '@/shared/components';
import { formatDateVN } from '@/shared/utils/formatDate';
import { DEFAULT_PAGE_SIZE } from '@/shared/utils/constants';
import {
	getCmeCycleCompliance,
	type CmeCycleComplianceResult,
	type CmeCycleStatus,
} from '../api/cmeRequirementApi';
import { CME_CYCLE_BASIS_NOTE, CME_CYCLE_STATUS, formatDaysLeft, formatHours } from '../utils/cmeCycle';
import { CmeCycleProgress } from './CmeCycleProgress';
import styles from './CmeCycleView.module.css';

interface Props {
	departments: { id: string; name: string }[];
	/** Báo số năm của chu kỳ (meta.cycle_years) để trang đặt tên tab chế độ xem. */
	onCycleYears?: (years: number) => void;
}

type StatusTab = 'all' | CmeCycleStatus;
const TAB_ORDER: StatusTab[] = ['all', 'overdue_window', 'at_risk', 'on_track', 'met'];
const TAB_LABEL: Record<StatusTab, string> = {
	all: 'Tất cả',
	overdue_window: CME_CYCLE_STATUS.overdue_window.label,
	at_risk: CME_CYCLE_STATUS.at_risk.label,
	on_track: CME_CYCLE_STATUS.on_track.label,
	met: CME_CYCLE_STATUS.met.label,
};
const COLS = 8;

/** Chế độ "Chu kỳ 5 năm": đối chiếu giờ tín chỉ từng người với ngưỡng 120 giờ / 5 năm liên tục. */
export default function CmeCycleView({ departments, onCycleYears }: Props) {
	const [statusTab, setStatusTab] = useState<StatusTab>('all');
	const [searchInput, setSearchInput] = useState('');
	const [search, setSearch] = useState('');
	const [dept, setDept] = useState('');
	const [licensedOnly, setLicensedOnly] = useState(true);
	const [page, setPage] = useState(1);
	const [limit, setLimit] = useState<number>(DEFAULT_PAGE_SIZE);

	// Ô tìm: chờ người dùng ngừng gõ rồi mới gọi API
	useEffect(() => {
		const t = window.setTimeout(() => {
			const next = searchInput.trim();
			if (next !== search) {
				setSearch(next);
				setPage(1);
			}
		}, 300);
		return () => window.clearTimeout(t);
	}, [searchInput, search]);

	// Kết quả gắn với khóa của bộ lọc đã gọi — khóa khác bộ lọc hiện tại nghĩa là đang tải (không cần setState trong effect)
	const query = useMemo(
		() => ({
			scope: licensedOnly ? ('licensed' as const) : ('all' as const),
			department_id: dept || undefined,
			status: statusTab === 'all' ? undefined : [statusTab],
			search,
			sort: 'urgency' as const,
			page,
			limit,
		}),
		[licensedOnly, dept, statusTab, search, page, limit],
	);
	const [retry, setRetry] = useState(0);
	const loadKey = `${JSON.stringify(query)}|${retry}`;
	const [settled, setSettled] = useState<{ key: string; error: string } | null>(null);
	const [result, setResult] = useState<CmeCycleComplianceResult | null>(null);
	const loading = settled?.key !== loadKey;
	const error = loading ? '' : (settled?.error ?? '');

	useEffect(() => {
		let cancelled = false;
		getCmeCycleCompliance(query)
			.then((r) => {
				if (cancelled) return;
				setResult(r);
				setSettled({ key: loadKey, error: '' });
			})
			.catch((err) => {
				if (cancelled) return;
				setSettled({ key: loadKey, error: err instanceof Error ? err.message : 'Không thể tải dữ liệu' });
			});
		return () => {
			cancelled = true;
		};
	}, [query, loadKey]);

	const meta = result?.meta;
	const cycleYears = meta?.cycle_years;
	useEffect(() => {
		if (cycleYears) onCycleYears?.(cycleYears);
	}, [cycleYears, onCycleYears]);
	const summary = result?.summary;
	const total = result?.pagination.total ?? 0;
	const rows = result?.data ?? [];
	const filtering = !!search || !!dept || statusTab !== 'all';

	const countOf = (t: StatusTab) => (summary ? (t === 'all' ? summary.total : summary[t]) : null);

	return (
		<div className={styles.root}>
			<p className={styles.desc}>
				{meta
					? `Người hành nghề phải cập nhật tối thiểu ${meta.required_hours} giờ tín chỉ trong ${meta.cycle_years} năm liên tục (Thông tư 32/2023/TT-BYT, Điều 3).`
					: 'Người hành nghề phải cập nhật kiến thức y khoa liên tục theo Thông tư 32/2023/TT-BYT, Điều 3.'}
			</p>

			{error && (
				<div
					className={styles.notice}
					role='alert'
				>
					<AlertSvg /> {error}
					<Button
						size='sm'
						variant='secondary'
						className={styles.noticeRetry}
						onClick={() => setRetry((n) => n + 1)}
					>
						Thử lại
					</Button>
				</div>
			)}

			<div className={styles.tableCard}>
				<div className={styles.tableHeader}>
					<div className={styles.tableHeaderLeft}>
						<span className={styles.tableTitle}>Chu kỳ cập nhật kiến thức y khoa liên tục</span>
						<span className={styles.tableCount}>{total} người</span>
					</div>
					<div className={styles.tableControls}>
						<SearchInput
							value={searchInput}
							onChange={setSearchInput}
							placeholder='Tên, số giấy phép, mã nhân viên...'
						/>
						<select
							className={styles.filterSelect}
							value={dept}
							onChange={(e) => {
								setDept(e.target.value);
								setPage(1);
							}}
							title='Khoa / Phòng'
							aria-label='Khoa / Phòng'
						>
							<option value=''>Tất cả khoa/phòng</option>
							{departments.map((d) => (
								<option
									key={d.id}
									value={d.id}
								>
									{d.name}
								</option>
							))}
						</select>
						<label className={styles.scopeCheck}>
							<input
								type='checkbox'
								checked={licensedOnly}
								onChange={(e) => {
									setLicensedOnly(e.target.checked);
									setPage(1);
								}}
							/>
							Chỉ người có giấy phép hành nghề
						</label>
					</div>
				</div>

				<div
					className={styles.tabsRow}
					role='tablist'
				>
					{TAB_ORDER.map((t) => {
						const n = countOf(t);
						return (
							<button
								key={t}
								type='button'
								role='tab'
								aria-selected={statusTab === t}
								className={`${styles.tab} ${statusTab === t ? styles.tabActive : ''}`}
								onClick={() => {
									setStatusTab(t);
									setPage(1);
								}}
							>
								{TAB_LABEL[t]}
								{n !== null && <span className={styles.tabBadge}>{n}</span>}
							</button>
						);
					})}
				</div>

				<div className={styles.tableWrap}>
					<table className={styles.table}>
						<thead>
							<tr>
								<th>Họ tên</th>
								<th>Khoa / Phòng</th>
								<th>Số giấy phép</th>
								<th>Chu kỳ</th>
								<th>Đã có / Yêu cầu</th>
								<th>Còn thiếu</th>
								<th>Còn lại</th>
								<th>Trạng thái</th>
							</tr>
						</thead>
						<tbody>
							{loading && !result ? (
								<SkeletonTable
									rows={6}
									cols={COLS}
								/>
							) : error && !result ? (
								<TableEmpty
									colSpan={COLS}
									title='Không tải được dữ liệu'
									desc={error}
								/>
							) : rows.length === 0 ? (
								filtering ? (
									<TableEmpty
										colSpan={COLS}
										title='Không tìm thấy nhân sự phù hợp'
										desc='Thử đổi từ khóa hoặc bộ lọc'
									/>
								) : (
									<TableEmpty
										colSpan={COLS}
										icon={<CheckSvg />}
										title={licensedOnly ? 'Chưa có người hành nghề nào có giấy phép' : 'Chưa có nhân sự nào'}
										desc={licensedOnly ? 'Bỏ chọn "Chỉ người có giấy phép hành nghề" để xem tất cả nhân sự' : undefined}
									/>
								)
							) : (
								rows.map((r) => {
									const st = CME_CYCLE_STATUS[r.status];
									const basisNote = CME_CYCLE_BASIS_NOTE[r.basis];
									return (
										<tr
											key={r.id}
											style={loading ? { opacity: 0.6 } : undefined}
										>
											<td>
												<div className={styles.name}>{r.full_name}</div>
												{r.staff_number != null && <div className={styles.sub}>MNV {r.staff_number}</div>}
											</td>
											<td className={styles.muted}>{r.department_name ?? '—'}</td>
											<td className={styles.num}>{r.license_no ?? '—'}</td>
											<td>
												<div className={styles.cycleRange}>
													{formatDateVN(r.cycle_start)} – {formatDateVN(r.cycle_end)}
												</div>
												{basisNote && <div className={styles.sub}>{basisNote}</div>}
											</td>
											<td>
												<CmeCycleProgress
													earned={r.earned}
													required={r.required}
													status={r.status}
												/>
												{r.earned_undated > 0 && (
													<div className={styles.sub}>gồm {formatHours(r.earned_undated)} giờ chưa rõ ngày</div>
												)}
											</td>
											<td className={styles.num}>{r.missing > 0 ? `${formatHours(r.missing)} giờ` : '—'}</td>
											<td className={styles.num}>{formatDaysLeft(r.days_left, r.basis)}</td>
											<td>
												<Badge tone={st.tone}>{st.label}</Badge>
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>

				<Pagination
					page={result?.pagination.page ?? page}
					totalPages={Math.max(1, Math.ceil(total / limit))}
					total={total}
					rowsPerPage={limit}
					onPageChange={setPage}
					onRowsPerPageChange={(n) => {
						setLimit(n);
						setPage(1);
					}}
					itemLabel='nhân sự'
				/>
			</div>
		</div>
	);
}
