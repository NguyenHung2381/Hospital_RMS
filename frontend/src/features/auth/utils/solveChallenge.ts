import { solvePow } from './pow';

export interface LoginChallenge {
	token: string;
	bits: number;
}

// Giải thử thách trong Web Worker; trình duyệt không tạo được worker (CSP,
// trình duyệt cũ) thì giải ngay trên luồng chính.
export function solveChallenge({ token, bits }: LoginChallenge): Promise<string> {
	return new Promise((resolve, reject) => {
		const fallback = () => {
			const nonce = solvePow(token, bits);
			if (nonce) resolve(nonce);
			else reject(new Error('Không giải được thử thách bảo mật, vui lòng thử lại'));
		};
		let worker: Worker;
		try {
			worker = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });
		} catch {
			fallback();
			return;
		}
		worker.onmessage = (e: MessageEvent<{ nonce: string | null }>) => {
			worker.terminate();
			if (e.data.nonce) resolve(e.data.nonce);
			else reject(new Error('Không giải được thử thách bảo mật, vui lòng thử lại'));
		};
		worker.onerror = () => {
			worker.terminate();
			fallback();
		};
		worker.postMessage({ token, bits });
	});
}
