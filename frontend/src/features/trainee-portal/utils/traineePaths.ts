import { TRAINEE_HOME } from '../../../app/router/authHelpers';
import { formatDateVN } from '@/shared/utils/formatDate';

export const dateRange = (a: string | null, b: string | null) =>
	a || b ? `${formatDateVN(a) || '…'} – ${formatDateVN(b) || '…'}` : 'Chưa xếp lịch';

export const coursePath = (id: string, tab?: string) =>
	`${TRAINEE_HOME}/khoa-hoc/${id}${tab ? `?tab=${tab}` : ''}`;
