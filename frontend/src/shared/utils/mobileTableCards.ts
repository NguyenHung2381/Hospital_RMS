// Tăng cường MỌI bảng danh sách (~80 bảng viết tay ở từng feature, không có
// component Table chung) bằng thuộc tính data-* để CSS trong global.css xử lý:
//
// 1. Điện thoại (≤ 640px) — bảng thành danh sách thẻ (`table[data-cards]`):
//    gắn data-label = tiêu đề cột lên từng <td> để hiện nhãn trước giá trị, và
//    data-card-title lên ô tên/tiêu đề đầu tiên để làm đầu thẻ (không nhãn).
//    Bỏ qua bảng trong hộp thoại (ma trận phân quyền, xem trước import…) và bảng
//    gắn `data-mobile-table` (muốn giữ dạng bảng).
// 2. Màn rộng hơn — bảng tràn khung phải cuộn ngang: gắn data-scroll-x, và
//    data-sticky-end nếu cột cuối là cụm nút thao tác → cột đó dính mép phải.
//
// Bảng render lại thì MutationObserver gắn lại; đổi cỡ thì ResizeObserver đo lại.
const MQ = window.matchMedia('(max-width: 640px)');
const ACTION_HEADER = /^(thao tác|hành động|tác vụ)$/i;
// Cột "tên" đủ nghĩa để làm đầu thẻ mà không cần nhãn cột
const TITLE_HEADER = /^(tên|họ tên|họ và tên|người dùng|tài khoản|tiêu đề|đề tài|khóa học|hội thảo|học viên|nhân viên|giảng viên|cán bộ)\b/i;
const TITLE_CELL = '[class*="_cellTitle_"], [class*="_cellLink_"], [class*="_itemName_"]';
const ACTIONS_CELL = '[data-row-actions], [class*="_actionBtns_"]';

function headerLabels(table: HTMLTableElement): string[] | null {
	const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
	if (!headRow) return null;
	const labels: string[] = [];
	for (const th of Array.from(headRow.cells)) {
		const text = (th.textContent ?? '').trim();
		for (let i = 0; i < th.colSpan; i++) labels.push(text);
	}
	return labels;
}

function bodyRows(table: HTMLTableElement): HTMLTableRowElement[] {
	return [...Array.from(table.tBodies), table.tFoot].flatMap((s) => Array.from(s?.rows ?? []));
}

function setAttr(el: Element, name: string, on: boolean, value = '') {
	if (on) {
		if (el.getAttribute(name) !== value) el.setAttribute(name, value);
	} else if (el.hasAttribute(name)) el.removeAttribute(name);
}

function labelCards(table: HTMLTableElement, rawLabels: string[]) {
	// Cột nút bấm bỏ nhãn → thành hàng nút tràn hết thẻ
	const labels = rawLabels.map((t) => (ACTION_HEADER.test(t) ? '' : t));
	setAttr(table, 'data-cards', true);
	for (const row of bodyRows(table)) {
		let col = 0;
		let titleDone = false;
		for (const cell of Array.from(row.cells)) {
			// Ô gộp cột (dòng rỗng, dòng chi tiết mở rộng) → không nhãn, tràn hết thẻ
			const label = cell.colSpan > 1 ? '' : (labels[col] ?? '');
			if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
			col += cell.colSpan;

			// Đầu thẻ = ô có nội dung đầu tiên (bỏ ô chọn, STT, ô nút) nếu là cột tên
			let isTitle = false;
			if (!titleDone && label && label !== 'STT' && label !== '#' && !cell.querySelector(':scope > input[type="checkbox"]:only-child')) {
				titleDone = true;
				isTitle = TITLE_HEADER.test(label) || !!cell.querySelector(TITLE_CELL);
			}
			setAttr(cell, 'data-card-title', isTitle);
		}
	}
}

/** Phần tử cuộn ngang gần nhất chứa bảng (có thể là chính bảng). */
function scrollParent(table: HTMLElement): HTMLElement | null {
	for (let el: HTMLElement | null = table; el && el !== document.body; el = el.parentElement) {
		const ox = getComputedStyle(el).overflowX;
		if (ox === 'auto' || ox === 'scroll') return el;
	}
	return null;
}

function measureScroll(table: HTMLTableElement) {
	const box = scrollParent(table);
	const overflowing = !!box && box.scrollWidth > box.clientWidth + 1;
	setAttr(table, 'data-scroll-x', overflowing);
	// Cột cuối là cụm nút thao tác? (xét dòng dữ liệu đầu tiên có đủ ô)
	const row = bodyRows(table).find((r) => r.cells.length > 1);
	const last = row?.cells[row.cells.length - 1];
	setAttr(table, 'data-sticky-end', overflowing && !!last?.querySelector(ACTIONS_CELL));
}

const resizeObserver = new ResizeObserver((entries) => {
	for (const e of entries) {
		const el = e.target as HTMLElement;
		const tables = el instanceof HTMLTableElement ? [el] : Array.from(el.querySelectorAll('table'));
		tables.forEach(measureScroll);
	}
});
const observed = new WeakSet<Element>();

function enhance(table: HTMLTableElement) {
	if (table.hasAttribute('data-mobile-table') || table.closest('[class*="modalBackdrop"]')) return;
	const labels = headerLabels(table);
	if (!labels) return;

	if (MQ.matches) labelCards(table, labels);
	else setAttr(table, 'data-cards', false);

	if (!observed.has(table)) {
		observed.add(table);
		resizeObserver.observe(table);
		const box = scrollParent(table);
		if (box && box !== table && !observed.has(box)) {
			observed.add(box);
			resizeObserver.observe(box);
		}
	}
	measureScroll(table);
}

let queued = false;
function scan() {
	queued = false;
	document.querySelectorAll('table').forEach(enhance);
}
function schedule() {
	if (queued) return;
	queued = true;
	requestAnimationFrame(scan);
}

export function initMobileTableCards() {
	new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
	MQ.addEventListener('change', schedule);
	schedule();
}
