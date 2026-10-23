/**
 * Thứ hạng trình độ để xếp giảng viên trong 1 khoa — số nhỏ đứng trước:
 * GS → PGS → TS → BS CKII → ThS → BSNT → CKI (BS/ĐD/DS CKI) → BS/DS → CN/KS → CĐ → TC → chưa rõ.
 * (CKII tương đương TS, CKI tương đương ThS nên xếp liền nhau.)
 */
const LEVELS: [RegExp, number][] = [
	[/^GS$/, 1],
	[/^PGS$/, 2],
	[/^TS$/, 3],
	[/^CKII$/, 4],
	[/^THS$/, 5],
	[/^BSNT$/, 6],
	[/^CKI$/, 7],
	[/^(BS|DS|BSĐK|BSDK)$/, 8],
	[/^(CN|KS)$/, 9],
	[/^CĐ$/, 10],
	[/^TC$/, 11],
];
export const UNKNOWN_LEVEL = 99;

const TITLE_TOKEN = /^(GS|PGS|TS|THS|BS|BSNT|BSĐK|BSDK|DS|ĐD|CN|KS|CĐ|TC|CKI|CKII)$/;

/** Tách học hàm / học vị thành từng chữ: "BS CKII", "PGS.TS", "CK 2" → ["BS","CKII"], ["PGS","TS"]. */
const tokens = (s: string) =>
	s
		.toUpperCase()
		.replace(/CK\s*\.?\s*(II|2)\b/g, 'CKII')
		.replace(/CK\s*\.?\s*(I|1)\b/g, 'CKI')
		.split(/[\s.,]+/)
		.filter(Boolean);

/** Hạng cao nhất từ học hàm, học vị và tiền tố danh xưng ghi sẵn trong tên ("ThS Nguyễn Văn A"). */
export function academicLevel(rank?: string | null, degree?: string | null, fullName?: string | null): number {
	const nameTokens = tokens(fullName ?? '');
	const firstNamePart = nameTokens.findIndex((t) => !TITLE_TOKEN.test(t));
	const leading = firstNamePart === -1 ? nameTokens : nameTokens.slice(0, firstNamePart);
	let best = UNKNOWN_LEVEL;
	for (const t of [...tokens(rank ?? ''), ...tokens(degree ?? ''), ...leading]) {
		const hit = LEVELS.find(([re]) => re.test(t));
		if (hit && hit[1] < best) best = hit[1];
	}
	return best;
}
