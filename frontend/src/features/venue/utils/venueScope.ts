import type { BadgeTone } from '../../../shared/components/Badge/badgeTone';
import type { VenueScope } from '../types/venue.type';

export const SCOPE_LABEL: Record<VenueScope, { label: string; tone: BadgeTone }> = {
	both: { label: 'Bảo vệ & Đào tạo', tone: 'teal' },
	defense: { label: 'Bảo vệ đề cương', tone: 'purple' },
	training: { label: 'Đào tạo / Lớp học', tone: 'blue' },
};
