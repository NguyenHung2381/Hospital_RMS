/**
 * vnHolidays.js — ngày nghỉ lễ Việt Nam tự tính cho từng năm (Bộ luật Lao động 2019, Điều 112),
 * dùng để gợi ý ngày học (utils/classDates.js). Hàm thuần, ngày dạng 'YYYY-MM-DD'.
 *
 *   - Tết Dương lịch 01/01
 *   - Tết Nguyên đán: từ 2 ngày trước mùng 1 tới hết mùng 5 âm lịch — khớp 5 ngày làm việc được
 *     nghỉ theo thông báo các năm 2023–2026 (T7, CN trong khoảng này vốn đã bỏ)
 *   - Giỗ Tổ Hùng Vương 10/3 âm lịch
 *   - 30/04, 01/05
 *   - Quốc khánh 02/09 + 1 ngày liền kề (Chính phủ chọn hằng năm — ở đây đoán theo thứ để nối với
 *     cuối tuần: 2024 T2 ⇒ 03/09, 2025 T3 ⇒ 01/09)
 *   - Nghỉ bù: lễ (trừ Tết Nguyên đán) rơi vào T7 / CN ⇒ nghỉ bù ngày làm việc kế tiếp
 *
 * Ngày thực tế do Chính phủ công bố có thể khác (hoán đổi ngày làm việc…) — admin sửa ở ô
 * "Ngày nghỉ lễ" (thêm ngày, hoặc "-DD/MM/YYYY" để bỏ ngày tự động).
 *
 * Đổi âm lịch → dương lịch: thuật toán của Hồ Ngọc Đức (múi giờ +7).
 */
const INT = Math.floor;
const TZ = 7;

const jdFromDate = (dd, mm, yy) => {
	const a = INT((14 - mm) / 12);
	const y = yy + 4800 - a;
	const m = mm + 12 * a - 3;
	let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
	if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
	return jd;
};

const jdToDate = (jd) => {
	let b;
	let c;
	if (jd > 2299160) {
		const a = jd + 32044;
		b = INT((4 * a + 3) / 146097);
		c = a - INT((b * 146097) / 4);
	} else {
		b = 0;
		c = jd + 32082;
	}
	const d = INT((4 * c + 3) / 1461);
	const e = c - INT((1461 * d) / 4);
	const m = INT((5 * e + 2) / 153);
	return [
		e - INT((153 * m + 2) / 5) + 1,
		m + 3 - 12 * INT(m / 10),
		b * 100 + d - 4800 + INT(m / 10),
	];
};

const newMoon = (k) => {
	const T = k / 1236.85;
	const T2 = T * T;
	const T3 = T2 * T;
	const dr = Math.PI / 180;
	let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
	jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
	const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
	const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
	const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
	let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
	C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
	C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
	C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
	C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
	C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
	C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
	const deltat =
		T < -11
			? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
			: -0.000278 + 0.000265 * T + 0.000262 * T2;
	return jd1 + C1 - deltat;
};

const sunLongitude = (jdn) => {
	const T = (jdn - 2451545.0) / 36525;
	const T2 = T * T;
	const dr = Math.PI / 180;
	const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
	const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
	let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
	DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
	let L = (L0 + DL) * dr;
	L -= Math.PI * 2 * INT(L / (Math.PI * 2));
	return L;
};

const getSunLongitude = (dayNumber) => INT((sunLongitude(dayNumber - 0.5 - TZ / 24) / Math.PI) * 6);
const getNewMoonDay = (k) => INT(newMoon(k) + 0.5 + TZ / 24);

const getLunarMonth11 = (yy) => {
	const off = jdFromDate(31, 12, yy) - 2415021;
	const k = INT(off / 29.530588853);
	const nm = getNewMoonDay(k);
	return getSunLongitude(nm) >= 9 ? getNewMoonDay(k - 1) : nm;
};

