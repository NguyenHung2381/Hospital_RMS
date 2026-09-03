/**
 * Nối class name, bỏ qua giá trị falsy.
 *   cx(styles.row, isActive && styles.active, className)
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(' ');
}
