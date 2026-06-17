import { TrashSvg, XSvg } from '@/assets/icons';
import type { CatalogItem, CatalogTab } from '../types/catalog.type';
import { TAB_CONFIG } from '../hooks/useCatalog';
import styles from '../pages/Catalog.module.css';

export function CatalogDeleteModal({
	item,
	tab,
	onClose,
	onConfirm,
	loading,
}: {
	item: CatalogItem;
	tab: CatalogTab;
	onClose: () => void;
	onConfirm: () => void;
	loading: boolean;
}) {
	const cfg = TAB_CONFIG[tab];
	return (
		<div
			className={styles.modalBackdrop}
			onClick={(e) => e.target === e.currentTarget && onClose()}
		>
			<div className={`${styles.modal} ${styles.modalSm}`}>
				<div className={styles.modalHeader}>
					<div className={styles.modalHeaderIconDanger}>
						<TrashSvg />
					</div>
					<div>
						<div className={styles.modalTitle}>
							Xoá {cfg.label.toLowerCase()}
						</div>
						<div className={styles.modalSub}>{item.name}</div>
					</div>
					<button
						className={styles.modalClose}
						onClick={onClose}
					>
						<XSvg />
					</button>
				</div>
				<div className={styles.modalBody}>
					<p className={styles.deleteDesc}>
						Bạn có chắc muốn xoá <strong>{item.name}</strong> khỏi hệ thống?
						Thao tác này không thể hoàn tác.
					</p>
				</div>
				<div className={styles.modalFooter}>
					<button
						className={styles.btnCancel}
						onClick={onClose}
						disabled={loading}
					>
						Huỷ
					</button>
					<button
						className={styles.btnDanger}
						onClick={onConfirm}
						disabled={loading}
					>
						{loading ? (
							<span className={`${styles.spinner} ${styles.spinnerDark}`} />
						) : (
							<TrashSvg />
						)}
						Xác nhận xoá
					</button>
				</div>
			</div>
		</div>
	);
}
