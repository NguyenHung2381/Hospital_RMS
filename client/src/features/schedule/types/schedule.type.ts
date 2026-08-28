import type {
	DeadlineType,
	ResearchRound,
	RoundDeadline,
} from '../../round/types/round.type';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * "Ngày báo cáo hội đồng" — pseudo-type CHỈ dùng để tô màu / gắn nhãn trên lịch.
 * Không phải một loại mốc thật trong round_deadlines (được dựng từ council.defense_date).
 */
export const DEFENSE_PSEUDO_TYPE = 'council_defense' as unknown as DeadlineType;
export const MONTHS_LONG = [
	'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
	'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
	'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
];
export const MONTHS_SHORT = [
	'Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6',
	'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12',
];

export const BASE_W = 900;
export const ZOOM_LEVELS = [1, 2, 4, 8] as const;
export type ZoomLevel = (typeof ZOOM_LEVELS)[number];

export const STATUS_CFG = {
	active: { label: 'Đang mở', color: '#2eb87a' },
	draft:  { label: 'Nháp',    color: '#ef9f27' },
	closed: { label: 'Đã đóng', color: '#9ca3af' },
} as const;

export const DEADLINE_COLORS: Record<string, string> = {
	report_submission:  '#e05252',
	supplement:         '#e09d52',
	edit:               '#52a9e0',
	council_defense:    '#e05298',
};

export const COLOR_PRESETS = [
	'#e05252', '#e09d52', '#ef9f27', '#2eb87a', '#378add',
	'#7c52e0', '#52a9e0', '#e05298', '#64748b',
];

export const BAR_DEFAULT_COLORS = {
	edit:       '#378add',
	supplement: '#ef9f27',
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface RoundRow extends ResearchRound {
	deadlines: RoundDeadline[];
}

export interface ModalState {
	round: RoundRow;
	deadline: RoundDeadline | null;
}

export type BarKind = 'edit' | 'research' | 'supplement';
export type DragMode = 'move' | 'left' | 'right';

export type CtxTarget =
	| { kind: 'row';      round: RoundRow }
	| { kind: 'bar';      round: RoundRow; barKind: BarKind; deadline?: RoundDeadline | null }
	| { kind: 'deadline'; round: RoundRow; deadline: RoundDeadline };

export interface CtxMenuState {
	x: number;
	y: number;
	target: CtxTarget;
}

export interface ColorPickerState {
	x: number;
	y: number;
	label: string;
	current: string;
	onApply: (color: string) => void;
}

export interface BarDragSession {
	mode:    DragMode;
	round:   RoundRow;
	barKind: BarKind;
	startX:  number;
	initL:   number;
	initW:   number;
}

export interface PinDragSession {
	round:        RoundRow;
	deadline:     RoundDeadline;
	startX:       number;
	initPct:      number;
	initStartPct: number | null;
}

export interface DeadlineBarDragSession {
	mode:     DragMode;
	round:    RoundRow;
	deadline: RoundDeadline;
	startX:   number;
	initL:    number;
	initW:    number;
}
