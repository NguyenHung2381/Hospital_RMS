import {
	Children,
	cloneElement,
	Fragment,
	isValidElement,
	useState,
	type ReactElement,
	type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Dropdown, Tooltip, type MenuProps } from 'antd';
import { EditSvg, MoreVSvg, SearchSvg, TrashSvg, XSvg } from '@/assets/icons';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { maxWidth } from '@/shared/utils/breakpoints';
import { cx } from '@/shared/utils/cx';
import { BulkButton, BulkDeleteModal, type RowSelectionLike } from './RowSelect';
import styles from './TableToolbar.module.css';

/** Ô tìm kiếm có nút xóa nhanh, đặt trong `tableControls`. */
export function SearchInput({
	value,
	onChange,
	placeholder = 'Tìm kiếm...',
	'aria-label': ariaLabel,
}: {
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	/** Tên truy cập của ô; bỏ trống thì lấy theo placeholder. */
	'aria-label'?: string;
}) {
	return (
		<div className={styles.searchBox}>
			<SearchSvg className={styles.searchIcon} />
			<input
				className={styles.searchInput}
				aria-label={ariaLabel ?? placeholder.replace(/[….]+$/, '')}
				placeholder={placeholder}
				value={value}
				onChange={(e) => onChange(e.target.value)}
			/>
			{value && (
				<button
					type='button'
					className={styles.searchClear}
					aria-label='Xóa tìm kiếm'
					onClick={() => onChange('')}
				>
					<XSvg />
				</button>
			)}
		</div>
	);
}

/**
 * Nhãn đếm cạnh tiêu đề bảng. Khi đang chọn dòng thì đổi thành
 * "Đã chọn N · Xóa đã chọn · Bỏ chọn" kèm hộp thoại xác nhận xóa hàng loạt.
 */
export function SelectionCount({
	rowSel,
	itemLabel,
	loading,
	onBulkDelete,
	extraActions,
	children,
}: {
	rowSel: RowSelectionLike;
	itemLabel: string;
	loading?: boolean;
	/** Bỏ trống thì không có nút "Xóa đã chọn". */
	onBulkDelete?: (ids: string[]) => Promise<void> | void;
	/** Nút hàng loạt khác (vd "Sửa đồng loạt") đặt trước nút xóa. */
	extraActions?: ReactNode;
	/** Nội dung khi không chọn dòng nào, vd "12 giảng viên". */
	children: ReactNode;
}) {
	const [confirmOpen, setConfirmOpen] = useState(false);
	if (rowSel.selectedCount === 0) return <span className={styles.count}>{children}</span>;
	return (
		<span className={styles.count}>
			Đã chọn {rowSel.selectedCount}
			{extraActions}
			{onBulkDelete && (
				<>
					<BulkButton
						danger
						onClick={() => setConfirmOpen(true)}
					>
						<TrashSvg /> Xóa đã chọn
					</BulkButton>
					<BulkDeleteModal
						open={confirmOpen}
						count={rowSel.selectedCount}
						itemLabel={itemLabel}
						loading={loading}
						onClose={() => setConfirmOpen(false)}
						onConfirm={async () => {
							await onBulkDelete([...rowSel.selectedIds]);
							rowSel.clearSelection();
							setConfirmOpen(false);
						}}
					/>
				</>
			)}
			<button
				type='button'
				className={styles.clearBtn}
				onClick={rowSel.clearSelection}
			>
				Bỏ chọn
			</button>
		</span>
	);
}

export interface RowActionProps {
	/** Nhãn ngắn, BẮT BUỘC (1–3 từ: "Sửa", "Đặt lại mật khẩu"). Hiện thành tooltip khi
	 *  rê chuột / focus bàn phím, thành chữ cạnh icon trên thẻ điện thoại, và là tên
	 *  mục khi nút bị gom vào menu "…". */
	title: string;
	/** Tên đầy đủ cho trình đọc màn hình (vd "Xóa tài khoản Nguyễn Văn A"); mặc định = title. */
	'aria-label'?: string;
	onClick?: () => void;
	/** Đường dẫn nội bộ → render <Link> thay vì <button>. */
	to?: string;
	danger?: boolean;
	/** Màu nhấn cho thao tác mang nghĩa (Duyệt = success, cảnh báo = warn). */
	tone?: 'success' | 'warn';
	disabled?: boolean;
	/** Icon (svg). */
	children: ReactNode;
}

