import { XSvg } from '@/assets/icons';
import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { DIALOG_LAYER_SELECTOR, useFocusTrap } from '../../hooks/useFocusTrap';
import { cx } from '../../utils/cx';
import modalStyles from '../Modal/Modal.module.css';
import styles from './Drawer.module.css';

type DrawerSize = 'sm' | 'md' | 'lg';

/** Lớp hộp thoại: Modal / Drawer (aria-modal) và modal tự viết `composes: modalBackdrop`. */
const DRAWER_LAYER_SELECTOR = `${DIALOG_LAYER_SELECTOR}, .${modalStyles.modalBackdrop}`;

interface DrawerProps {
	open: boolean;
	onClose: () => void;
	title?: React.ReactNode;
	/** Dòng phụ dưới tiêu đề. */
	subtitle?: React.ReactNode;
	/** Nội dung thêm ngay dưới tiêu đề (vd nhóm badge trạng thái). */
	headerExtra?: React.ReactNode;
	children: React.ReactNode;
	/** Thanh thao tác dính đáy panel. */
	footer?: React.ReactNode;
	/** sm 420px · md 560px · lg 760px — điện thoại luôn toàn màn hình. */
	size?: DrawerSize;
	closeOnBackdrop?: boolean;
	/** Nhãn cho trình đọc màn hình khi tiêu đề không phải chuỗi. */
	ariaLabel?: string;
	className?: string;
	bodyClassName?: string;
}

/**
 * Panel trượt từ cạnh phải — xem chi tiết 1 bản ghi mà không rời trang danh sách.
 * Render qua portal ra document.body như <Modal>; nằm DƯỚI modal (z-index 900 < 1000)
 * để hộp thoại mở từ trong drawer (Sửa, Xóa…) luôn nổi lên trên.
 * Đóng: nút X, Esc (khi drawer là hộp thoại trên cùng), bấm nền.
 */
export function Drawer({
	open,
	onClose,
	title,
	subtitle,
	headerExtra,
	children,
	footer,
	size = 'md',
	closeOnBackdrop = true,
	ariaLabel,
	className,
	bodyClassName,
}: DrawerProps) {
	const panelRef = useRef<HTMLDivElement>(null);
	// Đưa focus vào panel khi mở, giữ Tab trong panel, Esc đóng (chỉ khi drawer là lớp
	// trên cùng — modal mở từ trong drawer tự xử lý phím của nó), trả focus khi đóng.
	useFocusTrap(panelRef, { active: open, onEscape: onClose, layerSelector: DRAWER_LAYER_SELECTOR });

	if (!open) return null;

	return createPortal(
		<div
			className={styles.backdrop}
			onClick={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}
		>
			<div
				ref={panelRef}
				className={cx(styles.panel, styles[size], className)}
				role='dialog'
				aria-modal='true'
				aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
				tabIndex={-1}
			>
				<div className={styles.header}>
					<div className={styles.headText}>
						{title && <div className={styles.title}>{title}</div>}
						{subtitle && <div className={styles.subtitle}>{subtitle}</div>}
						{headerExtra && <div className={styles.extra}>{headerExtra}</div>}
					</div>
					<button
						type='button'
						className={styles.close}
						onClick={onClose}
						aria-label='Đóng'
						title='Đóng (Esc)'
					>
						<XSvg />
					</button>
				</div>
				<div className={cx(styles.body, bodyClassName)}>{children}</div>
				{footer && <div className={styles.footer}>{footer}</div>}
			</div>
		</div>,
		document.body,
	);
}

/** Một nhóm thông tin trong drawer: tiêu đề nhỏ + nội dung. */
export function DrawerSection({
	title,
	icon,
	actions,
	children,
}: {
	title: React.ReactNode;
	icon?: React.ReactNode;
	actions?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className={styles.section}>
			<div className={styles.sectionHead}>
				{icon && <span className={styles.sectionIcon}>{icon}</span>}
				<span className={styles.sectionTitle}>{title}</span>
				{actions && <span className={styles.sectionActions}>{actions}</span>}
			</div>
			{children}
		</section>
	);
}

/** Lưới nhãn – giá trị; bỏ qua dòng không có giá trị (null / '' / false). */
export function DrawerFields({ items }: { items: [React.ReactNode, React.ReactNode][] }) {
	const rows = items.filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false);
	if (!rows.length) return <div className={styles.empty}>Chưa có thông tin</div>;
	return (
		<dl className={styles.fields}>
			{rows.map(([label, value], i) => (
				<div
					key={i}
					className={styles.field}
				>
					<dt>{label}</dt>
					<dd>{value}</dd>
				</div>
			))}
		</dl>
	);
}
