import { useState } from 'react';
import { CheckCircleSvg, WarnSvg } from '../../../assets/icons';
import { Button } from '../../../shared/components';
import { cx } from '../../../shared/utils/cx';
import RecaptchaWidget from '../../public/components/RecaptchaWidget';
import { settingsApi } from '../api/settingsApi';
import styles from '../pages/SystemSettings.module.css';
import ps from './RecaptchaTestPanel.module.css';

type Result = { ok: boolean; message: string };

/**
 * Kiểm tra Google reCAPTCHA bằng khóa ĐÃ LƯU (Cấu hình hệ thống → Bảo mật & Tài khoản).
 * Tích ô rồi bấm Kiểm tra: máy chủ đem token thật đi xác minh ⇒ biết cặp khóa, tên miền và
 * kết nối tới Google có ổn không. Chưa tích: chỉ thử máy chủ gọi được Google. Mỗi token
 * chỉ xác minh được 1 lần nên sau mỗi lần thử vẽ lại ô tích.
 */
export default function RecaptchaTestPanel({ siteKey, dirty }: { siteKey: string; dirty: boolean }) {
	const [token, setToken] = useState('');
	const [widgetKey, setWidgetKey] = useState(0);
	const [widgetError, setWidgetError] = useState('');
	const [testing, setTesting] = useState(false);
	const [result, setResult] = useState<Result | null>(null);

	const run = async () => {
		setTesting(true);
		try {
			const r = await settingsApi.testRecaptcha(token || undefined);
			setResult({ ok: true, message: r.message });
		} catch (e) {
			setResult({ ok: false, message: e instanceof Error ? e.message : 'Kiểm tra thất bại' });
		} finally {
			setTesting(false);
			setToken('');
			setWidgetKey((k) => k + 1);
		}
	};

	const note = dirty
		? 'Lưu thay đổi trước khi kiểm tra'
		: !siteKey
			? 'Đang dùng kiểm tra chạy ngầm — điền đủ 2 khóa và lưu để bật reCAPTCHA.'
			: token
				? 'Bấm Kiểm tra để thử cả cặp khóa, tên miền và kết nối tới Google.'
				: 'Tích ô để thử cả cặp khóa. Không tích thì chỉ thử máy chủ gọi được Google.';

	return (
		<>
			{siteKey && !dirty && (
				<div className={ps.widget}>
					<RecaptchaWidget
						key={`${siteKey}:${widgetKey}`}
						siteKey={siteKey}
						onToken={(t) => {
							setToken(t);
							if (t) setWidgetError('');
						}}
						onError={setWidgetError}
					/>
					{widgetError && (
						<span className={styles.toolHint}>
							{widgetError} — kiểm tra Site key và tên miền đã khai báo ở trang quản trị reCAPTCHA.
						</span>
					)}
				</div>
			)}
			<div className={styles.toolRow}>
				<Button variant='secondary' loading={testing} disabled={!siteKey || dirty} onClick={run}>
					Kiểm tra
				</Button>
				<span className={dirty || !siteKey ? styles.toolHint : styles.toolNote}>{note}</span>
			</div>
			{result && (
				<div className={cx(ps.result, result.ok && ps.ok)} role='status'>
					{result.ok ? <CheckCircleSvg aria-hidden /> : <WarnSvg aria-hidden />}
					<span>{result.message}</span>
				</div>
			)}
		</>
	);
}
