import React, { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
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
	const panelRef = useRef<HTMLDivElement>(null);
	const bellRef = useRef<HTMLButtonElement>(null);
	const tabRefs = useRef<Record<'all' | 'unread', HTMLButtonElement | null>>({ all: null, unread: null });
	const navigate = useNavigate();
	const uid = useId();
	const panelId = `${uid}-panel`;
	const tabId = (t: 'all' | 'unread') => `${uid}-tab-${t}`;
	const listId = `${uid}-list`;

	useEffect(() => {
		if (!open) return;
		setTop(wrapRef.current?.getBoundingClientRect().bottom);
		const handler = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		// Esc: đóng và trả focus về nút chuông (người dùng bàn phím không bị lạc)
		const onKey = (e: globalThis.KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			onClose();
			bellRef.current?.focus();
		};
		document.addEventListener('mousedown', handler);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', handler);
			document.removeEventListener('keydown', onKey);
		};
	}, [open, onClose]);

	// Mở bảng: đưa focus vào khung để trình đọc màn hình đọc tên và phím Tab đi tiếp trong bảng
	useEffect(() => {
		if (open) panelRef.current?.focus({ preventScroll: true });
	}, [open]);

	// Mũi tên trái/phải, Home/End chuyển tab (mẫu WAI-ARIA tabs, kích hoạt ngay vì dữ liệu có sẵn)
	const onTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
		const order = ['all', 'unread'] as const;
		const idx = order.indexOf(tab);
		let next: number;
		if (e.key === 'ArrowRight') next = (idx + 1) % order.length;
		else if (e.key === 'ArrowLeft') next = (idx - 1 + order.length) % order.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = order.length - 1;
		else return;
		e.preventDefault();
		setTab(order[next]);
		tabRefs.current[order[next]]?.focus();
	};

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
				ref={bellRef}
				className={cx(buttonClassName, open && activeClassName)}
				onClick={onToggle}
				aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'}
				aria-haspopup='dialog'
				aria-expanded={open}
				aria-controls={open ? panelId : undefined}
			>
				<BellSvg />
				{unreadCount > 0 && <span className={styles.dot} aria-hidden='true' />}
			</button>

			{open && (
				<>
					<div
						className={styles.overlay}
						onClick={onClose}
						aria-hidden='true'
					/>
					<div
						ref={panelRef}
						id={panelId}
						tabIndex={-1}
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
							aria-label='Lọc thông báo'
						>
							{(['all', 'unread'] as const).map((t) => (
								<button
									type='button'
									role='tab'
									id={tabId(t)}
									ref={(el) => {
										tabRefs.current[t] = el;
									}}
									aria-selected={tab === t}
									aria-controls={tab === t ? listId : undefined}
									tabIndex={tab === t ? 0 : -1}
									key={t}
									className={cx(styles.tab, tab === t && styles.tabActive)}
									onClick={() => setTab(t)}
									onKeyDown={onTabKeyDown}
								>
									{t === 'all' ? 'Tất cả' : 'Chưa đọc'}
									<span className={styles.tabBadge}>
										{t === 'all' ? notifications.length : unreadCount}
									</span>
								</button>
							))}
						</div>

						<div
							className={styles.list}
							id={listId}
							role='tabpanel'
							aria-labelledby={tabId(tab)}
						>
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
