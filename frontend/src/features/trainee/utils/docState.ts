import type { BadgeTone } from '@/shared/components';
import type { TraineeDocState } from '../api/traineeRecordApi';

/**
 * Màu & nhãn trạng thái hồ sơ PDF — dùng chung cho danh sách học viên, trang chi tiết, danh sách ghi danh.
 * `label` dùng nơi đã có ngữ cảnh (cột "Hồ sơ PDF", tab Hồ sơ); `tag` tự nói rõ là hồ sơ PDF —
 * dùng khi nhãn đứng lẫn với nhãn khác (cạnh tên học viên ở danh sách ghi danh).
 */
export const DOC_STATE_META: Record<TraineeDocState, { label: string; tag: string; hint: string; tone: BadgeTone }> = {
	done: { label: 'Đã nộp hồ sơ', tag: 'Hồ sơ PDF: đã nộp', hint: 'Đã có file PDF hồ sơ (đã duyệt)', tone: 'green' },
	pending: {
		label: 'Chờ duyệt',
		tag: 'Hồ sơ PDF: chờ duyệt',
		hint: 'Học viên đã nộp file, chờ phòng Đào tạo duyệt',
		tone: 'amber',
	},
	missing: { label: 'Chưa nộp', tag: 'Hồ sơ PDF: chưa nộp', hint: 'Chưa có file PDF hồ sơ', tone: 'red' },
};

export const DOC_STATE_ORDER: TraineeDocState[] = ['done', 'pending', 'missing'];