/** Dưới mốc này bảng chuyển thành thẻ (global.css `table[data-cards]`) → nhãn hiện thành chữ. */
const CARD_MODE = maxWidth('sm');

/**
 * Nút icon trong cột "Thao tác". Luôn có nhãn: tooltip (rê chuột + focus bàn
 * phím, không dùng `title` gốc vì hiện chậm và không hiện khi chạm/Tab), chữ
 * hiện rõ trên thẻ điện thoại, `aria-label` cho trình đọc màn hình.
 * `disabled` dùng aria-disabled để nút vẫn focus/rê được → vẫn đọc được nhãn.
 */
export function RowAction({
	title,
	'aria-label': ariaLabel,
	onClick,
	to,
	danger,
	tone,
	disabled,
	children,
}: RowActionProps) {
	const cardMode = useMediaQuery(CARD_MODE);
	const className = cx(
		styles.action,
		danger && styles.actionDanger,
		tone === 'success' && styles.toneSuccess,
		tone === 'warn' && styles.toneWarn,
	);
	const content = (
		<>
			<span
				className={styles.actionIcon}
				aria-hidden='true'
			>
				{children}
			</span>
			{/* aria-hidden: tên truy cập đã nằm ở aria-label của nút, tránh đọc lặp */}
			<span
				className={styles.actionLabel}
				aria-hidden='true'
			>
				{title}
			</span>
		</>
	);
	const el =
		to && !disabled ? (
			<Link
				to={to}
				className={className}
				aria-label={ariaLabel ?? title}
			>
				{content}
			</Link>
		) : (
			<button
				type='button'
				className={className}
				aria-label={ariaLabel ?? title}
				aria-disabled={disabled || undefined}
				onClick={disabled ? undefined : onClick}
			>
				{content}
			</button>
		);
	// Thẻ điện thoại đã hiện chữ → không cần tooltip (chạm vào cũng không rê được).
	if (cardMode) return el;
	return (
		<Tooltip
			title={title}
			trigger={['hover', 'focus']}
			mouseEnterDelay={0.25}
		>
			{el}
		</Tooltip>
	);
}

// Đánh dấu tĩnh thay vì so `el.type === RowAction`: sau HMR, module dùng có thể
// giữ bản hàm cũ → so định danh sai, nút không được gom vào menu.
(RowAction as { isRowAction?: boolean }).isRowAction = true;
const isRowAction = (el: ReactElement): el is ReactElement<RowActionProps> =>
	(el.type as { isRowAction?: boolean }).isRowAction === true;

/** Phẳng hóa children (bỏ Fragment, giá trị falsy) để đếm / gom từng nút. */
function flattenActions(nodes: ReactNode, out: ReactElement[] = []): ReactElement[] {
	Children.forEach(nodes, (child) => {
		if (!isValidElement(child)) return;
		if (child.type === Fragment) flattenActions((child.props as { children?: ReactNode }).children, out);
		else out.push(child);
	});
	return out;
}

/** Nút "…" mở menu các thao tác bị gom (mỗi mục có icon + chữ). */
function RowActionsMenu({ items }: { items: ReactElement<RowActionProps>[] }) {
	const navigate = useNavigate();
	const byKey = new Map(items.map((el, i) => [String(i), el.props]));
	return (
		<RowMenu
			menu={{
				items: items.map((el, i) => ({
					key: String(i),
					label: el.props.title,
					icon: <span className={styles.menuIcon}>{el.props.children}</span>,
					danger: el.props.danger,
					disabled: el.props.disabled,
				})),
				onClick: ({ key, domEvent }) => {
					domEvent.stopPropagation();
					const p = byKey.get(key);
					if (!p || p.disabled) return;
					if (p.to) navigate(p.to);
					else p.onClick?.();
				},
			}}
		/>
	);
}

