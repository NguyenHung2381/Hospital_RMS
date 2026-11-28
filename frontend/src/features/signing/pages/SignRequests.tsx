import { KeySvg, PlusSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import UserLayout from '@/layouts/UserLayout';
import { useRealtimeUpdate } from '@/layouts/hooks/useRealtime';
import { Badge, Button, SearchInput, SelectCheckbox, SelectionBar, TableEmpty } from '@/shared/components';
import { SkeletonTable } from '@/shared/components/Loading';
import base from '@/shared/components/Table/CrudPage.module.css';
import tbl from '@/shared/components/Table/Table.module.css';
import { usePermission } from '@/shared/hooks/usePermission';
import { showToast } from '@/shared/utils/feedback';
import { formatDateVN } from '@/shared/utils/formatDate';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { REQUEST_STATUS, signRequestApi, type SignRequestBox, type SignRequestSummary } from '../api/signRequestApi';
import { useSigningStatus } from '../hooks/useSigningStatus';
import { formatStamp } from '../utils/formatStamp';
import { signRequestBase } from '../utils/signRequestPaths';
import styles from './SignRequests.module.css';

const TABS: { key: SignRequestBox; label: string; manage?: boolean }[] = [
	{ key: 'todo', label: 'Cần tôi ký' },
	{ key: 'sent', label: 'Tôi đã gửi' },
	{ key: 'involved', label: 'Có tham gia' },
	{ key: 'all', label: 'Tất cả hồ sơ', manage: true },
];


/** Hạn ký: quá hạn đỏ, còn ≤ 2 ngày vàng */
const dueTone = (r: SignRequestSummary) => {
	if (!r.due_date || r.status !== 'in_progress') return null;
	const days = (new Date(`${String(r.due_date).slice(0, 10)}T23:59:59`).getTime() - Date.now()) / 86400000;
	return days < 0 ? styles.overdue : days <= 2 ? styles.dueSoon : null;
};

export default function SignRequests() {
	const { pathname } = useLocation();
	const isAdmin = pathname.startsWith('/admin');
	const Layout = isAdmin ? AdminLayout : UserLayout;
	const baseUrl = signRequestBase(pathname);
	const navigate = useNavigate();
	// Quản trị tắt Trình ký văn bản ⇒ layout hiện "đã tắt", không mời tạo hồ sơ mới
	const featureOn = useSigningStatus().data?.config?.features.sign_requests !== false;
	const qc = useQueryClient();
	const canManage = usePermission().has('signing:manage');
	const [params, setParams] = useSearchParams();
	const tab = (TABS.find((t) => t.key === params.get('tab') && (!t.manage || canManage))?.key ?? 'todo') as SignRequestBox;
	const [search, setSearch] = useState('');
	const [selected, setSelected] = useState<Set<number>>(new Set());
	const [signing, setSigning] = useState(false);

	const { data, isLoading } = useQuery({
		queryKey: ['sign-requests', tab, search],
		queryFn: () => signRequestApi.list({ box: tab, search: search.trim() || undefined, limit: 100 }),
	});
	const { data: todo } = useQuery({ queryKey: ['sign-requests', 'todo-count'], queryFn: signRequestApi.todoCount });
	const refresh = () => void qc.invalidateQueries({ queryKey: ['sign-requests'] });
	useRealtimeUpdate('sign_request', refresh);

	const items = data?.items ?? [];
	const batchable = items.filter((r) => r.ready_for_batch);
	const toggle = (id: number) =>
		setSelected((s) => {
			const n = new Set(s);
			if (n.has(id)) n.delete(id);
			else n.add(id);
			return n;
		});
	const allOn = batchable.length > 0 && batchable.every((r) => selected.has(r.id));

	const batchSign = async () => {
		setSigning(true);
		try {
			const r = await signRequestApi.batchSign([...selected]);
			if (r.failed) {
				const first = r.results.find((x) => !x.ok);
				showToast('error', `Đã ký ${r.signed} hồ sơ, ${r.failed} hồ sơ lỗi: ${first?.message ?? ''}`);
			} else {
				showToast('success', `Đã ký số ${r.signed} hồ sơ`);
			}
			setSelected(new Set());
			refresh();
		} catch (e) {
			showToast('error', e instanceof Error ? e.message : 'Ký hàng loạt không thành công');
		} finally {
			setSigning(false);
		}
	};

	const COLS = tab === 'todo' ? 5 : 4;
	return (
		<Layout
			pageTitle='Trình ký văn bản'
			pageSubtitle='Gửi văn bản cho nhiều người ký số theo thứ tự, ký song song, ký hàng loạt'
			headerActions={
				featureOn ? (
					<Button
						variant='primary'
						icon={<PlusSvg />}
						onClick={() => navigate(`${baseUrl}/tao-moi`)}
					>
						Tạo hồ sơ trình ký
					</Button>
				) : undefined
			}
		>
			<div
				className={base.tabs}
				role='tablist'
			>
				{TABS.filter((t) => !t.manage || canManage).map((t) => (
					<button
						key={t.key}
						role='tab'
						aria-selected={tab === t.key}
						className={`${base.tabBtn} ${tab === t.key ? base.tabBtnActive : ''}`}
						onClick={() => {
							setSelected(new Set());
							setParams(t.key === 'todo' ? {} : { tab: t.key }, { replace: true });
						}}
					>
						{t.label}
						{t.key === 'todo' && !!todo?.count && <span className={styles.badge}>{todo.count}</span>}
					</button>
				))}
			</div>

			<div className={base.tableCard}>
				<div className={base.tableHeader}>
					<div className={base.tableHeaderLeft}>
						<span className={base.tableTitle}>{TABS.find((t) => t.key === tab)?.label}</span>
						<span className={base.tableCount}>{data?.total ?? 0} hồ sơ</span>
					</div>
					<div className={base.tableControls}>
						<SearchInput
							value={search}
							onChange={setSearch}
							placeholder='Tìm theo tiêu đề…'
						/>
					</div>
				</div>

				{tab === 'todo' && (
					<SelectionBar
						count={selected.size}
						onClear={() => setSelected(new Set())}
						itemLabel='hồ sơ'
						actions={
							<Button
								variant='primary'
								size='sm'
								icon={<KeySvg />}
								loading={signing}
								onClick={() => void batchSign()}
							>
								Ký số {selected.size} hồ sơ
							</Button>
						}
					/>
				)}

				<div className={base.tableWrap}>
					<table className={base.table}>
						<thead>
							<tr>
								{tab === 'todo' && (
									<th className={`${base.th} ${styles.checkCol}`}>
										<SelectCheckbox
											checked={allOn}
											indeterminate={selected.size > 0}
											onChange={() => setSelected(allOn ? new Set() : new Set(batchable.map((r) => r.id)))}
											title='Chọn mọi hồ sơ ký hàng loạt được'
										/>
									</th>
								)}
								<th className={base.th}>Hồ sơ</th>
								<th className={base.th}>Tiến độ</th>
								<th className={base.th}>Trạng thái</th>
								<th className={base.th}>Hạn ký</th>
							</tr>
						</thead>
						<tbody>
							{isLoading ? (
								<SkeletonTable
									rows={3}
									cols={COLS}
								/>
							) : !items.length ? (
								<TableEmpty
									colSpan={COLS}
									title={tab === 'todo' ? 'Không có văn bản nào chờ bạn ký' : 'Chưa có hồ sơ trình ký'}
									desc={
										tab === 'sent'
											? 'Bấm "Tạo hồ sơ trình ký" để gửi văn bản cho người khác ký số.'
											: undefined
									}
								/>
							) : (
								items.map((r) => {
									const st = REQUEST_STATUS[r.status];
									const pct = r.signer_count ? Math.round((r.signed_count / r.signer_count) * 100) : 0;
									return (
										<tr
											key={r.id}
											className={`${base.tr} ${styles.row}`}
											onClick={() => navigate(`${baseUrl}/${r.id}`)}
										>
											{tab === 'todo' && (
												<td
													className={`${base.td} ${styles.checkCol}`}
													onClick={(e) => e.stopPropagation()}
													title={
														r.ready_for_batch
															? undefined
															: 'Có văn bản chưa đặt vị trí ký cho bạn — mở hồ sơ để đặt rồi ký'
													}
												>
													<SelectCheckbox
														checked={selected.has(r.id)}
														onChange={() => r.ready_for_batch && toggle(r.id)}
														title={r.ready_for_batch ? `Chọn "${r.title}"` : 'Cần mở hồ sơ để đặt vị trí ký'}
													/>
												</td>
											)}
											<td className={base.td}>
												<div className={base.itemName}>{r.title}</div>
												<div className={tbl.cellSub}>
													{r.creator_name} · {formatStamp(r.created_at)} · {r.doc_count} văn bản
												</div>
											</td>
											<td className={base.td}>
												<div className={styles.progress}>
													<span
														className={styles.bar}
														aria-hidden
													>
														<span style={{ width: `${pct}%` }} />
													</span>
													<span className={styles.progressText}>
														{r.signed_count}/{r.signer_count} đã ký
													</span>
												</div>
												{r.status === 'in_progress' && (
													<div className={tbl.cellSub}>
														Bước {r.current_step}/{r.total_steps}
													</div>
												)}
											</td>
											<td className={base.td}>
												<Badge
													tone={r.my_status === 'pending' && r.status === 'in_progress' ? 'pink' : st.tone}
													dot
												>
													{r.my_status === 'pending' && r.status === 'in_progress' ? 'Chờ bạn ký' : st.label}
												</Badge>
											</td>
											<td className={`${base.td} ${styles.nowrap} ${dueTone(r) ?? ''}`}>
												{r.due_date ? formatDateVN(r.due_date) : '—'}
											</td>
										</tr>
									);
								})
							)}
						</tbody>
					</table>
				</div>
			</div>
			{tab === 'todo' && items.length > 0 && batchable.length < items.length && (
				<p className={styles.note}>
					Ký hàng loạt chỉ áp dụng hồ sơ đã được người gửi đặt sẵn vị trí chữ ký cho bạn. Hồ sơ còn lại: mở ra,
					đặt khung chữ ký rồi ký.
				</p>
			)}
		</Layout>
	);
}