const getLeapMonthOffset = (a11) => {
	const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
	let last;
	let i = 1;
	let arc = getSunLongitude(getNewMoonDay(k + i));
	do {
		last = arc;
		i++;
		arc = getSunLongitude(getNewMoonDay(k + i));
	} while (arc !== last && i < 14);
	return i - 1;
};

/** Ngày âm lịch (không nhuận) của năm âm `lunarYear` ⇒ số ngày Julius. */
const lunarToJd = (lunarDay, lunarMonth, lunarYear) => {
	const [a11, b11] =
		lunarMonth < 11
			? [getLunarMonth11(lunarYear - 1), getLunarMonth11(lunarYear)]
			: [getLunarMonth11(lunarYear), getLunarMonth11(lunarYear + 1)];
	const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
	let off = lunarMonth - 11;
	if (off < 0) off += 12;
	if (b11 - a11 > 365 && off >= getLeapMonthOffset(a11)) off += 1;
	return getNewMoonDay(k + off) + lunarDay - 1;
};

const pad = (n) => String(n).padStart(2, '0');
const jdToStr = (jd) => {
	const [d, m, y] = jdToDate(jd);
	return `${y}-${pad(m)}-${pad(d)}`;
};
/** Thứ trong tuần theo số ngày Julius: 0 = CN … 6 = T7 */
const dowOfJd = (jd) => (jd + 1) % 7;
const isWeekend = (jd) => dowOfJd(jd) === 0 || dowOfJd(jd) === 6;

/** Âm lịch ⇒ 'YYYY-MM-DD' (dùng cho test / hiển thị). */
const lunarToSolar = (day, month, year) => jdToStr(lunarToJd(day, month, year));

/**
 * Ngày nghỉ lễ tự tính của năm dương lịch `year`.
 * @param {number} year
 * @returns {{ date: string, name: string, compensatory?: boolean }[]} sắp theo ngày
 */
const vnHolidays = (year) => {
	/** @type {Map<number, { name: string, compensatory?: boolean }>} */
	const days = new Map();
	const add = (jd, name) => !days.has(jd) && days.set(jd, { name });
	// Lễ được nghỉ bù khi rơi vào cuối tuần (Tết Nguyên đán đã tính trọn khoảng nên không bù)
	const single = [];

	single.push([jdFromDate(1, 1, year), 'Tết Dương lịch']);

	const mung1 = lunarToJd(1, 1, year);
	for (let i = -2; i <= 4; i++) add(mung1 + i, 'Tết Nguyên đán');

	single.push([lunarToJd(10, 3, year), 'Giỗ Tổ Hùng Vương (10/3 âm lịch)']);
	single.push([jdFromDate(30, 4, year), 'Ngày Giải phóng miền Nam (30/4)']);
	single.push([jdFromDate(1, 5, year), 'Quốc tế Lao động (1/5)']);

	const qk = jdFromDate(2, 9, year);
	// Ngày liền kề: chọn phía nối được với cuối tuần (T3, T6, T7 ⇒ 01/09; còn lại ⇒ 03/09)
	const before = [2, 5, 6].includes(dowOfJd(qk));
	single.push([qk, 'Quốc khánh (2/9)']);
	single.push([before ? qk - 1 : qk + 1, 'Quốc khánh (ngày liền kề)']);

	for (const [jd, name] of single) add(jd, name);
	// Nghỉ bù: xếp theo ngày để các lễ sát nhau (30/4 + 1/5) bù lần lượt, không chồng lên nhau
	for (const [jd, name] of [...single].sort((a, b) => a[0] - b[0])) {
		if (!isWeekend(jd)) continue;
		let d = jd + 1;
		while (isWeekend(d) || days.has(d)) d++;
		days.set(d, { name: `Nghỉ bù ${name}`, compensatory: true });
	}

	return [...days]
		.sort((a, b) => a[0] - b[0])
		.map(([jd, v]) => ({ date: jdToStr(jd), ...v }))
		.filter((h) => h.date.startsWith(`${year}-`));
};

module.exports = { vnHolidays, lunarToSolar };
