// Web Worker giải thử thách đăng nhập — chạy ngoài luồng giao diện để trang
// không bị đơ trong lúc băm (có thể tới ~1 giây khi hệ thống đang bị dội).
import { solvePow } from './pow';

self.onmessage = (e: MessageEvent<{ token: string; bits: number }>) => {
	const { token, bits } = e.data;
	self.postMessage({ nonce: solvePow(token, bits) });
};
