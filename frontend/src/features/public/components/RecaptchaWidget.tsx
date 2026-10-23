import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Widget Google reCAPTCHA v2 "Tôi không phải người máy" (chỉ dùng khi server
// bật — xem backend utils/captcha.js). Script tải 1 lần cho cả trang, render
// thủ công (explicit) để vẽ lại được khi form cần mã mới sau mỗi lần gửi.
const ONLOAD_CALLBACK = '__rmsRecaptchaOnload';
const SCRIPT_SRC = `https://www.google.com/recaptcha/api.js?onload=${ONLOAD_CALLBACK}&render=explicit&hl=vi`;

type RecaptchaApi = {
	render: (
		el: HTMLElement,
		opts: {
			sitekey: string;
			callback: (token: string) => void;
			'expired-callback': () => void;
			'error-callback': () => void;
			theme?: 'light' | 'dark';
			size?: 'normal' | 'compact';
		},
	) => number;
	reset: (widgetId?: number) => void;
};

declare global {
	interface Window {
		grecaptcha?: RecaptchaApi;
		__rmsRecaptchaOnload?: () => void;
	}
}

let scriptPromise: Promise<RecaptchaApi> | null = null;

function loadRecaptcha(): Promise<RecaptchaApi> {
	// window.grecaptcha có thể đã tồn tại trước khi sẵn sàng → chỉ tin khi có render
	if (window.grecaptcha?.render) return Promise.resolve(window.grecaptcha);
	scriptPromise ??= new Promise((resolve, reject) => {
		window[ONLOAD_CALLBACK] = () =>
			window.grecaptcha ? resolve(window.grecaptcha) : reject(new Error('reCAPTCHA'));
		const s = document.createElement('script');
		s.src = SCRIPT_SRC;
		s.async = true;
		s.defer = true;
		s.onerror = () => {
			scriptPromise = null;
			s.remove();
			reject(new Error('Không tải được Google reCAPTCHA'));
		};
		document.head.appendChild(s);
	});
	return scriptPromise;
}

export default function RecaptchaWidget({
	siteKey,
	onToken,
	onError,
}: {
	siteKey: string;
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
		const host = ref.current;
		let cancelled = false;
		loadRecaptcha()
			.then((api) => {
				if (cancelled || !host) return;
				// grecaptcha không có hàm gỡ widget, và báo lỗi nếu render 2 lần vào
				// cùng 1 phần tử → mỗi lần vẽ dùng 1 thẻ con mới.
				const el = document.createElement('div');
				host.appendChild(el);
				api.render(el, {
					sitekey: siteKey,
					theme: 'light',
					callback: (t) => cb.current.onToken(t),
					// Token hết hạn sau ~2 phút: người dùng phải tích lại
					'expired-callback': () => cb.current.onToken(''),
					'error-callback': () => {
						cb.current.onToken('');
						cb.current.onError?.('Không kết nối được Google reCAPTCHA');
					},
				});
				setReady(true);
			})
			.catch((err: Error) => cb.current.onError?.(err.message));
		return () => {
			cancelled = true;
			if (host) host.replaceChildren();
		};
	}, [siteKey]);

	return (
		<div style={{ minHeight: 78 }}>
			{!ready && (
				<div
					style={{
						width: 304,
						maxWidth: '100%',
						height: 78,
						display: 'flex',
						alignItems: 'center',
						padding: '0 16px',
						border: '1px solid #d3d3d3',
						borderRadius: 3,
						background: '#f9f9f9',
						color: '#666',
						fontSize: 14,
						boxSizing: 'border-box',
					}}
				>
					Đang tải bước xác minh Google…
				</div>
			)}
			<div ref={ref} />
		</div>
	);
}
