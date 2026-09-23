import { useCallback, useState } from 'react';

/**
 * Chọn nhiều dòng trong bảng — lưu theo id nên vẫn giữ lựa chọn khi đổi trang/bộ lọc.
 * `pageIds` là id của các dòng đang hiển thị (dùng cho ô "chọn tất cả").
 */
export function useRowSelection(pageIds: string[]) {
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

	const allPageSelected =
		pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
	const somePageSelected = pageIds.some((id) => selectedIds.has(id));

	const isSelected = useCallback(
		(id: string) => selectedIds.has(id),
		[selectedIds],
	);

	const toggleSelect = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}, []);

	const toggleSelectAll = useCallback(() => {
		setSelectedIds((prev) => {
			const allOn =
				pageIds.length > 0 && pageIds.every((id) => prev.has(id));
			const next = new Set(prev);
			for (const id of pageIds) {
				if (allOn) next.delete(id);
				else next.add(id);
			}
			return next;
		});
	}, [pageIds]);

	const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

	return {
		selectedIds,
		selectedCount: selectedIds.size,
		allPageSelected,
		somePageSelected,
		isSelected,
		toggleSelect,
		toggleSelectAll,
		clearSelection,
	};
}
