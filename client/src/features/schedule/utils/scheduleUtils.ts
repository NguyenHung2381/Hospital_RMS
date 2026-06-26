/**
 * Parse a dd/mm/yyyy date string (the format used by the round API) into a Date.
 * Returns null for any missing or malformed input.
 */
export const parseDate = (s: string | null | undefined): Date | null => {
	if (!s) return null;
	const parts = s.split('/');
	if (parts.length !== 3) return null;
	const [d, m, y] = parts.map(Number);
	if (!d || !m || !y) return null;
	return new Date(y, m - 1, d);
};
