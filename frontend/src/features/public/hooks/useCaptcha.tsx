import { useCallback, useEffect, useRef, useState } from 'react';
import { solveChallenge } from '../../auth/utils/solveChallenge';
import { getCaptcha, type Captcha } from '../api/publicApi';
import HumanCheckbox, { type HumanCheckState } from '../components/HumanCheckbox';
import TurnstileWidget from '../components/TurnstileWidget';
import styles from '../pages/PublicPortal.module.css';

export type CaptchaPayload = { captcha_token: string; captcha_answer: string };

type PowStatus = 'loading' | 'solving' | 'done' | 'error';

// Làm mới mã trước khi hết hạn ngần này giây (form đề tài có thể điền rất lâu)
const RENEW_BEFORE_SEC = 30;
// Vòng xoay tối thiểu sau khi tích ô — lời giải thường đã xong từ trước
const MIN_SPIN_MS = 700;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Lỗi mạng / 502 (server đang khởi động lại, mất kết nối thoáng qua) thì fetch
// hoặc res.json() ném TypeError/SyntaxError → thử lại vài lần. Lỗi có thông báo
// từ server (vd quá giới hạn lượt) thì trả luôn để hiện cho người dùng.
async function getCaptchaWithRetry(attempts = 3): Promise<Captcha> {
	for (let i = 1; ; i++) {
		try {
			return await getCaptcha();
		} catch (err) {
			const transient = err instanceof TypeError || err instanceof SyntaxError;
			if (!transient || i >= attempts) throw err;
			await wait(1000 * i);
		}
	}
}

const errorText = (err: unknown) =>
	err instanceof TypeError || err instanceof SyntaxError
		? 'Không kết nối được máy chủ'
		: err instanceof Error && err.message
			? err.message
			: 'Xác minh thất bại';

// Chống bot dùng chung cho các form công khai. Server quyết định chế độ
// (proof-of-work hoặc Cloudflare Turnstile). Proof-of-work hiển thị như ô
// "Tôi không phải người máy" (reCAPTCHA / Turnstile): lời giải được tính ngầm
// trong Web Worker ngay khi mở trang, người dùng tích ô là có mã. Mỗi mã chỉ
// dùng được 1 lần: gọi reload() sau mỗi lần gửi form (thành công hay lỗi).
export function useCaptcha() {
	const [captcha, setCaptcha] = useState<Captcha | null>(null);
	const [nonce, setNonce] = useState('');
	const [powStatus, setPowStatus] = useState<PowStatus>('loading');
	const [turnstileToken, setTurnstileToken] = useState('');
	const [widgetKey, setWidgetKey] = useState(0);
	const [loadError, setLoadError] = useState('');
	const [checked, setChecked] = useState(false);
	const [spinning, setSpinning] = useState(false);
	const [powError, setPowError] = useState('');
	// Bỏ kết quả của lượt lấy / giải mã cũ khi đã reload
	const seq = useRef(0);

	const fetchCaptcha = useCallback(() => {
		const id = ++seq.current;
		const current = () => id === seq.current;
		return getCaptchaWithRetry()
			.then(async (c) => {
				if (!current()) return;
				setCaptcha(c);
				if (c.provider !== 'pow') return;
				setPowStatus('solving');
				const solved = await solveChallenge({ token: c.token, bits: c.bits });
				if (!current()) return;
				setNonce(solved);
				setPowStatus('done');
			})
			.catch((err: unknown) => {
				if (!current()) return;
				console.warn('[captcha]', err);
				setPowError(errorText(err));
				setPowStatus('error');
			});
	}, []);

	useEffect(() => {
		const ref = seq;
		void fetchCaptcha();
		return () => {
			ref.current++; // rời trang: bỏ kết quả đang giải dở
		};
	}, [fetchCaptcha]);

	// Lấy mã mới, giữ nguyên trạng thái ô đã tích (dùng khi mã sắp hết hạn)
	const renew = useCallback(() => {
		setNonce('');
		setPowStatus('loading');
		void fetchCaptcha();
	}, [fetchCaptcha]);

	const reload = useCallback(() => {
		setChecked(false);
		setTurnstileToken('');
		setLoadError('');
		setWidgetKey((k) => k + 1); // vẽ lại widget Turnstile → token mới
		renew();
	}, [renew]);

	const check = useCallback(() => {
		setChecked(true);
		setSpinning(true);
		window.setTimeout(() => setSpinning(false), MIN_SPIN_MS);
	}, []);

	// Tự lấy mã mới trước khi mã proof-of-work hết hạn
	useEffect(() => {
		if (captcha?.provider !== 'pow') return;
		const ms = Math.max(captcha.expires_in - RENEW_BEFORE_SEC, 30) * 1000;
		const t = window.setTimeout(renew, ms);
		return () => window.clearTimeout(t);
	}, [captcha, renew]);

	const checkState: HumanCheckState =
		powStatus === 'error'
			? 'error'
			: !checked
				? 'idle'
				: spinning || powStatus !== 'done'
					? 'verifying'
					: 'verified';

	// null = chưa hoàn tất xác nhận
	const payload: CaptchaPayload | null =
		captcha?.provider === 'turnstile'
			? turnstileToken
				? { captcha_token: turnstileToken, captcha_answer: '' }
				: null
			: captcha?.provider === 'pow' && checkState === 'verified' && nonce
				? { captcha_token: captcha.token, captcha_answer: nonce }
				: null;

	const field =
		captcha?.provider === 'turnstile' ? (
			<div className={styles.formGroup}>
				<TurnstileWidget
					key={widgetKey}
					siteKey={captcha.site_key}
					action={captcha.action}
					onToken={setTurnstileToken}
					onError={setLoadError}
				/>
				{loadError && (
					<span style={{ color: '#dc2626', fontSize: 13 }}>
						{loadError} — kiểm tra kết nối mạng rồi tải lại trang.
					</span>
				)}
			</div>
		) : (
			<div className={styles.formGroup}>
				<HumanCheckbox
					state={checkState}
					errorText={powError}
					onCheck={check}
					onRetry={() => {
						reload();
						check();
					}}
				/>
			</div>
		);

	return { payload, reload, field };
}
