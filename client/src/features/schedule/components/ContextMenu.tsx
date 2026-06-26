import type { CtxMenuState } from '../types/schedule.type';
import styles from './ContextMenu.module.css';

interface Props {
	state: CtxMenuState;
	onAddActivity: () => void;
	onEditColor: (() => void) | null;
	onEdit: (() => void) | null;
	onClose: () => void;
}

export function ContextMenu({ state, onAddActivity, onEditColor, onEdit, onClose }: Props) {
	return (
		<ul
			className={styles.ctxMenu}
			style={{ left: state.x, top: state.y }}
			onClick={(e) => e.stopPropagation()}
			onContextMenu={(e) => e.preventDefault()}
		>
			<li>
				<button
					className={styles.ctxItem}
					onClick={() => { onAddActivity(); onClose(); }}
				>
					<span className={styles.ctxAddIcon} aria-hidden />
					Thêm hoạt động
				</button>
			</li>
			<li>
				<button
					className={`${styles.ctxItem}${!onEditColor ? ` ${styles.ctxItemDisabled}` : ''}`}
					onClick={() => { if (onEditColor) { onEditColor(); onClose(); } }}
					disabled={!onEditColor}
				>
					<span className={styles.ctxColorIcon} aria-hidden />
					Chỉnh màu
				</button>
			</li>
			<li role='separator' className={styles.ctxSep} />
			<li>
				<button
					className={`${styles.ctxItem}${!onEdit ? ` ${styles.ctxItemDisabled}` : ''}`}
					onClick={() => { if (onEdit) { onEdit(); onClose(); } }}
					disabled={!onEdit}
				>
					<span className={styles.ctxEditIcon} aria-hidden />
					Chỉnh sửa
				</button>
			</li>
		</ul>
	);
}
