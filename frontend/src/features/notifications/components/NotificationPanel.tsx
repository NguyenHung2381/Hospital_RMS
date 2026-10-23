import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	ApproveSvg,
	BellSvg,
	DocSvg,
	InfoSvg,
	WarnSvg,
	XSvg,
} from '@/assets/icons';
import { cx } from '@/shared/utils/cx';
import type { Notif } from '../utils/notifUtils';
import styles from './NotificationPanel.module.css';

interface NotificationPanelProps {
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	notifications: Notif[];
	unreadCount: number;
	onMarkAll: () => void;
	onMarkOne: (id: string) => void;
	/** Style nút chuông theo topbar của layout đang render panel. */
	buttonClassName: string;
	/** Thêm vào nút chuông khi panel đang mở. */
	activeClassName?: string;
	/** Route for "Xem tất cả" — keep it inside whichever layout is currently rendering this panel. */
	viewAllPath?: string;
}

const ICONS: Record<Notif['type'], { el: React.ReactNode; cls: string }> = {
	approval: { el: <ApproveSvg />, cls: styles.iconApproval },
	topic: { el: <DocSvg />, cls: styles.iconTopic },
	system: { el: <InfoSvg />, cls: styles.iconSystem },
	warning: { el: <WarnSvg />, cls: styles.iconWarning },
};

export function NotificationPanel({
	open,
	onToggle,
	onClose,
	notifications,
	unreadCount,
	onMarkAll,
	onMarkOne,
	buttonClassName,
	activeClassName,
	viewAllPath = '/user/notifications',
}: NotificationPanelProps) {
	const [tab, setTab] = useState<'all' | 'unread'>('all');
	// Mép dưới nút chuông — panel neo theo khung nhìn trên điện thoại (xem CSS).
	const [top, setTop] = useState<number>();
	const wrapRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();

	useEffect(() => {
		if (!open) return;
		setTop(wrapRef.current?.getBoundingClientRect().bottom);
		const handler = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
		document.addEventListener('mousedown', handler);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', handler);
			document.removeEventListener('keydown', onKey);
		};
	}, [open, onClose]);

	const displayed =
		tab === 'unread' ? notifications.filter((n) => !n.read) : notifications;

	const handleViewAll = () => {
		onClose();
		navigate(viewAllPath);
	};

	const handleItemClick = (n: Notif) => {
		if (!n.read) onMarkOne(n.id);
		onClose();
		navigate(viewAllPath);
	};

	return (
		<div
			className={styles.wrapper}
			ref={wrapRef}
		>
			<button
				type='button'
				className={cx(buttonClassName, open && activeClassName)}
				onClick={onToggle}
				aria-label='Thông báo'
				aria-expanded={open}
			>
				<BellSvg />
				{unreadCount > 0 && <span className={styles.dot} />}
			</button>

			{open && (
				<>
					<div
						className={styles.overlay}
						onClick={onClose}
					/>
					<div
						className={styles.panel}
						role='dialog'
						aria-label='Thông báo'
						style={top ? ({ '--notif-top': `${top + 8}px` } as React.CSSProperties) : undefined}
					>
						<div className={styles.header}>
							<span className={styles.title}>
								Thông báo
								{unreadCount > 0 && <span className={styles.count}>{unreadCount}</span>}
							</span>
							<div className={styles.actions}>
								{unreadCount > 0 && (
									<button
										type='button'
										className={styles.markAll}
										onClick={onMarkAll}
									>
										Đánh dấu đã đọc
									</button>
								)}
								<button
									type='button'
									className={styles.close}
									onClick={onClose}
									aria-label='Đóng'
								>
									<XSvg />
								</button>
							</div>
						</div>

						<div
							className={styles.tabs}
							role='tablist'
						>
							{(['all', 'unread'] as const).map((t) => (
								<button
									type='button'
									role='tab'
									aria-selected={tab === t}
									key={t}
									className={cx(styles.tab, tab === t && styles.tabActive)}
									onClick={() => setTab(t)}
								>
									{t === 'all' ? 'Tất cả' : 'Chưa đọc'}
									<span className={styles.tabBadge}>
										{t === 'all' ? notifications.length : unreadCount}
									</span>
								</button>
							))}
						</div>

						<div className={styles.list}>
							{displayed.length === 0 ? (
								<div className={styles.empty}>Không có thông báo nào</div>
							) : (
								displayed.map((n) => {
									const cfg = ICONS[n.type];
									return (
										<button
											type='button'
											key={n.id}
											className={cx(styles.item, !n.read && styles.unread)}
											onClick={() => handleItemClick(n)}
										>
											<span className={cx(styles.itemIcon, cfg.cls)}>{cfg.el}</span>
											<span className={styles.itemContent}>
												<span className={styles.itemTitle}>{n.title}</span>
												<span className={styles.itemDesc}>{n.desc}</span>
												<span className={styles.itemTime}>{n.time}</span>
											</span>
										</button>
									);
								})
							)}
						</div>

						<div className={styles.footer}>
							<button
								type='button'
								className={styles.viewAll}
								onClick={handleViewAll}
							>
								Xem tất cả thông báo →
							</button>
						</div>
					</div>
				</>
			)}
		</div>
	);
}
