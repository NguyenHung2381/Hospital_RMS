// Âm báo + rung khi quét vé — ban tổ chức đứng ở cửa hội trường, không phải lúc nào
// cũng nhìn màn hình. Âm thanh tạo bằng Web Audio (không cần file mp3).

export type ScanTone = 'ok' | 'warn' | 'bad';

const SOUND_KEY = 'ticketScan.sound';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
	if (ctx) return ctx;
	const Ctor =
		window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
	if (!Ctor) return null;
	ctx = new Ctor();
	return ctx;
}

/** iOS/Safari chỉ cho phát âm sau một thao tác chạm — gọi trong onClick (bật camera,
 * bật âm báo) để "mở khoá" AudioContext. */
export function primeAudio() {
	try {
		const c = audio();
		if (c?.state === 'suspended') void c.resume();
	} catch {
		// trình duyệt không hỗ trợ — bỏ qua
	}
}

// [tần số Hz, thời điểm bắt đầu (s), độ dài (s)]
const TONES: Record<ScanTone, [number, number, number][]> = {
	ok: [
		[880, 0, 0.09],
		[1320, 0.1, 0.12],
	],
	warn: [
		[660, 0, 0.1],
		[660, 0.16, 0.1],
	],
	bad: [[220, 0, 0.32]],
};

export function beep(tone: ScanTone) {
	try {
		const c = audio();
		if (!c) return;
		if (c.state === 'suspended') void c.resume();
		const now = c.currentTime;
		for (const [freq, at, dur] of TONES[tone]) {
			const osc = c.createOscillator();
			const gain = c.createGain();
			osc.type = tone === 'bad' ? 'square' : 'sine';
			osc.frequency.value = freq;
			// Bao hình ngắn để không "lụp bụp" ở đầu/cuối tiếng bíp
			gain.gain.setValueAtTime(0.0001, now + at);
			gain.gain.exponentialRampToValueAtTime(tone === 'bad' ? 0.12 : 0.25, now + at + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
			osc.connect(gain).connect(c.destination);
			osc.start(now + at);
			osc.stop(now + at + dur + 0.02);
		}
	} catch {
		// không phát được âm — vẫn còn rung + màu trên màn hình
	}
}

export function vibrate(tone: ScanTone) {
	navigator.vibrate?.(tone === 'ok' ? 120 : tone === 'warn' ? [80, 60, 80] : [200, 80, 200]);
}

export function readSoundPref(): boolean {
	try {
		return localStorage.getItem(SOUND_KEY) !== 'off';
	} catch {
		return true;
	}
}

export function writeSoundPref(on: boolean) {
	try {
		localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
	} catch {
		// chế độ ẩn danh / chặn lưu trữ — chỉ mất ghi nhớ lựa chọn
	}
}