/**
 * Nút "…" (Thao tác khác) mở menu antd — dùng trong `RowActions` khi bảng tự
 * dựng danh sách mục menu (icon + chữ cho từng mục). Có nhãn như mọi RowAction.
 */
export function RowMenu({ menu, label = 'Thao tác khác' }: { menu: MenuProps; label?: string }) {
	const cardMode = useMediaQuery(CARD_MODE);
	// Menu đang mở thì tắt tooltip (nút giữ focus sau khi bấm → tooltip đè lên menu)
	const [menuOpen, setMenuOpen] = useState(false);
	const trigger = (
		<button
			type='button'
			className={styles.action}
			aria-label={label}
			aria-haspopup='menu'
			aria-expanded={menuOpen}
		>
			<span
				className={styles.actionIcon}
				aria-hidden='true'
			>
				<MoreVSvg />
			</span>
			<span
				className={styles.actionLabel}
				aria-hidden='true'
			>
				Thêm
			</span>
		</button>
	);
	return (
		<Dropdown
			trigger={['click']}
			placement='bottomRight'
			menu={menu}
			onOpenChange={setMenuOpen}
		>
			{cardMode ? (
				trigger
			) : (
				<Tooltip
					title={label}
					trigger={['hover', 'focus']}
					mouseEnterDelay={0.25}
					open={menuOpen ? false : undefined}
				>
					{trigger}
				</Tooltip>
			)}
		</Dropdown>
	);
}

/**
 * Cụm nút ở cột "Thao tác": các `RowAction` riêng (children) rồi tới Sửa / Xóa.
 * Nhiều hơn `max` nút thì giữ `max - 1` nút đầu, phần còn lại gom vào menu "…"
 * để cột Thao tác không phình. Trên thẻ điện thoại hiện đủ (có chữ, tự xuống dòng).
 */
export function RowActions({
	onEdit,
	onDelete,
	editLabel = 'Chỉnh sửa',
	deleteLabel = 'Xóa',
	itemName,
	max = 3,
	children,
}: {
	onEdit?: () => void;
	onDelete?: () => void;
	editLabel?: string;
	deleteLabel?: string;
	/** Tên dòng (vd "tài khoản Nguyễn Văn A") → aria-label "Xóa: <tên>" cho trình đọc màn hình. */
	itemName?: string;
	/** Số nút tối đa hiện thẳng trên dòng (tính cả nút "…"). */
	max?: number;
	children?: ReactNode;
}) {
	const cardMode = useMediaQuery(CARD_MODE);
	const all = flattenActions(children);
	if (onEdit)
		all.push(
			<RowAction
				key='__edit'
				title={editLabel}
				aria-label={itemName ? `${editLabel}: ${itemName}` : undefined}
				onClick={onEdit}
			>
				<EditSvg />
			</RowAction>,
		);
	if (onDelete)
		all.push(
			<RowAction
				key='__delete'
				title={deleteLabel}
				aria-label={itemName ? `${deleteLabel}: ${itemName}` : undefined}
				danger
				onClick={onDelete}
			>
				<TrashSvg />
			</RowAction>,
		);

	let inline = all;
	let overflow: ReactElement<RowActionProps>[] = [];
	if (!cardMode && all.length > max) {
		// Chỉ RowAction mới gom được vào menu (đọc được nhãn/icon); phần tử khác giữ trên dòng.
		const keep = Math.max(1, max - 1);
		inline = [];
		all.forEach((el) => {
			if (isRowAction(el) && inline.length >= keep) overflow.push(el);
			else inline.push(el);
		});
		if (overflow.length === 1) {
			inline.push(overflow[0]);
			overflow = [];
		}
	}

	return (
		<div
			className={styles.actions}
			data-row-actions=''
		>
			{inline.map((el, i) => (el.key == null ? cloneElement(el, { key: i }) : el))}
			{overflow.length > 0 && <RowActionsMenu items={overflow} />}
		</div>
	);
}
