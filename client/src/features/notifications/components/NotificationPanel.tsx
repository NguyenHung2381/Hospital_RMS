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
import type { Notif } from '../utils/notifUtils';

interface NotificationPanelProps {
	open: boolean;
	onToggle: () => void;
	onClose: () => void;
	notifications: Notif[];
	unreadCount: number;
	onMarkAll: () => void;
	onMarkOne: (id: string) => void;
	/** CSS module from the parent layout — provides all notif* class names. */
	s: Record<string, string>;
}

export function NotificationPanel({
	open,
	onToggle,
	onClose,
	notifications,
	unreadCount,
	onMarkAll,
	onMarkOne,
	s,
}: NotificationPanelProps) {
	const [tab, setTab] = useState<'all' | 'unread'>('all');
	const wrapRef = useRef<HTMLDivElement>(null);
	const navigate = useNavigate();

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [open, onClose]);

	const iconMap: Record<Notif['type'], { el: React.ReactNode; cls: string }> = {
		approval: { el: <ApproveSvg />, cls: s.iconApproval },
		topic: { el: <DocSvg />, cls: s.iconTopic },
		system: { el: <InfoSvg />, cls: s.iconSystem },
		warning: { el: <WarnSvg />, cls: s.iconWarning },
	};

	const displayed =
		tab === 'unread' ? notifications.filter((n) => !n.read) : notifications;

	const handleViewAll = () => {
		onClose();
		navigate('/user/notifications');
	};

	return (
		<div
			className={s.notifWrapper}
			ref={wrapRef}
		>
			<button
				className={`${s.topbarIconBtn} ${open ? s.active : ''}`}
				onClick={onToggle}
				aria-label='Thông báo'
				aria-expanded={open}
			>
				<BellSvg />
				{unreadCount > 0 && <span className={s.notifDot} />}
			</button>

			{open && (
				<>
					<div
						className={s.notifOverlay}
						onClick={onClose}
					/>
					<div
						className={s.notifPanel}
						role='dialog'
						aria-label='Thông báo'
					>
						{/* Header */}
						<div className={s.notifPanelHeader}>
							<span className={s.notifPanelTitle}>
								Thông báo
								{unreadCount > 0 && (
									<span
										style={{
											marginLeft: 8,
											background: 'var(--color-accent)',
											color: '#fff',
											fontSize: 11,
											fontWeight: 700,
											padding: '1px 7px',
											borderRadius: 999,
										}}
									>
										{unreadCount}
									</span>
								)}
							</span>
							<div className={s.notifPanelActions}>
								{unreadCount > 0 && (
									<button
										className={s.notifMarkAll}
										onClick={onMarkAll}
									>
										Đánh dấu đã đọc
									</button>
								)}
								<button
									className={s.notifClose}
									onClick={onClose}
									aria-label='Đóng'
								>
									<XSvg />
								</button>
							</div>
						</div>

						{/* Tabs */}
						<div className={s.notifTabs}>
							{(['all', 'unread'] as const).map((t) => (
								<div
									key={t}
									className={`${s.notifTab} ${tab === t ? s.notifTabActive : ''}`}
									onClick={() => setTab(t)}
								>
									{t === 'all' ? 'Tất cả' : 'Chưa đọc'}
									<span className={s.notifTabBadge}>
										{t === 'all' ? notifications.length : unreadCount}
									</span>
								</div>
							))}
						</div>

						{/* List */}
						<div className={s.notifList}>
							{displayed.length === 0 ? (
								<div
									style={{
										padding: '32px 24px',
										textAlign: 'center',
										color: 'var(--color-gray-400)',
										fontSize: 13,
									}}
								>
									Không có thông báo nào
								</div>
							) : (
								displayed.map((n) => {
									const cfg = iconMap[n.type];
									return (
										<div
											key={n.id}
											className={`${s.notifItem} ${!n.read ? s.unread : ''}`}
											onClick={() => onMarkOne(n.id)}
										>
											<div className={`${s.notifItemIcon} ${cfg.cls}`}>
												{cfg.el}
											</div>
											<div className={s.notifItemContent}>
												<div className={s.notifItemTitle}>{n.title}</div>
												<div className={s.notifItemDesc}>{n.desc}</div>
												<div className={s.notifItemTime}>{n.time}</div>
											</div>
										</div>
									);
								})
							)}
						</div>

						{/* Footer */}
						<div className={s.notifPanelFooter}>
							<button
								className={s.notifViewAll}
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
