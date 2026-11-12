import type { BadgeTone } from '@/shared/components';
import type { TraineeDocState } from '../api/traineeRecordApi';
import styles from '../components/TraineeDocState.module.css';

/** Màu & nhãn trạng thái hồ sơ PDF — dùng chung cho danh sách học viên, trang chi tiết, danh sách ghi danh. */
export const DOC_STATE_META: Record<TraineeDocState, { label: string; hint: string; tone: BadgeTone }> = {
	done: { label: 'Đã nộp hồ sơ', hint: 'Đã có file PDF hồ sơ (đã duyệt)', tone: 'green' },
	pending: { label: 'Chờ duyệt', hint: 'Học viên đã nộp file, chờ phòng Đào tạo duyệt', tone: 'amber' },
	missing: { label: 'Chưa nộp', hint: 'Chưa có file PDF hồ sơ', tone: 'red' },
};

export const DOC_STATE_ORDER: TraineeDocState[] = ['done', 'pending', 'missing'];

/** Class tô vạch màu đầu dòng theo trạng thái hồ sơ — gắn vào <tr>. */
export const docStateRowClass = (state: TraineeDocState | undefined) =>
	state ? styles[`row_${state}`] : '';
