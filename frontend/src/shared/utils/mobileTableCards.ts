// Bảng dạng thẻ trên điện thoại cho MỌI bảng danh sách (~45 bảng viết tay ở
// từng feature, không có component Table chung). Gắn data-label = tiêu đề cột
// lên từng <td> để CSS (global.css, `table[data-cards]`) hiện nhãn trước giá trị.
// - Bỏ qua bảng trong hộp thoại (ma trận phân quyền, xem trước import…) và bảng
//   gắn `data-mobile-table` (muốn giữ dạng bảng).
// - Chỉ chạy khi màn hình ≤ 640px; bảng render lại thì MutationObserver gắn lại.
const MQ = window.matchMedia('(max-width: 640px)');
const ACTION_HEADER = /^(thao tác|hành động|tác vụ)$/i;

function labelTable(table: HTMLTableElement) {
	const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
	if (!headRow || table.hasAttribute('data-mobile-table') || table.closest('[class*="modalBackdrop"]')) return;

	const labels: string[] = [];
	for (const th of Array.from(headRow.cells)) {
		// Cột nút bấm bỏ nhãn → thành hàng nút tràn hết thẻ
		const raw = (th.textContent ?? '').trim();
		const text = ACTION_HEADER.test(raw) ? '' : raw;
		for (let i = 0; i < th.colSpan; i++) labels.push(text);
	}

	if (!table.hasAttribute('data-cards')) table.setAttribute('data-cards', '');
	for (const section of [...Array.from(table.tBodies), table.tFoot]) {
		for (const row of Array.from(section?.rows ?? [])) {
			let col = 0;
			for (const cell of Array.from(row.cells)) {
				// Ô gộp cột (dòng rỗng, dòng chi tiết mở rộng) → không nhãn, tràn hết thẻ
				const label = cell.colSpan > 1 ? '' : (labels[col] ?? '');
				if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label);
				col += cell.colSpan;
			}
		}
	}
}

let queued = false;
function scan() {
	queued = false;
	document.querySelectorAll('table').forEach(labelTable);
}
function schedule() {
	if (queued || !MQ.matches) return;
	queued = true;
	requestAnimationFrame(scan);
}

export function initMobileTableCards() {
	new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
	MQ.addEventListener('change', schedule);
	schedule();
}
