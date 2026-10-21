// Giữ độ rộng ổn định cho <select> khi trình duyệt dùng danh sách tự vẽ
// (`appearance: base-select`, xem styles/select.css). Ở chế độ này ô chọn chỉ
// rộng bằng chữ của mục ĐANG chọn → select không đặt width (thanh lọc…) co giãn
// mỗi lần đổi lựa chọn. Select gốc thì luôn rộng bằng mục dài nhất — ở đây đặt
// min-width theo mục dài nhất để giữ đúng hành vi đó.
// - Chỉ chạy khi base-select thực sự được áp dụng (Chrome/Edge 135+, dùng chuột).
// - min(…, 100%) để không tràn khung hẹp; tôn trọng max-width của module.
const MQ = window.matchMedia('(hover: hover) and (pointer: fine)');
const SUPPORTED = typeof CSS !== 'undefined' && CSS.supports('appearance', 'base-select');

const ctx = document.createElement('canvas').getContext('2d');
const signatures = new WeakMap<HTMLSelectElement, string>();

function fit(select: HTMLSelectElement) {
	if (!ctx || select.multiple) return;
	const cs = getComputedStyle(select);
	if (cs.appearance !== 'base-select') {
		if (select.style.minWidth) select.style.minWidth = '';
		signatures.delete(select);
		return;
	}
	const texts = Array.from(select.options, (o) => o.text);
	const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
	const sig = `${font}|${texts.join('\u0001')}`;
	if (signatures.get(select) === sig) return;
	signatures.set(select, sig);

	ctx.font = font;
	const widest = Math.max(0, ...texts.map((t) => ctx.measureText(t).width));
	const chrome =
		parseFloat(cs.paddingLeft) +
		parseFloat(cs.paddingRight) +
		parseFloat(cs.borderLeftWidth) +
		parseFloat(cs.borderRightWidth);
	let px = Math.ceil(widest + chrome + 2);
	const max = parseFloat(cs.maxWidth);
	if (!Number.isNaN(max)) px = Math.min(px, max);
	select.style.minWidth = `min(${px}px, 100%)`;
}

let queued = false;
function scan() {
	queued = false;
	document.querySelectorAll('select').forEach(fit);
}
function schedule() {
	if (queued) return;
	queued = true;
	requestAnimationFrame(scan);
}

export function initSelectAutoWidth() {
	if (!SUPPORTED) return;
	new MutationObserver(schedule).observe(document.body, {
		childList: true,
		subtree: true,
		characterData: true,
		attributes: true,
		attributeFilter: ['data-active'],
	});
	MQ.addEventListener('change', schedule);
	// Font Mulish nạp sau (swap) → đo lại
	document.fonts?.ready.then(() => {
		document.querySelectorAll('select').forEach((s) => signatures.delete(s));
		schedule();
	});
	schedule();
}
