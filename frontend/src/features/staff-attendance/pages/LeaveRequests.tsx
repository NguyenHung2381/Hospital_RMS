import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckSvg, XSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Badge, Button, Modal, ModalActions, Pagination, TableEmpty } from '@/shared/components';
import { ExcelActions, type ExcelColumn } from '@/shared/components/Excel';
import { FormField } from '@/shared/components/Input/FormField';
import m from '@/shared/components/Modal/Modal.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { formatDateTimeVN, formatDateVN } from '@/shared/utils/formatDate';
import { notify } from '@/shared/utils/feedback';
import { LEAVE_STATUS, LEAVE_TYPE_TEXT, type LeaveStatus } from '@/features/portal/api/meApi';
import { listLeaveRequests, reviewLeaveRequest, type AdminLeaveRequest } from '../api/leaveApi';

const STATUS_FILTERS: { value: LeaveStatus | ''; label: string }[] = [
	{ value: 'pending', label: 'Chờ duyệt' },
	{ value: 'approved', label: 'Đã duyệt' },
	{ value: 'rejected', label: 'Từ chối' },
	{ value: 'cancelled', label: 'Học viên đã huỷ' },
	{ value: '', label: 'Tất cả trạng thái' },
];

const period = (r: AdminLeaveRequest) =>
	r.from_date === r.to_date ? formatDateVN(r.from_date) : `${formatDateVN(r.from_date)} – ${formatDateVN(r.to_date)}`;
const detail = (r: AdminLeaveRequest) =>
	[r.shift_name ?? (r.type === 'absent' ? 'Cả ngày' : null), r.arrive_time ? `có mặt lúc ${r.arrive_time}` : null]
		.filter(Boolean)
		.join(' · ');

const EXCEL_COLS: ExcelColumn<AdminLeaveRequest>[] = [
	{ header: 'Mã học viên', value: (r) => r.trainee_id },
	{ header: 'Họ và tên', value: (r) => r.full_name },
	{ header: 'Khoa/phòng', value: (r) => r.department_name },
	{ header: 'Khóa học', value: (r) => r.course_name },
	{ header: 'Loại đơn', value: (r) => LEAVE_TYPE_TEXT[r.type] },
	{ header: 'Thời gian', value: (r) => period(r) },
	{ header: 'Ca / giờ có mặt', value: (r) => detail(r) },
	{ header: 'Lý do', value: (r) => r.reason },
	{ header: 'Gửi lúc', value: (r) => formatDateTimeVN(r.created_at) },
	{ header: 'Trạng thái', value: (r) => LEAVE_STATUS[r.status].label },
	{ header: 'Người duyệt', value: (r) => r.reviewer_name },
	{ header: 'Ghi chú duyệt', value: (r) => r.review_note },
];

type Decision = 'approved' | 'rejected';

/** Duyệt / từ chối 1 đơn — từ chối bắt buộc ghi lý do (gửi kèm thông báo cho học viên). */
function ReviewModal({
	req,
	decision,
	onClose,
	onDone,
}: {
	req: AdminLeaveRequest;
	decision: Decision;
	onClose: () => void;
	onDone: () => void;
}) {
	const [note, setNote] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const reject = decision === 'rejected';

	const submit = async () => {
		if (reject && !note.trim()) return setError('Nhập lý do từ chối để học viên biết');
		setBusy(true);
		setError('');
		try {
			await reviewLeaveRequest(req.id, { decision, note: note.trim() || null });
			notify.success(reject ? 'Đã từ chối đơn xin phép' : 'Đã duyệt đơn xin phép');
			onDone();
			onClose();
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Thao tác thất bại');
		} finally {
			setBusy(false);
		}
	};

	return (
		<Modal
			open
			onClose={onClose}
			size='sm'
			title={reject ? 'Từ chối đơn xin phép' : 'Duyệt đơn xin phép'}
			subtitle={`${req.full_name} — ${LEAVE_TYPE_TEXT[req.type]} ${period(req)}`}
			footer={
				<ModalActions
					onCancel={onClose}
					onConfirm={submit}
					loading={busy}
					confirmLabel={reject ? 'Từ chối' : 'Duyệt'}
					confirmIcon={reject ? <XSvg /> : <CheckSvg />}
				/>
			}
		>
			<div className={tbl.cellSub} style={{ marginBottom: 12 }}>
				{detail(req) && <div>{detail(req)}</div>}
				<div>Lý do: {req.reason}</div>
			</div>
			<FormField label={reject ? 'Lý do từ chối' : 'Ghi chú (không bắt buộc)'} required={reject} error={error}>
				<textarea className={m.formTextarea} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
			</FormField>
		</Modal>
	);
}

