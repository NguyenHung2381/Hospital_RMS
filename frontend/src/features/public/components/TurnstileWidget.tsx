import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Widget Cloudflare Turnstile (chỉ dùng khi server bật — xem backend
// utils/captcha.js). Script tải 1 lần cho cả trang, render thủ công (explicit)
// để gỡ / vẽ lại được khi form cần mã mới sau mỗi lần gửi.
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
	render: (
		el: HTMLElement,
		opts: {
			sitekey: string;
			callback: (token: string) => void;
			'expired-callback': () => void;
			'timeout-callback'?: () => void;
			'error-callback': () => void;
			action?: string;
			language?: string;
			theme?: 'light' | 'dark' | 'auto';
			size?: 'normal' | 'flexible' | 'compact';
			'refresh-expired'?: 'auto' | 'manual' | 'never';
			'refresh-timeout'?: 'auto' | 'manual' | 'never';
		},
	) => string;
	remove: (widgetId: string) => void;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
	if (window.turnstile) return Promise.resolve(window.turnstile);
	scriptPromise ??= new Promise((resolve, reject) => {
		const s = document.createElement('script');
		s.src = SCRIPT_SRC;
		s.async = true;
		s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile')));
		s.onerror = () => {
			scriptPromise = null;
			reject(new Error('Không tải được Turnstile'));
		};
		document.head.appendChild(s);
	});
	return scriptPromise;
}

export default function TurnstileWidget({
	siteKey,
	action,
	onToken,
	onError,
}: {
	siteKey: string;
	/** Phải khớp TURNSTILE_ACTION ở backend utils/captcha.js */
	action?: string;
	/** Token mới khi người dùng qua thử thách; '' khi token hết hạn / lỗi */
	onToken: (token: string) => void;
	onError?: (message: string) => void;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [ready, setReady] = useState(false);
	// Giữ callback mới nhất mà không phải vẽ lại widget mỗi lần render
	const cb = useRef({ onToken, onError });
	useLayoutEffect(() => {
		cb.current = { onToken, onError };
	});

	useEffect(() => {
		let widgetId: string | null = null;
		let cancelled = false;
		loadTurnstile()
			.then((api) => {
				if (cancelled || !ref.current) return;
				widgetId = api.render(ref.current, {
					sitekey: siteKey,
					action,
					language: 'vi',
					theme: 'light',
					size: 'flexible',
					// Token hết hạn (~5 phút) / thử thách quá giờ: widget tự làm mới
					'refresh-expired': 'auto',
					'refresh-timeout': 'auto',
					callback: (t) => cb.current.onToken(t),
					'expired-callback': () => cb.current.onToken(''),
					'timeout-callback': () => cb.current.onToken(''),
					'error-callback': () => cb.current.onToken(''),
				});
				setReady(true);
			})
			.catch((err: Error) => cb.current.onError?.(err.message));
		return () => {
			cancelled = true;
			if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
		};
	}, [siteKey, action]);

	return (
		<div style={{ maxWidth: 320, minHeight: 65 }}>
			{!ready && (
				<div
					style={{
						height: 65,
						display: 'flex',
						alignItems: 'center',
						padding: '0 16px',
						border: '1px solid #e0e0e0',
						borderRadius: 4,
						background: '#fafafa',
						color: '#666',
						fontSize: 14,
					}}
				>
					Đang tải bước xác minh Cloudflare…
				</div>
			)}
			<div ref={ref} />
		</div>
	);
}
