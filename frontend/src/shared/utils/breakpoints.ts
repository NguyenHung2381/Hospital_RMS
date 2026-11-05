/**
 * Mốc responsive dùng chung — cùng giá trị với --bp-* trong styles/variables.css.
 * CSS viết thẳng số trong @media (var() không dùng được ở đó); JS lấy từ đây.
 *   window.matchMedia(maxWidth('lg'))
 */
export const BREAKPOINTS = {
	xs: 480,
	sm: 640,
	md: 768,
	lg: 1024,
	xl: 1280,
	'2xl': 1600,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

export function maxWidth(bp: Breakpoint): string {
	return `(max-width: ${BREAKPOINTS[bp]}px)`;
}
