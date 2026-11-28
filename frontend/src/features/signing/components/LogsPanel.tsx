import { Badge, Pagination, TableEmpty } from '@/shared/components';
import { SkeletonTable } from '@/shared/components/Loading';
import base from '@/shared/components/Table/CrudPage.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { formatStamp } from '../utils/formatStamp';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { signingApi } from '../api/signingApi';
import type { SigningAccount, SigningDocType } from '../types/signing.type';
import styles from '../pages/SigningAdmin.module.css';

const DOC_TYPE_LABEL: Record<SigningDocType, string> = {
	seminar_certificate: 'Giấy chứng nhận CME',
	practice_document: 'Giấy tờ thực hành',
	registration_document: 'Đơn / tờ trình đào tạo',
	topic_approval: 'Phiếu phê duyệt đề tài',
	user_document: 'Ký tài liệu',
	sign_request: 'Trình ký văn bản',
	test: 'Ký thử',
};

const LIMIT = 50;

/** Nhật ký mỗi lần gọi ký (thành công lẫn lỗi) — chỉ lưu mã băm, không lưu nội dung file. */
export function LogsPanel({ accounts }: { accounts: SigningAccount[] }) {
	const [page, setPage] = useState(1);
	const [status, setStatus] = useState('');
	const [docType, setDocType] = useState('');
	const [accountId, setAccountId] = useState<number | ''>('');
	const { data, isLoading } = useQuery({
		queryKey: ['signing', 'logs', page, status, docType, accountId],
		queryFn: () => signingApi.logs({ page, limit: LIMIT, status, doc_type: docType, account_id: accountId }),
	});
	const filter = <T,>(set: (v: T) => void) => (v: T) => {
		set(v);
		setPage(1);
	};
	const COLS = 5;

	return (
		<>
			<div className={styles.filters}>
				<select
					className={base.formInput}
					value={docType}
					onChange={(e) => filter(setDocType)(e.target.value)}
					aria-label='Loại tài liệu'
				>
					<option value=''>Mọi loại tài liệu</option>
					{Object.entries(DOC_TYPE_LABEL).map(([k, v]) => (
						<option
							key={k}
							value={k}
						>
							{v}
						</option>
					))}
				</select>
				<select
					className={base.formInput}
					value={accountId}
					onChange={(e) => filter(setAccountId)(e.target.value ? Number(e.target.value) : '')}
					aria-label='Tài khoản ký'
				>
					<option value=''>Mọi tài khoản</option>
					{accounts.map((a) => (
						<option
							key={a.id}
							value={a.id}
						>
							{a.label}
						</option>
					))}
				</select>
				<select
					className={base.formInput}
					value={status}
					onChange={(e) => filter(setStatus)(e.target.value)}
					aria-label='Kết quả'
				>
					<option value=''>Thành công và lỗi</option>
					<option value='ok'>Thành công</option>
					<option value='error'>Lỗi</option>
				</select>
			</div>
			<div className={base.tableWrap}>
				<table className={base.table}>
					<thead>
						<tr>
							<th className={base.th}>Thời điểm</th>
							<th className={base.th}>Tài liệu</th>
							<th className={base.th}>Người thao tác</th>
							<th className={base.th}>Tài khoản ký</th>
							<th className={base.th}>Kết quả</th>
						</tr>
					</thead>
					<tbody>
						{isLoading ? (
							<SkeletonTable
								rows={4}
								cols={COLS}
							/>
						) : !data?.items.length ? (
							<TableEmpty
								colSpan={COLS}
								title='Chưa có lần ký nào'
								desc='Mỗi lần ký số (kể cả lỗi) được ghi ở đây.'
							/>
						) : (
							data.items.map((l) => (
								<tr
									key={l.id}
									className={base.tr}
								>
									<td className={`${base.td} ${styles.nowrap}`}>{formatStamp(l.created_at)}</td>
									<td className={base.td}>
										<div>{DOC_TYPE_LABEL[l.doc_type] ?? l.doc_type}</div>
										<div className={`${tbl.cellSub} ${styles.mono}`}>{l.doc_ref ?? '—'}</div>
									</td>
									<td className={base.td}>{l.actor_name ?? l.actor_id ?? '—'}</td>
									<td className={base.td}>
										<div>{l.account_label ?? '(đã xóa)'}</div>
										{l.cert_serial && <div className={`${tbl.cellSub} ${styles.mono}`}>Serial {l.cert_serial}</div>}
									</td>
									<td className={base.td}>
										{l.status === 'ok' ? (
											<Badge
												tone='green'
												dot
											>
												Đã ký
											</Badge>
										) : (
											<Badge
												tone='red'
												dot
											>
												Lỗi{l.error_code ? ` ${l.error_code}` : ''}
											</Badge>
										)}
										<div
											className={tbl.cellSub}
											title={l.output_sha256 ? `SHA-256 file đã ký: ${l.output_sha256}` : undefined}
										>
											{l.status === 'error'
												? l.error_message
												: l.duration_ms !== null
													? `${(l.duration_ms / 1000).toFixed(1)} giây`
													: ''}
										</div>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
			{data && data.total > LIMIT && (
				<Pagination
					page={page}
					totalPages={Math.ceil(data.total / LIMIT)}
					total={data.total}
					rowsPerPage={LIMIT}
					onPageChange={setPage}
					itemLabel='lần ký'
					hideSizeSelect
				/>
			)}
		</>
	);
}
