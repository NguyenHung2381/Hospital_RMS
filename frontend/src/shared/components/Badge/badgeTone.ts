export type BadgeTone =
	| 'green'
	| 'blue'
	| 'amber'
	| 'gray'
	| 'red'
	| 'pink'
	| 'purple'
	| 'teal';

const TONES: BadgeTone[] = [
	'green',
	'blue',
	'amber',
	'gray',
	'red',
	'pink',
	'purple',
	'teal',
];

/** Chuyển tên class cũ (`badgeGreen`, `green`) sang tông chuẩn — hỗ trợ migrate dần. */
export function badgeTone(cls: string | null | undefined): BadgeTone {
	const key = (cls ?? '').replace(/^badge/i, '').toLowerCase();
	return TONES.includes(key as BadgeTone) ? (key as BadgeTone) : 'gray';
}
