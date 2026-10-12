import { useCallback, useMemo, useState } from 'react';

/** Phân trang phía client cho danh sách đã lọc sẵn. pageSize = 0 nghĩa là hiện tất cả. */
export function useClientPaging<T>(items: T[], initialPageSize = 10) {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(initialPageSize);

	const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(items.length / pageSize));
	const safePage = Math.min(page, totalPages);

	const paged = useMemo(
		() => (pageSize === 0 ? items : items.slice((safePage - 1) * pageSize, safePage * pageSize)),
		[items, safePage, pageSize],
	);

	const handlePageSize = useCallback((v: number) => {
		setPageSize(v);
		setPage(1);
	}, []);

	return { page, setPage, pageSize, handlePageSize, totalPages, safePage, paged };
}
