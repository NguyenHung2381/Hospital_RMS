// dd/mm/yyyy (API display format) ↔ yyyy-mm-dd (input[type=date])
export function toInputDate(s: string | null | undefined): string {
	if (!s) return '';
	const [d, m, y] = s.split('/');
	if (!d || !m || !y) return '';
	return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
