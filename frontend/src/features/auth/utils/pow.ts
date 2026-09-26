// Giải thử thách proof-of-work của lá chắn đăng nhập (backend/src/utils/loginShield.js):
// tìm `nonce` sao cho SHA-256("<token>:<nonce>") có ít nhất `bits` bit 0 ở đầu.
//
// Tự cài SHA-256 thay vì crypto.subtle.digest: subtle là async, mỗi lần gọi tốn
// vài micro-giây chờ Promise — chậm hơn nhiều lần với hàng trăm nghìn phép hash
// nhỏ. Các khối 64 byte đầy đủ của "<token>:" chỉ băm 1 lần (midstate), mỗi
// nonce chỉ còn băm 1–2 khối cuối.

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
	0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
	0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
	0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
	0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INIT = new Uint32Array([
	0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const W = new Uint32Array(64);

// Nén 1 khối 64 byte (block[off..off+64]) vào state (ghi đè state)
function compress(state: Uint32Array, block: Uint8Array, off: number): void {
	for (let i = 0; i < 16; i++) {
		const j = off + i * 4;
		W[i] = (block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3];
	}
	for (let i = 16; i < 64; i++) {
		const w15 = W[i - 15];
		const w2 = W[i - 2];
		const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
		const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
		W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
	}
	let a = state[0];
	let b = state[1];
	let c = state[2];
	let d = state[3];
	let e = state[4];
	let f = state[5];
	let g = state[6];
	let h = state[7];
	for (let i = 0; i < 64; i++) {
		const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
		const ch = (e & f) ^ (~e & g);
		const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
		const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
		const maj = (a & b) ^ (a & c) ^ (b & c);
		const t2 = (S0 + maj) | 0;
		h = g;
		g = f;
		f = e;
		e = (d + t1) | 0;
		d = c;
		c = b;
		b = a;
		a = (t1 + t2) | 0;
	}
	state[0] = (state[0] + a) | 0;
	state[1] = (state[1] + b) | 0;
	state[2] = (state[2] + c) | 0;
	state[3] = (state[3] + d) | 0;
	state[4] = (state[4] + e) | 0;
	state[5] = (state[5] + f) | 0;
	state[6] = (state[6] + g) | 0;
	state[7] = (state[7] + h) | 0;
}

function leadingZeroBitsOfWord(word: number): number {
	return Math.clz32(word);
}

// Số bit 0 ở đầu của digest (state sau khi băm xong, big-endian)
export function leadingZeroBits(state: Uint32Array): number {
	let bits = 0;
	for (let i = 0; i < 8; i++) {
		const z = leadingZeroBitsOfWord(state[i] >>> 0);
		bits += z;
		if (z < 32) break;
	}
	return bits;
}

const encoder = new TextEncoder();

// SHA-256 đầy đủ — dùng cho kiểm thử, trả hex
export function sha256Hex(message: string): string {
	const state = hashBytes(encoder.encode(message));
	return Array.from(state, (w) => (w >>> 0).toString(16).padStart(8, '0')).join('');
}

function hashBytes(bytes: Uint8Array): Uint32Array {
	const state = new Uint32Array(INIT);
	const full = bytes.length - (bytes.length % 64);
	for (let off = 0; off < full; off += 64) compress(state, bytes, off);
	finish(state, bytes.subarray(full), bytes.length);
	return state;
}

const tailBuf = new Uint8Array(128);

// Băm phần cuối + padding; totalLen = độ dài toàn bộ thông điệp
function finish(state: Uint32Array, tailIn: Uint8Array, totalLen: number): void {
	let off = 0;
	while (tailIn.length - off >= 64) {
		compress(state, tailIn, off);
		off += 64;
	}
	const tail = tailIn.subarray(off);
	tailBuf.fill(0);
	tailBuf.set(tail);
	tailBuf[tail.length] = 0x80;
	const blocks = tail.length + 9 > 64 ? 2 : 1;
	const end = blocks * 64;
	const bitLen = totalLen * 8;
	// Độ dài bit 64-bit big-endian (thông điệp ở đây luôn < 2^32 bit)
	tailBuf[end - 4] = (bitLen >>> 24) & 0xff;
	tailBuf[end - 3] = (bitLen >>> 16) & 0xff;
	tailBuf[end - 2] = (bitLen >>> 8) & 0xff;
	tailBuf[end - 1] = bitLen & 0xff;
	tailBuf[end - 5] = Math.floor(bitLen / 2 ** 32) & 0xff;
	compress(state, tailBuf, 0);
	if (blocks === 2) compress(state, tailBuf, 64);
}

// Tìm nonce (base36) thoả thử thách. maxTries chặn vòng lặp vô hạn.
export function solvePow(token: string, bits: number, maxTries = 2 ** 28): string | null {
	const prefix = encoder.encode(`${token}:`);
	const full = prefix.length - (prefix.length % 64);
	const mid = new Uint32Array(INIT);
	for (let off = 0; off < full; off += 64) compress(mid, prefix, off);
	const rest = prefix.subarray(full);

	const tail = new Uint8Array(rest.length + 24);
	tail.set(rest);
	const state = new Uint32Array(8);
	for (let n = 0; n < maxTries; n++) {
		const nonce = n.toString(36);
		for (let i = 0; i < nonce.length; i++) tail[rest.length + i] = nonce.charCodeAt(i);
		const len = rest.length + nonce.length;
		state.set(mid);
		finish(state, tail.subarray(0, len), full + len);
		if (leadingZeroBits(state) >= bits) return nonce;
	}
	return null;
}
