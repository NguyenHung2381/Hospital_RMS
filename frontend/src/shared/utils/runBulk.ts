/**
 * Chạy một thao tác trên nhiều id bằng cách gọi lần lượt endpoint đơn lẻ.
 * Chưa cần API bulk phía server — đủ nhanh với vài trăm bản ghi.
 */
export async function runBulk<T>(
	ids: string[],
	fn: (id: string) => Promise<T>,
): Promise<{
	okIds: Set<string>;
	failedCount: number;
	results: PromiseSettledResult<T>[];
}> {
	const results = await Promise.allSettled(ids.map((id) => fn(id)));
	const okIds = new Set(
		ids.filter((_, i) => results[i].status === 'fulfilled'),
	);
	return { okIds, failedCount: ids.length - okIds.size, results };
}

/** Câu thông báo kết quả bulk: "Đã xoá 5 khoa phòng" / "Đã xoá 3 khoa phòng, 2 lỗi". */
export const bulkToast = (
	verb: string,
	ok: number,
	failed: number,
	label: string,
) => (failed ? `Đã ${verb} ${ok} ${label}, ${failed} lỗi` : `Đã ${verb} ${ok} ${label}`);
