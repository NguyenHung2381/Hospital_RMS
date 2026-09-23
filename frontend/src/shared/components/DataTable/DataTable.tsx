import { Table } from 'antd';
import type { TableProps } from 'antd';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '../../utils/constants';
import type { PaginatedResponse } from '../../types';

export interface DataTablePagination {
	page: number;
	limit: number;
	total: number;
	onChange: (page: number, limit: number) => void;
}

export interface DataTableProps<T> extends Omit<TableProps<T>, 'pagination' | 'dataSource'> {
	/** Kết quả phân trang trả nguyên từ API (`{ data, total, page, limit }`) — dùng thay cho `dataSource`+`pagination` riêng lẻ. */
	response?: PaginatedResponse<T> | null;
	/** Dữ liệu trực tiếp khi không dùng `response` (vd bảng không phân trang). */
	dataSource?: T[];
	pagination?: DataTablePagination | false;
	rowKey?: TableProps<T>['rowKey'];
}

// Bọc antd Table theo quy ước danh sách của dự án (§5.3): phân trang phía
// server, mặc định DEFAULT_PAGE_SIZE dòng, tuỳ chọn PAGE_SIZE_OPTIONS.
// Component MỚI — các bảng <table> thô hiện có trong từng feature không bị
// thay ngay, chuyển dần sang DataTable ở các giai đoạn sau (bắt đầu từ 1
// feature mẫu).
export function DataTable<T extends object>({
	response,
	dataSource,
	pagination,
	rowKey = 'id' as TableProps<T>['rowKey'],
	loading,
	...rest
}: DataTableProps<T>) {
	const rows = response?.data ?? dataSource ?? [];

	const resolvedPagination =
		pagination === false
			? false
			: pagination
				? {
						current: pagination.page,
						pageSize: pagination.limit,
						total: pagination.total,
						pageSizeOptions: PAGE_SIZE_OPTIONS as unknown as string[],
						showSizeChanger: true,
						onChange: pagination.onChange,
					}
				: response
					? {
							current: response.page,
							pageSize: response.limit,
							total: response.total,
							pageSizeOptions: PAGE_SIZE_OPTIONS as unknown as string[],
							showSizeChanger: true,
						}
					: {
							defaultPageSize: DEFAULT_PAGE_SIZE,
							pageSizeOptions: PAGE_SIZE_OPTIONS as unknown as string[],
							showSizeChanger: true,
						};

	return (
		<Table<T>
			rowKey={rowKey}
			dataSource={rows}
			loading={loading}
			pagination={resolvedPagination}
			{...rest}
		/>
	);
}
