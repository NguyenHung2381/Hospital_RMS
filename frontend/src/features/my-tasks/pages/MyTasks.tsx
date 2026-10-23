import { formatDateVN } from '../../../shared/utils/formatDate';
import { useEffect, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApproveSvg, ClipboardCheckSvg } from '@/assets/icons';
import { Badge, Card, EmptyState, InlineLoading } from '@/shared/components';
import AdminLayout from '../../../layouts/AdminLayout';
import UserLayout from '../../../layouts/UserLayout';
import { canAccessAdminPanel } from '../../../shared/utils/permissions';
import { getStoredUser } from '../../../shared/utils/storage';
import { STATUS_CFG } from '../../topics/utils/topicHelpers';
import { getMyTasks, type MyTasks as MyTasksData } from '../api/myTasksApi';

const ROW_STYLE: CSSProperties = {
	display: 'flex',
	justifyContent: 'space-between',
	alignItems: 'center',
	padding: '10px 12px',
	border: '1px solid var(--color-gray-100)',
	borderRadius: 10,
	gap: 12,
};

export default function MyTasks() {
	const navigate = useNavigate();
	const [data, setData] = useState<MyTasksData | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		getMyTasks()
			.then(setData)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải danh sách việc cần làm'));
	}, []);

	const isAdmin = canAccessAdminPanel(getStoredUser());
	// Trang dùng chung cho 2 cổng: vào từ /admin/... thì giữ layout admin,
	// tránh bị "nhảy" sang giao diện người dùng khi bấm từ sidebar admin.
	const Layout = useLocation().pathname.startsWith('/admin') ? AdminLayout : UserLayout;

	// Bấm vào 1 dòng là mở thẳng nơi xử lý việc đó (trang Phê duyệt chọn sẵn
	// đúng đề tài) — "Việc của tôi" là hộp thư, không lặp lại chức năng duyệt.
	const rowLink = (to?: string) =>
		to
			? {
					role: 'button',
					tabIndex: 0,
					onClick: () => navigate(to),
					onKeyDown: (e: KeyboardEvent) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							navigate(to);
						}
					},
				}
			: {};

	return (
		<Layout
			pageTitle='Việc của tôi'
			pageSubtitle='Đề tài đang chờ bạn xử lý'
		>
			{error && (
				<EmptyState
					title='Không thể tải dữ liệu'
					desc={error}
				/>
			)}

			{!data && !error && <InlineLoading />}

			{data && data.total === 0 && (
				<EmptyState
					icon={<ApproveSvg />}
					title='Không có việc nào cần xử lý'
					desc='Mọi đề tài đang chờ bạn đều đã được xử lý xong.'
				/>
			)}

			{data && data.approvals.length > 0 && (
				<div style={{ marginBottom: 20 }}>
					<Card>
						<Card.Header
							icon={<ApproveSvg />}
							title='Đề tài chờ bạn phê duyệt'
							sub={`${data.approvals.length} đề tài`}
							actions={
								isAdmin && (
									<button
										type='button'
										onClick={() => navigate('/admin/approvals')}
										style={{
											background: 'transparent',
											border: '1px solid var(--color-gray-200)',
											borderRadius: 8,
											padding: '6px 12px',
											fontSize: 13,
											cursor: 'pointer',
										}}
									>
										Đi tới trang Phê duyệt
									</button>
								)
							}
						/>
						<Card.Body>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
								{data.approvals.map((t) => {
									const cfg = STATUS_CFG[t.status as keyof typeof STATUS_CFG];
									return (
										<div
											key={t.id}
											{...rowLink(
												isAdmin
													? `/admin/approvals?topic=${encodeURIComponent(t.id)}`
													: undefined,
											)}
											style={{ ...ROW_STYLE, cursor: isAdmin ? 'pointer' : undefined }}
										>
											<div>
												<div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div>
												<div style={{ fontSize: 12, color: 'var(--color-gray-500)', marginTop: 2 }}>
													{t.department_name ?? '—'} · {t.round_name ?? '—'}
												</div>
											</div>
											{cfg && (
												<Badge
													tone={cfg.tone}
													dot
												>
													{cfg.label}
												</Badge>
											)}
										</div>
									);
								})}
							</div>
						</Card.Body>
					</Card>
				</div>
			)}

			{data && data.progress_reviews.length > 0 && (
				<Card>
					<Card.Header
						icon={<ClipboardCheckSvg />}
						title='Đề tài chờ bạn chấm tiến độ'
						sub={`${data.progress_reviews.length} đề tài`}
						actions={
							<button
								type='button'
								onClick={() => navigate('/user/council-progress')}
								style={{
									background: 'transparent',
									border: '1px solid var(--color-gray-200)',
									borderRadius: 8,
									padding: '6px 12px',
									fontSize: 13,
									cursor: 'pointer',
								}}
							>
								Đi tới trang Đánh giá tiến độ
							</button>
						}
					/>
					<Card.Body>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
							{data.progress_reviews.map((t) => (
								<div
									key={t.id}
									{...rowLink('/user/council-progress')}
									style={{ ...ROW_STYLE, cursor: 'pointer' }}
								>
									<div>
										<div style={{ fontWeight: 600, fontSize: 13 }}>{t.title}</div>
										<div style={{ fontSize: 12, color: 'var(--color-gray-500)', marginTop: 2 }}>
											{t.council_name} · {t.department_name ?? '—'}
											{t.defense_date ? ` · Bảo vệ ${formatDateVN(t.defense_date)}` : ''}
										</div>
									</div>
									<Badge tone='blue'>{t.my_role}</Badge>
								</div>
							))}
						</div>
					</Card.Body>
				</Card>
			)}
		</Layout>
	);
}
