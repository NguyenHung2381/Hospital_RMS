import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TRAINING_TYPE } from '../../course/types/course.type';
import { getTraineeFilterOptions } from '../api/traineeApi';
import type { TraineeFilterOptions, TraineeListQuery } from '../types/trainee.type';

/** Tab loại hình của trang Tất cả học viên — key là giá trị ?loai= trên URL. */
export const TRAINEE_TYPE_TABS = [
	{ key: '', id: '', label: 'Tất cả' },
	{ key: 'dtlt', id: TRAINING_TYPE.DTLT, label: 'Đào tạo liên tục' },
	{ key: 'gphn', id: TRAINING_TYPE.GPHN, label: 'Giấy phép hành nghề' },
	{ key: 'ctcv', id: TRAINING_TYPE.CTCV, label: 'Cầm tay chỉ việc' },
] as const;

/**
 * Tham số URL của bộ lọc (giữ được khi mở hồ sơ học viên rồi quay lại, gửi link cho người khác).
 * Không dùng ?type= — tên đó là link cũ, router chuyển sang trang Học viên của từng loại.
 */
const PARAM = {
	loai: 'loai',
	dot: 'dot',
	nam: 'nam',
	ghidanh: 'ghidanh',
	tiendo: 'tiendo',
	hinhthuc: 'hinhthuc',
	doituong: 'doituong',
	khoa: 'khoa',
} as const;
export type TraineeFilterKey = keyof typeof PARAM;

// Bộ lọc gắn với lượt ghi danh (trừ loại hình) và bộ lọc theo hồ sơ học viên
const ENROLLMENT_KEYS: TraineeFilterKey[] = ['dot', 'nam', 'ghidanh', 'tiendo', 'hinhthuc'];
const REFINE_KEYS: TraineeFilterKey[] = ['ghidanh', 'tiendo', 'hinhthuc', 'doituong', 'khoa'];

const EMPTY_OPTIONS: TraineeFilterOptions = { courses: [], years: [], training_forms: [] };

/** lockedTypeId: trang Học viên của 1 loại — loại hình cố định, không có tab loại. */
export function useTraineeFilters(lockedTypeId = '') {
	const [params, setParams] = useSearchParams();
	const value = useCallback((k: TraineeFilterKey) => params.get(PARAM[k]) ?? '', [params]);

	const typeKey = lockedTypeId ? '' : value('loai');
	const typeId = lockedTypeId || (TRAINEE_TYPE_TABS.find((t) => t.key && t.key === typeKey)?.id ?? '');

	const setFilter = useCallback(
		(k: TraineeFilterKey, v: string) =>
			setParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					if (v) next.set(PARAM[k], v);
					else next.delete(PARAM[k]);
					// Đợt/khóa thuộc 1 loại hình — đổi loại thì bỏ đợt đang chọn
					if (k === 'loai') next.delete(PARAM.dot);
					return next;
				},
				{ replace: true },
			),
		[setParams],
	);

	/** Xóa mọi bộ lọc, giữ tab loại hình đang mở. */
	const clearFilters = useCallback(
		() =>
			setParams(
				(prev) => {
					const next = new URLSearchParams(prev);
					for (const k of Object.keys(PARAM) as TraineeFilterKey[]) if (k !== 'loai') next.delete(PARAM[k]);
					return next;
				},
				{ replace: true },
			),
		[setParams],
	);

	const query = useMemo<TraineeListQuery>(
		() => ({
			training_type_id: typeId || undefined,
			course_id: value('dot') || undefined,
			year: value('nam') || undefined,
			enrollment_status: value('ghidanh') || undefined,
			progress_status: value('tiendo') || undefined,
			training_form_id: value('hinhthuc') || undefined,
			trainee_type_id: value('doituong') || undefined,
			department_id: value('khoa') || undefined,
		}),
		[typeId, value],
	);

	// Có lọc theo khóa ⇒ server trả kèm lượt ghi danh khớp bộ lọc (cột Khóa/đợt, Trạng thái)
	const byEnrollment = !!typeId || ENROLLMENT_KEYS.some((k) => !!value(k));
	const refineCount = REFINE_KEYS.filter((k) => !!value(k)).length;
	const hasFilters = Object.keys(PARAM).some((k) => k !== 'loai' && !!value(k as TraineeFilterKey));

	const [options, setOptions] = useState<TraineeFilterOptions>(EMPTY_OPTIONS);
	useEffect(() => {
		let stale = false;
		getTraineeFilterOptions(typeId || undefined)
			.then((res) => {
				if (!stale) setOptions(res);
			})
			.catch(() => {
				if (!stale) setOptions(EMPTY_OPTIONS);
			});
		return () => {
			stale = true;
		};
	}, [typeId]);

	return {
		typeId,
		typeKey,
		value,
		setFilter,
		clearFilters,
		query,
		byEnrollment,
		refineCount,
		hasFilters,
		options,
	};
}
