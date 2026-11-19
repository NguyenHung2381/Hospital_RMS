import { useCallback, useEffect, useState } from 'react';
import {
	requestRegistrationEmailOtp,
	verifyRegistrationEmailOtp,
	type EmailOtpPayload,
} from '../api/publicApi';

// Chờ ngần này giây giữa 2 lần gửi mã (máy chủ cũng giới hạn, đây chỉ để người dùng khỏi bấm dồn)
export const OTP_RESEND_SEC = 60;
// email_token sống 30 phút ở máy chủ — coi như hết hạn sớm 1 phút để khỏi gửi form rồi mới bị từ chối
const TOKEN_TTL_MS = 29 * 60_000;

const norm = (email: string) => email.trim().toLowerCase();

interface Challenge {
	id: string;
	email: string;
	toMasked: string;
	ttlMin: number;
}
interface Verified {
	token: string;
	email: string;
	at: number;
}

/**
 * Xác minh email bằng mã 6 số. Token xác minh chỉ nằm trong bộ nhớ (không vào bản
 * nháp): tải lại trang thì xác minh lại.
 */
export function useEmailOtp() {
	const [challenge, setChallenge] = useState<Challenge | null>(null);
	const [verified, setVerified] = useState<Verified | null>(null);
	const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
	const [error, setError] = useState('');
	const [resendAt, setResendAt] = useState(0);
	const [now, setNow] = useState(() => Date.now());

	// Đồng hồ chỉ chạy khi đang đếm ngược gửi lại
	useEffect(() => {
		if (resendAt <= Date.now()) return;
		const t = window.setInterval(() => {
			setNow(Date.now());
			if (Date.now() >= resendAt) window.clearInterval(t);
		}, 1000);
		return () => window.clearInterval(t);
	}, [resendAt]);

	const send = useCallback(async (payload: EmailOtpPayload) => {
		setBusy('send');
		setError('');
		try {
			const res = await requestRegistrationEmailOtp(payload);
			setChallenge({ id: res.challenge_id, email: norm(payload.email), toMasked: res.to_masked, ttlMin: res.ttl_min });
			setVerified(null);
			setNow(Date.now());
			setResendAt(Date.now() + OTP_RESEND_SEC * 1000);
			return true;
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Không gửi được mã, vui lòng thử lại');
			return false;
		} finally {
			setBusy(null);
		}
	}, []);

	const verify = useCallback(
		async (code: string) => {
			if (!challenge) return false;
			setBusy('verify');
			setError('');
			try {
				const res = await verifyRegistrationEmailOtp(challenge.id, code.trim());
				setVerified({ token: res.email_token, email: challenge.email, at: Date.now() });
				return true;
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Mã không đúng hoặc đã hết hạn');
				return false;
			} finally {
				setBusy(null);
			}
		},
		[challenge],
	);

	const reset = useCallback(() => {
		setChallenge(null);
		setVerified(null);
		setError('');
		setResendAt(0);
	}, []);

	/** Đã xác minh đúng email này (chưa tính hạn — hạn kiểm ở takeToken lúc gửi) */
	const verifiedFor = (email: string) => !!verified && verified.email === norm(email);

	/** Token còn dùng được cho email này, null nếu chưa xác minh / đổi email / quá hạn. Gọi trong handler. */
	const takeToken = (email: string) =>
		verified && verified.email === norm(email) && Date.now() - verified.at < TOKEN_TTL_MS ? verified.token : null;

	return {
		challenge,
		busy,
		error,
		setError,
		cooldown: Math.max(0, Math.ceil((resendAt - now) / 1000)),
		verifiedFor,
		takeToken,
		send,
		verify,
		reset,
	};
}
