import type { Seminar, SeminarParticipant } from '../../types/seminar.type';
import type { useSeminarPerms } from '../../utils/perms';
import type { DetailCounts } from './detailUtils';

export type DetailTab = 'overview' | 'participants' | 'agenda' | 'checkin' | 'test' | 'cme';

export type SeminarPerms = ReturnType<typeof useSeminarPerms>;

/**
 * Thao tác của trang chi tiết — mọi hộp thoại (Modal) nằm ở trang cha, các tab và
 * drawer người tham dự chỉ gọi qua đây để không mở trùng / lệch trạng thái.
 */
export interface DetailActions {
	goTab: (tab: DetailTab) => void;
	openParticipant: (id: string) => void;
	addParticipant: () => void;
	editParticipant: (p: SeminarParticipant) => void;
	deleteParticipant: (p: SeminarParticipant) => void;
	showTicket: (p: SeminarParticipant) => void;
	/** onDone: chạy khi cấp thành công (vd bỏ chọn dòng) */
	issueCme: (targets: SeminarParticipant[], notEligible: number, onDone?: () => void) => void;
	markSigned: (ids: string[]) => void;
	revokeCme: (p: SeminarParticipant) => void;
	/** Giấy chứng nhận cho danh sách đã có số CME; selectedCount = số dòng đang chọn (0 = tất cả) */
	openCertificates: (targets: SeminarParticipant[], selectedCount: number) => void;
	openRegQr: () => void;
	openTest: () => void;
	openAgenda: () => void;
	openImport: () => void;
	openStaff: () => void;
	scanTickets: () => void;
}

export interface TabProps {
	seminar: Seminar;
	participants: SeminarParticipant[];
	counts: DetailCounts;
	perms: SeminarPerms;
	actions: DetailActions;
	/** Tập huấn bệnh viện */
	ht: boolean;
}
