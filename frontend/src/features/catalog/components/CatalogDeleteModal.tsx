import { ConfirmDeleteModal } from '@/shared/components';
import { TAB_CONFIG } from '../hooks/useCatalog';
import type { CatalogItem, CatalogTab } from '../types/catalog.type';

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
	return (
		<ConfirmDeleteModal
			title={`Xoá ${TAB_CONFIG[tab].label.toLowerCase()}`}
			subtitle={item.name}
			onClose={onClose}
			onConfirm={onConfirm}
			loading={loading}
		>
			Bạn có chắc muốn xoá <strong>{item.name}</strong> khỏi hệ thống? Thao tác này không thể hoàn
			tác.
		</ConfirmDeleteModal>
	);
}
