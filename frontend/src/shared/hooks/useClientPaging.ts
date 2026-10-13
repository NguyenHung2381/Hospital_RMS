import { useCallback, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE } from '../utils/constants';

/**
 * Phân trang phía client cho danh sách đã lọc sẵn. pageSize = 0 nghĩa là hiện tất cả.
 * `pagination` trải thẳng vào `<Pagination {...pg.pagination} itemLabel='…' />`;
 * `offset` cộng vào chỉ số dòng để ra STT liên tục qua các trang.
 */
export function useClientPaging<T>(items: T[], initialPageSize = DEFAULT_PAGE_SIZE) {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(initialPageSize);

	const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(items.length / pageSize));
	const safePage = Math.min(page, totalPages);
	const offset = pageSize === 0 ? 0 : (safePage - 1) * pageSize;

	const paged = useMemo(
		() => (pageSize === 0 ? items : items.slice(offset, offset + pageSize)),
		[items, offset, pageSize],
	);

	const handlePageSize = useCallback((v: number) => {
		setPageSize(v);
		setPage(1);
	}, []);

	const pagination = {
		page: safePage,
		totalPages,
		total: items.length,
		rowsPerPage: pageSize,
		onPageChange: setPage,
		onRowsPerPageChange: handlePageSize,
	};

	return { page, setPage, pageSize, handlePageSize, totalPages, safePage, paged, offset, pagination };
}
