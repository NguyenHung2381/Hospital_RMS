import { RowAction, RowActions } from '@/shared/components/Table/TableToolbar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckSvg, XSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Badge, Pagination, TableEmpty, promptDialog } from '@/shared/components';
import tbl from '@/shared/components/Table/Table.module.css';
import { SearchInput } from '@/shared/components/Table/TableToolbar';
import { useClientPaging } from '@/shared/hooks/useClientPaging';
import { notify } from '@/shared/utils/feedback';
import { formatStamp } from '@/features/signing/utils/formatStamp';
import { bankReconcileApi } from '../api/tuitionApi';
import { formatVnd } from '../types/tuition.type';
import {
	BANK_TXN_REASON,
	BANK_TXN_STATUS,
	type BankStatus,
	type BankTxn,
	type BankTxnList,
	type BankTxnStatus,
} from '../types/bankReconcile.type';
import s from './BankReconcile.module.css';

const ENROLLMENT_CODE = /^DK\d{12}$/;

const FILTERS: { value: BankTxnStatus | ''; label: string }[] = [
	{ value: 'unmatched', label: 'Chờ xử lý' },
	{ value: 'matched', label: 'Đã ghi nhận' },
	{ value: 'ignored', label: 'Bỏ qua' },
	{ value: '', label: 'Tất cả' },
];

const errText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/**
 * Giao dịch tiền vào tài khoản học phí do ngân hàng báo về (webhook). Hệ thống tự ghi nhận
 * giao dịch có nội dung "HP <mã ghi danh>" hợp lệ; giao dịch còn lại nằm ở "Chờ xử lý" để
 * phòng Đào tạo gán cho đúng học viên hoặc bỏ qua.
 */