export default function LeaveRequests() {
	const [rows, setRows] = useState<AdminLeaveRequest[]>([]);
	const [loading, setLoading] = useState(true);
	const [status, setStatus] = useState<LeaveStatus | ''>('pending');
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [search, setSearch] = useState('');
	const [dept, setDept] = useState('');
	const [reviewing, setReviewing] = useState<{
		req: AdminLeaveRequest;
		decision: Decision;
	} | null>(null);

	const load = useCallback(() => {
		listLeaveRequests({ status, from, to })
			.then(setRows)
			.catch((e) => notify.error(e instanceof Error ? e.message : 'Không thể tải đơn xin phép'))
			.finally(() => setLoading(false));
	}, [status, from, to]);
	useEffect(load, [load]);
	useRealtimeUpdate(['attendance_leave'], load);

	const departments = useMemo(() => [...new Set(rows.map((r) => r.department_name).filter((d): d is string => !!d))].sort(), [rows]);
	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		return rows.filter(
			(r) =>
				(!dept || r.department_name === dept) &&
				(!q ||
					r.full_name.toLowerCase().includes(q) ||
					r.trainee_id?.toLowerCase() === q ||
					(r.course_name ?? '').toLowerCase().includes(q)),
		);
	}, [rows, search, dept]);
	const pg = useClientPaging(filtered);
	const pendingCount = rows.filter((r) => r.status === 'pending').length;

	return (
		<AdminLayout
			pageTitle='Đơn xin phép của học viên'
			pageSubtitle='Học viên có việc đột xuất gửi đơn xin nghỉ / xin đi muộn — đơn được duyệt hiện "có phép" ở bảng điểm danh'
			headerActions={<ExcelActions fileName='don-xin-phep' itemLabel='đơn' columns={EXCEL_COLS} getRows={() => filtered} />}
		>
			<div className={tbl.tableCard}>
				<div className={tbl.tableHeader}>
					<div className={tbl.tableHeaderLeft}>
						<span className={tbl.tableTitle}>Đơn xin phép</span>
						<span className={tbl.tableCount}>
							{filtered.length} đơn
							{status !== 'pending' && pendingCount ? ` · ${pendingCount} chờ duyệt` : ''}
						</span>
					</div>
					<div className={tbl.tableControls}>
						<select
							className={tbl.filterSelect}
							value={status}
							onChange={(e) => {
								setLoading(true);
								setStatus(e.target.value as LeaveStatus | '');
							}}
							aria-label='Trạng thái'
						>
							{STATUS_FILTERS.map((s) => (
								<option key={s.value} value={s.value}>
									{s.label}
								</option>
							))}
						</select>
						<input
							type='date'
							className={tbl.filterSelect}
							value={from}
							onChange={(e) => setFrom(e.target.value)}
							aria-label='Từ ngày'
							title='Từ ngày'
						/>
						<input
							type='date'
							className={tbl.filterSelect}
							value={to}
							min={from || undefined}
							onChange={(e) => setTo(e.target.value)}
							aria-label='Đến ngày'
							title='Đến ngày'
						/>
						{(departments.length > 1 || dept) && (
							<select className={tbl.filterSelect} value={dept} onChange={(e) => setDept(e.target.value)} aria-label='Khoa/phòng'>
								<option value=''>Tất cả khoa/phòng</option>
								{departments.map((d) => (
									<option key={d} value={d}>
										{d}
									</option>
								))}
							</select>
						)}
						<SearchInput value={search} onChange={setSearch} placeholder='Tìm theo tên, mã học viên, khóa học...' />
					</div>
				</div>

				<div className={tbl.tableWrap}>
					<table className={tbl.table}>
						<thead>
							<tr>
								<th className={`${tbl.th} ${tbl.thIdx}`}>STT</th>
								<th className={tbl.th}>Học viên</th>
								<th className={tbl.th}>Loại đơn</th>
								<th className={tbl.th}>Thời gian</th>
								<th className={tbl.th}>Lý do</th>
								<th className={tbl.th}>Trạng thái</th>
								<th className={tbl.th}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{!loading && filtered.length === 0 ? (
								<TableEmpty
									colSpan={7}
									title={
										rows.length
											? 'Không có đơn phù hợp bộ lọc'
											: status === 'pending'
												? 'Không có đơn nào đang chờ duyệt'
												: 'Chưa có đơn xin phép nào'
									}
								/>
							) : (
								pg.paged.map((r, i) => (
									<tr key={r.id} className={tbl.tr}>
										<td className={`${tbl.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
										<td className={tbl.td}>
											<div className={tbl.cellTitle}>{r.full_name}</div>
											<div className={tbl.cellSub}>
												{r.trainee_id}
												{r.department_name ? ` · ${r.department_name}` : ''}
											</div>
											{r.course_name && <div className={tbl.cellSub}>{r.course_name}</div>}
										</td>
										<td className={tbl.td}>
											<Badge tone={r.type === 'absent' ? 'blue' : 'purple'}>{LEAVE_TYPE_TEXT[r.type]}</Badge>
										</td>
										<td className={tbl.td}>
											<div className={tbl.cellTitle}>{period(r)}</div>
											{detail(r) && <div className={tbl.cellSub}>{detail(r)}</div>}
										</td>
										<td className={tbl.td} style={{ maxWidth: 320 }}>
											<div>{r.reason}</div>
											<div className={tbl.cellSub}>Gửi lúc {formatDateTimeVN(r.created_at)}</div>
										</td>
										<td className={tbl.td}>
											<Badge tone={LEAVE_STATUS[r.status].tone} dot>
												{LEAVE_STATUS[r.status].label}
											</Badge>
											{r.reviewer_name && (
												<div className={tbl.cellSub}>
													{r.reviewer_name}
													{r.reviewed_at ? ` · ${formatDateTimeVN(r.reviewed_at)}` : ''}
												</div>
											)}
											{r.review_note && <div className={tbl.cellSub}>{r.review_note}</div>}
										</td>
										<td className={tbl.td}>
											{r.status === 'pending' ? (
												<span
													style={{
														display: 'inline-flex',
														gap: 6,
														flexWrap: 'wrap',
													}}
												>
													<Button size='sm' icon={<CheckSvg />} onClick={() => setReviewing({ req: r, decision: 'approved' })}>
														Duyệt
													</Button>
													<Button
														size='sm'
														variant='secondary'
														icon={<XSvg />}
														onClick={() => setReviewing({ req: r, decision: 'rejected' })}
													>
														Từ chối
													</Button>
												</span>
											) : (
												<span className={tbl.cellSub}>—</span>
											)}
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
				<Pagination {...pg.pagination} itemLabel='đơn' />
			</div>
			{reviewing && <ReviewModal req={reviewing.req} decision={reviewing.decision} onClose={() => setReviewing(null)} onDone={load} />}
		</AdminLayout>
	);
}
