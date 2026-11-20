import { cx } from '@/shared/utils/cx';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './Tabs.module.css';

export interface TabItem {
	id: string;
	label: ReactNode;
	/** Số đếm cạnh nhãn (vd số đơn chờ duyệt). */
	badge?: ReactNode;
	disabled?: boolean;
}

export interface TabsProps {
	items: TabItem[];
	/** id tab đang chọn. */
	value: string;
	onChange: (id: string) => void;
	/** Tên nhóm tab cho trình đọc màn hình, vd "Trạng thái đơn". */
	'aria-label'?: string;
	/**
	 * 'auto' (mặc định): mũi tên chuyển tab ngay — hợp khi nội dung tab có sẵn.
	 * 'manual': mũi tên chỉ dời focus, Enter / Space mới chọn — hợp khi đổi tab phải tải dữ liệu.
	 */
	activation?: 'auto' | 'manual';
	/**
	 * Tiền tố id — tab có id `${idPrefix}-tab-${item.id}`, panel `${idPrefix}-panel-${item.id}`.
	 * Truyền khi tự render panel bên ngoài (đặt `role='tabpanel'`, id và `aria-labelledby` theo quy ước này).
	 */
	idPrefix?: string;
	/** Nội dung tab đang chọn — có thì Tabs tự bọc trong `role="tabpanel"` nối sẵn với tab. */
	children?: ReactNode;
	className?: string;
	panelClassName?: string;
}

/**
 * Thanh tab chuẩn WAI-ARIA: roving tabindex (chỉ một tab nằm trong thứ tự Tab),
 * ←/→ chuyển tab, Home/End về đầu/cuối, `aria-selected`, `aria-controls`, `role="tabpanel"`.
 *
 *   <Tabs aria-label='Trạng thái' value={tab} onChange={setTab}
 *         items={[{ id: 'pending', label: 'Chờ duyệt', badge: 4 }, { id: 'done', label: 'Đã duyệt' }]}>
 *     {tab === 'pending' ? <PendingList /> : <DoneList />}
 *   </Tabs>
 */
export function Tabs({
	items,
	value,
	onChange,
	'aria-label': ariaLabel,
	activation = 'auto',
	idPrefix,
	children,
	className,
	panelClassName,
}: TabsProps) {
	const autoPrefix = useId();
	const prefix = idPrefix ?? autoPrefix;
	const tabId = (id: string) => `${prefix}-tab-${id}`;
	const panelId = (id: string) => `${prefix}-panel-${id}`;
	const hasPanel = children !== undefined || idPrefix !== undefined;
	const refs = useRef(new Map<string, HTMLButtonElement>());
	// Tab đang giữ focus khi activation='manual' (chưa chọn) — null = theo tab đang chọn
	const [focusId, setFocusId] = useState<string | null>(null);

	const enabled = items.filter((t) => !t.disabled);
	// Tab nằm trong thứ tự Tab: tab đang focus (manual) → tab đang chọn → tab bật đầu tiên
	const rovingId =
		(focusId && enabled.some((t) => t.id === focusId) ? focusId : null) ??
		(enabled.some((t) => t.id === value) ? value : enabled[0]?.id);

	const move = (fromId: string, e: KeyboardEvent<HTMLButtonElement>) => {
		const idx = enabled.findIndex((t) => t.id === fromId);
		let next: number;
		if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length;
		else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = enabled.length - 1;
		else return;
		e.preventDefault();
		const target = enabled[next];
		if (!target) return;
		refs.current.get(target.id)?.focus();
		if (activation === 'auto') {
			setFocusId(null);
			if (target.id !== value) onChange(target.id);
		} else {
			setFocusId(target.id);
		}
	};

	return (
		<>
			<div
				className={cx(styles.list, className)}
				role='tablist'
				aria-label={ariaLabel}
			>
				{items.map((t) => {
					const selected = t.id === value;
					return (
						<button
							key={t.id}
							ref={(el) => {
								if (el) refs.current.set(t.id, el);
								else refs.current.delete(t.id);
							}}
							type='button'
							role='tab'
							id={tabId(t.id)}
							className={cx(styles.tab, selected && styles.active)}
							aria-selected={selected}
							aria-controls={selected && hasPanel ? panelId(t.id) : undefined}
							tabIndex={t.id === rovingId ? 0 : -1}
							disabled={t.disabled}
							onClick={() => {
								setFocusId(null);
								if (!selected) onChange(t.id);
							}}
							onKeyDown={(e) => move(t.id, e)}
						>
							{t.label}
							{t.badge !== undefined && t.badge !== null && (
								<span className={styles.badge}>{t.badge}</span>
							)}
						</button>
					);
				})}
			</div>
			{children !== undefined && (
				<div
					role='tabpanel'
					id={panelId(value)}
					aria-labelledby={tabId(value)}
					tabIndex={0}
					className={cx(styles.panel, panelClassName)}
				>
					{children}
				</div>
			)}
		</>
	);
}