export default function BankReconcile() {
	const [data, setData] = useState<BankTxnList | null>(null);
	const [conn, setConn] = useState<BankStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [status, setStatus] = useState<BankTxnStatus | ''>('unmatched');
	const [search, setSearch] = useState('');
	const [query, setQuery] = useState('');

	// Tìm trên server (nội dung, mã giao dịch, mã ghi danh, tên học viên) — chờ gõ xong
	useEffect(() => {
		const t = setTimeout(() => setQuery(search), 350);
		return () => clearTimeout(t);
	}, [search]);

	const load = useCallback(() => {
		bankReconcileApi
			.list({ status, q: query })
			.then(setData)
			.catch((e) => notify.error(errText(e, 'Không tải được giao dịch ngân hàng')))
			.finally(() => setLoading(false));
		bankReconcileApi
			.status()
			.then(setConn)
			.catch(() => setConn(null));
	}, [status, query]);
	useEffect(load, [load]);
	useRealtimeUpdate(['tuition_bank', 'tuition'], load);

	const rows = useMemo(() => data?.items ?? [], [data]);
	const pg = useClientPaging(rows);
	const counts = data?.counts;

	const assign = async (t: BankTxn) => {
		await promptDialog({
			title: 'Gán giao dịch cho học viên',
			message: `${formatVnd(t.amount)} — "${t.content || 'không có nội dung'}". Hệ thống ghi nhận khoản nộp, cấp phiếu thu và báo cho học viên.`,
			label: 'Mã ghi danh (DK…)',
			defaultValue: t.enrollment_id ?? '',
			placeholder: 'DK202611050001',
			required: true,
			maxLength: 20,
			confirmLabel: 'Ghi nhận',
			validate: (v) =>
				ENROLLMENT_CODE.test(v.trim().toUpperCase())
					? null
					: 'Mã ghi danh dạng DK + 12 số — xem ở tab Học viên / Học phí của khóa',
			onConfirm: async (v) => {
				await bankReconcileApi.assign(t.id, v.trim().toUpperCase());
				notify.success('Đã ghi nhận học phí và cấp phiếu thu');
				load();
			},
		});
	};

	const ignore = async (t: BankTxn) => {
		await promptDialog({
			title: 'Bỏ qua giao dịch',
			message: `${formatVnd(t.amount)} — "${t.content || 'không có nội dung'}". Giao dịch không được tính vào học phí của ai.`,
			label: 'Lý do',
			placeholder: 'VD: không phải tiền học phí / đã hoàn tiền cho người chuyển',
			required: true,
			multiline: true,
			maxLength: 500,
			confirmLabel: 'Bỏ qua',
			tone: 'danger',
			onConfirm: async (v) => {
				await bankReconcileApi.ignore(t.id, v.trim());
				notify.success('Đã bỏ qua giao dịch');
				load();
			},
		});
	};

	const countText = (v: BankTxnStatus | '') =>
		counts && v ? ` (${counts[v]})` : counts && !v ? ` (${counts.unmatched + counts.matched + counts.ignored})` : '';

	return (
		<AdminLayout
			pageTitle='Đối soát ngân hàng'
			pageSubtitle='Tiền học phí ngân hàng báo về: giao dịch đúng nội dung "HP <mã ghi danh>" được ghi nhận và cấp phiếu thu tự động, còn lại chờ bạn xử lý'
		>
			{conn && !conn.provider && (
				<div className={s.notice} role='status'>
					<span>Chưa bật kết nối ngân hàng — chưa có giao dịch mới nào được nhận.</span>
					<Link className={s.noticeLink} to='/admin/settings?tab=training'>
						Mở cấu hình
					</Link>
				</div>
			)}
			{conn?.provider && !conn.auto_confirm && (
				<div className={s.notice} role='status'>
					<span>Tự xác nhận đang tắt: mọi giao dịch vào "Chờ xử lý", đã gợi ý sẵn mã ghi danh dò được.</span>
					<Link className={s.noticeLink} to='/admin/settings?tab=training'>
						Mở cấu hình
					</Link>
				</div>
			)}

			<div className={tbl.tableCard}>
				<div className={tbl.tableHeader}>
					<div className={tbl.tableHeaderLeft}>
						<span className={tbl.tableTitle}>Giao dịch</span>
						<span className={tbl.tableCount}>
							{rows.length} giao dịch
							{conn?.last_received_at ? ` · nhận gần nhất ${formatStamp(conn.last_received_at)}` : ''}
						</span>
					</div>
					<div className={tbl.tableControls}>
						<select
							className={tbl.filterSelect}
							value={status}
							onChange={(e) => {
								setLoading(true);
								setStatus(e.target.value as BankTxnStatus | '');
							}}
							aria-label='Trạng thái'
						>
							{FILTERS.map((f) => (
								<option key={f.value} value={f.value}>
									{f.label}
									{countText(f.value)}
								</option>
							))}
						</select>
						<SearchInput value={search} onChange={setSearch} placeholder='Tìm nội dung, mã giao dịch, mã ghi danh, học viên...' />
					</div>
				</div>

				<div className={tbl.tableWrap}>
					<table className={tbl.table}>
						<thead>
							<tr>
								<th className={`${tbl.th} ${tbl.thIdx}`}>STT</th>
								<th className={tbl.th}>Thời gian</th>
								<th className={tbl.th}>Số tiền</th>
								<th className={tbl.th}>Nội dung chuyển khoản</th>
								<th className={tbl.th}>Học viên</th>
								<th className={tbl.th}>Trạng thái</th>
								<th className={`${tbl.th} ${tbl.thRight}`}>Thao tác</th>
							</tr>
						</thead>
						<tbody>
							{!loading && rows.length === 0 ? (
								<TableEmpty
									colSpan={7}
									title={
										query
											? 'Không có giao dịch phù hợp'
											: status === 'unmatched'
												? 'Không có giao dịch nào chờ xử lý'
												: 'Chưa có giao dịch nào'
									}
								/>
							) : (
								pg.paged.map((t, i) => (
									<tr key={t.id} className={tbl.tr}>
										<td className={`${tbl.td} ${tbl.tdIdx}`}>{pg.offset + i + 1}</td>
										<td className={tbl.td}>
											<div className={tbl.cellTitle}>{formatStamp(t.txn_time ?? t.received_at)}</div>
											{t.txn_time && <div className={tbl.cellSub}>Nhận {formatStamp(t.received_at)}</div>}
										</td>
										<td className={tbl.td}>
											<span className={s.amount}>{formatVnd(t.amount)}</span>
										</td>
										<td className={tbl.td}>
											<div className={s.content}>{t.content || <span className={tbl.cellSub}>(không có nội dung)</span>}</div>
											<div className={tbl.cellSub}>
												Mã GD {t.external_id}
												{t.account_no ? ` · TK ${t.account_no}` : ''}
											</div>
										</td>
										<td className={tbl.td}>
											{t.trainee_name ? (
												<>
													<div className={tbl.cellTitle}>{t.trainee_name}</div>
													<div className={tbl.cellSub}>
														{t.enrollment_id}
														{t.status === 'unmatched' ? ' · gợi ý' : ''}
													</div>
													{t.course_id && (
														<Link className={tbl.cellSub} to={`/admin/courses/${encodeURIComponent(t.course_id)}?tab=tuition`}>
															{t.course_name}
														</Link>
													)}
												</>
											) : (
												<span className={tbl.cellSub}>—</span>
											)}
										</td>
										<td className={tbl.td}>
											<Badge tone={BANK_TXN_STATUS[t.status].tone} dot>
												{BANK_TXN_STATUS[t.status].label}
											</Badge>
											{t.reason && <div className={tbl.cellSub}>{BANK_TXN_REASON[t.reason] ?? t.reason}</div>}
											{t.receipt_no && <div className={tbl.cellSub}>Phiếu thu {t.receipt_no}</div>}
											{t.status !== 'unmatched' && (
												<div className={tbl.cellSub}>
													{t.handled_by_name ?? 'Tự động'}
													{t.handled_at ? ` · ${formatStamp(t.handled_at)}` : ''}
												</div>
											)}
											{t.note && <div className={tbl.cellSub}>{t.note}</div>}
										</td>
										<td className={tbl.td}>
											{t.status === 'unmatched' ? (
												<RowActions>
													<RowAction
														title='Gán'
														tone='success'
														onClick={() => void assign(t)}
													>
														<CheckSvg />
													</RowAction>
													<RowAction
														title='Bỏ qua'
														onClick={() => void ignore(t)}
													>
														<XSvg />
													</RowAction>
												</RowActions>
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
				<Pagination {...pg.pagination} itemLabel='giao dịch' />
			</div>
		</AdminLayout>
	);
}
