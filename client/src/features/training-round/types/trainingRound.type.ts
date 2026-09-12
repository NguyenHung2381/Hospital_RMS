export type ModalType = 'add' | 'edit' | 'delete' | null;
export type TrainingRoundStatus = 'draft' | 'open' | 'closed';

export interface TrainingRound {
	id: string;
	name: string;
	year: number;
	start_date: string;
	end_date: string;
	enrollment_start_date: string | null;
	enrollment_end_date: string | null;
	enrollment_open: boolean;
	status: TrainingRoundStatus;
	course_count?: number;
	created_at: string;
}

export interface TrainingRoundFormData {
	name: string;
	year: string;
	start_date: string;
	end_date: string;
	enrollment_start_date: string;
	enrollment_end_date: string;
	status: TrainingRoundStatus;
}

export interface TrainingRoundListResponse {
	data: TrainingRound[];
	pagination: { page: number; limit: number; total: number };
}

export const EMPTY_FORM: TrainingRoundFormData = {
	name: '',
	year: String(new Date().getFullYear()),
	start_date: '',
	end_date: '',
	enrollment_start_date: '',
	enrollment_end_date: '',
	status: 'draft',
};

export const STATUS_CFG: Record<TrainingRoundStatus, { label: string; color: string; bg: string }> = {
	draft: { label: 'Nháp', color: '#633806', bg: '#faeeda' },
	open: { label: 'Đang mở', color: '#085041', bg: '#e1f5ee' },
	closed: { label: 'Đã đóng', color: 'var(--color-gray-600)', bg: 'var(--color-gray-100)' },
};
