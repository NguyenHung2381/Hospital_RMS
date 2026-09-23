import React, { useEffect, useState } from 'react';
import {
	ApproveSvg,
	BellSvg,
	CheckCircleSvg,
	DocSvg,
	FilterSvg,
	InfoSvg,
	WarnSvg,
} from '@/assets/icons';
import { EmptyState, Pagination } from '@/shared/components';
import { PAGE_SIZE_OPTIONS } from '@/shared/utils';
import UserLayout from '../../../layouts/UserLayout';
import { getStoredUser } from '../../../shared/utils/storage';
import type { StoredUser } from '../../../shared/utils/storage';
import {
	getNotifications,
	markAllNotificationsRead,
	markNotificationRead,
} from '../api/notificationApi';
import type { Notification } from '../api/notificationApi';
import { NOTIF_TYPES } from '../types/notification.type';
import type { NotifCategory } from '../types/notification.type';
import { NOTIF_TYPE_MAP, toNotif } from '../utils/notifUtils';
import styles from './UserNotifications.module.css';

const LIMIT = 15;

export default function UserNotifications() {
	const user = getStoredUser<StoredUser>();

	const [tab, setTab] = useState<'all' | 'unread'>('all');
	const [filterCategory, setFilterCategory] = useState<NotifCategory | ''>('');
	const [page, setPage] = useState(1);

	const [items, setItems] = useState<Notification[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);
	const [markingAll, setMarkingAll] = useState(false);

	useEffect(() => {
		let cancelled = false;
		queueMicrotask(async () => {
			if (cancelled) return;
			setLoading(true);
			try {
				const res = await getNotifications({
					page,
					limit: LIMIT,
					unread_only: tab === 'unread' ? true : undefined,
				});
				if (!cancelled) {
					setItems(res.data);
					setTotal(res.pagination.total);
				}
			} catch {
				// ignore
			} finally {
				if (!cancelled) setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [page, tab]);

	const handleMarkOne = async (id: string) => {
		const item = items.find((n) => n.id === id);
		if (!item || item.is_read) return;
		setItems((prev) =>
			prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
		);
		try {
			await markNotificationRead(id);
		} catch {
			setItems((prev) =>
				prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)),
			);
		}
	};

	const handleMarkAll = async () => {
		setMarkingAll(true);
		try {
			await markAllNotificationsRead();
			setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
		} catch {
			// ignore
		} finally {
			setMarkingAll(false);
		}
	};

	const displayed = filterCategory
		? items.filter((n) => NOTIF_TYPE_MAP[n.type] === filterCategory)
		: items;

	const totalPages = Math.ceil(total / LIMIT);
	const unreadCount = items.filter((n) => !n.is_read).length;

	const iconMap: Record<NotifCategory, { el: React.ReactNode; cls: string }> = {
		approval: { el: <ApproveSvg />, cls: styles.iconApproval },
		topic: { el: <DocSvg />, cls: styles.iconTopic },
		system: { el: <InfoSvg />, cls: styles.iconSystem },
		warning: { el: <WarnSvg />, cls: styles.iconWarning },
	};

	const categoryLabel: Record<NotifCategory, string> = {
		approval: 'Phê duyệt',
		topic: 'Đề tài',
		system: 'Hệ thống',
		warning: 'Cảnh báo',
	};

	const typeLabel = (t: string) =>
		NOTIF_TYPES.find((x) => x.value === t)?.label ?? t;

	return (
		<UserLayout
			pageTitle='Thông báo'
			pageSubtitle='Tất cả thông báo của bạn'
			userName={user?.full_name}
			userRole={user?.role}
		>
			<div className={styles.container}>
				{/* Toolbar */}
				<div className={styles.toolbar}>
					<div className={styles.tabs}>
						{(['all', 'unread'] as const).map((t) => (
							<button
								key={t}
								className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
								onClick={() => { setTab(t); setPage(1); }}
							>
								{t === 'all' ? 'Tất cả' : 'Chưa đọc'}
								{t === 'unread' && unreadCount > 0 && (
									<span className={styles.tabBadge}>{unreadCount}</span>
								)}
							</button>
						))}
					</div>

					<div className={styles.toolbarRight}>
						<div className={styles.filterWrap}>
							<FilterSvg style={{ width: 13, height: 13 }} />
							<select
								className={styles.filterSelect}
								value={filterCategory}
								onChange={(e) => {
									setFilterCategory(e.target.value as NotifCategory | '');
									setPage(1);
								}}
							>
								<option value=''>Tất cả danh mục</option>
								{(Object.keys(categoryLabel) as NotifCategory[]).map((c) => (
									<option
										key={c}
										value={c}
									>
										{categoryLabel[c]}
									</option>
								))}
							</select>
						</div>

						{unreadCount > 0 && (
							<button
								className={styles.btnMarkAll}
								onClick={handleMarkAll}
								disabled={markingAll}
							>
								{markingAll ? (
									<span className={styles.spinner} />
								) : (
									<CheckCircleSvg style={{ width: 13, height: 13 }} />
								)}
								Đánh dấu tất cả đã đọc
							</button>
						)}
					</div>
				</div>

				{/* List */}
				<div className={styles.listCard}>
					{loading ? (
						<div className={styles.loadingWrap}>
							<span className={styles.spinnerDark} />
						</div>
					) : displayed.length === 0 ? (
						<EmptyState
							icon={<BellSvg />}
							title={
								tab === 'unread'
									? 'Không có thông báo chưa đọc'
									: 'Chưa có thông báo nào'
							}
							desc='Thông báo mới sẽ hiển thị tại đây'
						/>
					) : (
						<ul className={styles.list}>
							{displayed.map((n) => {
								const notif = toNotif(n);
								const cfg = iconMap[notif.type];
								return (
									<li
										key={n.id}
										className={`${styles.item} ${!n.is_read ? styles.unread : ''}`}
										onClick={() => handleMarkOne(n.id)}
									>
										{!n.is_read && <span className={styles.unreadDot} />}
										<div className={`${styles.itemIcon} ${cfg.cls}`}>
											{cfg.el}
										</div>
										<div className={styles.itemBody}>
											<div className={styles.itemTop}>
												<span className={styles.itemTitle}>{n.title}</span>
												<span
													className={`${styles.typeBadge} ${styles[`type_${n.type}`] ?? styles[`type_${notif.type}`]}`}
												>
													{typeLabel(n.type)}
												</span>
											</div>
											{n.message && (
												<div className={styles.itemMsg}>{n.message}</div>
											)}
											<div className={styles.itemMeta}>
												<span className={styles.itemTime}>{notif.time}</span>
												{n.ref_type && n.ref_id && (
													<span className={styles.itemRef}>
														{n.ref_type}: {n.ref_id}
													</span>
												)}
											</div>
										</div>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				{totalPages > 1 && (
					<Pagination
						page={page}
						totalPages={totalPages}
						total={total}
						rowsPerPage={LIMIT}
						pageSizeOptions={PAGE_SIZE_OPTIONS}
						onPageChange={setPage}
						onRowsPerPageChange={() => {}}
						itemLabel='thông báo'
						hideSizeSelect
					/>
				)}
			</div>
		</UserLayout>
	);
}
