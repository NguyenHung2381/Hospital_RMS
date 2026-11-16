const AVATAR_COLORS = [
	{ bg: '#e1f5ea', color: '#085028' },
	{ bg: '#e6f1fb', color: '#0c447c' },
	{ bg: '#e3f3f6', color: '#0b5866' },
	{ bg: '#faeeda', color: '#633806' },
	{ bg: '#f1efe8', color: '#444441' },
];

/** Màu nền/chữ cố định cho avatar chữ cái, suy ra từ id (cùng id → cùng màu). */
export function avatarColor(id: string) {
	let hash = 0;
	for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
