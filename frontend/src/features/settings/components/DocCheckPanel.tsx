import { useCallback, useEffect, useState } from 'react';
import { WarnSvg } from '../../../assets/icons';
import { Badge, Button } from '../../../shared/components';
import { cx } from '../../../shared/utils/cx';
import { notify } from '../../../shared/utils/feedback';
import { settingsApi, type DocCheckStatus } from '../api/settingsApi';
import styles from '../pages/SystemSettings.module.css';
import ps from './DocCheckPanel.module.css';

const SIG_KEY = 'TRAINING_DOC_SIGNATURE_CHECK';

// Việc chờ quá ngần này mà công tắc đang bật ⇒ có vẻ không tiến trình nào chạy vòng xử lý
// (vòng quét lại mỗi 30 giây; 1 file thường xong trong vài giây).
const STUCK_MIN = 10;

const ago = (min: number | null) =>
	min === null ? 'chưa có' : min < 1 ? 'vừa xong' : min < 60 ? `${min} phút trước` : min < 1440 ? `${Math.floor(min / 60)} giờ trước` : `${Math.floor(min / 1440)} ngày trước`;

/**
 * Trạng thái tự kiểm tra file hồ sơ đăng ký khóa ĐTLT (OCR / mã QR) ở Cấu hình hệ thống:
 * máy chủ có OCR không, vòng xử lý có chạy không, hàng đợi còn bao nhiêu, file lỗi để thử lại.
 * Đọc trạng thái ĐÃ LƯU — đổi công tắc thì bấm Lưu rồi Làm mới.
 */
export default function DocCheckPanel() {
	const [status, setStatus] = useState<DocCheckStatus | null>(null);
	const [failed, setFailed] = useState(false);
	const [loading, setLoading] = useState(false);
	const [retrying, setRetrying] = useState(false);
	const [savingSig, setSavingSig] = useState(false);

	// Chỉ setState trong callback của promise (không gọi đồng bộ trong effect)
	const fetchStatus = useCallback(
		() =>
			settingsApi
				.docCheckStatus()
				.then((s) => {
					setStatus(s);
					setFailed(false);
				})
				.catch(() => setFailed(true))
				.finally(() => setLoading(false)),
		[],
	);
	const load = () => {
		setLoading(true);
		void fetchStatus();
	};

	useEffect(() => {
		void fetchStatus();
	}, [fetchStatus]);

	const retry = async () => {
		setRetrying(true);
		try {
			const r = await settingsApi.retryDocCheck();
			notify.success(r.requeued ? `Đã đưa ${r.requeued} file vào hàng đợi kiểm tra lại` : 'Không có file lỗi cần kiểm tra lại');
			load();
		} catch (e) {
			notify.error(e instanceof Error ? e.message : 'Không thử lại được');
		} finally {
			setRetrying(false);
		}
	};

	// Công tắc kiểm chữ ký: lưu ngay (không qua nút Lưu của trang), cùng cách công tắc ở hộp
	// "Link đăng ký" — trang Cấu hình hệ thống không có ô riêng cho khóa này.
	const toggleSignature = async (on: boolean) => {
		if (!status || savingSig) return;
		const prev = status;
		setSavingSig(true);
		setStatus({ ...status, signature_enabled: on });
		try {
			await settingsApi.update(SIG_KEY, String(on));
			notify.success(on ? 'Đã bật kiểm tra chữ ký' : 'Đã tắt kiểm tra chữ ký');
			load();
		} catch (e) {
			setStatus(prev);
			notify.error(e instanceof Error ? e.message : 'Không lưu được cài đặt');
		} finally {
			setSavingSig(false);
		}
	};

	if (failed && !status) {
		return (
			<div className={styles.toolRow}>
				<span className={styles.toolHint}>Không tải được trạng thái tự kiểm tra file hồ sơ.</span>
				<Button variant='secondary' size='sm' loading={loading} onClick={load}>
					Thử lại
				</Button>
			</div>
		);
	}
	if (!status) return <div className={styles.toolRow}><span className={styles.toolNote}>Đang tải trạng thái tự kiểm tra…</span></div>;

	const { queue: q } = status;
	const waiting = q.pending + q.running;
	const stuck = status.enabled && !status.worker_disabled && q.oldest_pending_min !== null && q.oldest_pending_min >= STUCK_MIN;
	const warns: string[] = [];
	if (status.worker_disabled)
		warns.push('Máy chủ đặt DOC_CHECK_ENABLED=false nên không kiểm file nào, dù công tắc đang bật. Bỏ biến này trong .env rồi khởi động lại để chạy.');
	else if (stuck)
		warns.push(
			`Có file chờ kiểm đã ${ago(q.oldest_pending_min)} mà chưa được xử lý — có vẻ không tiến trình nào chạy job nền (kiểm tra JOBS_ENABLED và log "[doc_check]").`,
		);
	if (!status.ocr)
		warns.push(
			`Máy chủ chưa có Tesseract (gói tiếng Việt) nên chỉ kiểm được PDF có sẵn chữ và ảnh có mã QR${q.skipped_ocr ? ` — ${q.skipped_ocr} file đang bị bỏ qua, sẽ tự kiểm lại khi cài OCR và khởi động lại` : ''}.`,
		);

	const sigOn = status.signature_enabled;
	const sigLocked = !status.enabled;

	return (
		<>
			<div className={ps.sigRow}>
				<div className={cx(styles.tile, sigOn && !sigLocked && styles.tileOn)}>
					<div className={styles.tileHead}>
						<label className={styles.label} htmlFor={SIG_KEY}>
							Kiểm tra chữ ký trên hồ sơ
						</label>
						<label className={styles.switch}>
							<span className={cx(styles.switchText, sigOn && styles.switchTextOn)}>{sigOn ? 'Bật' : 'Tắt'}</span>
							<input
								id={SIG_KEY}
								type='checkbox'
								role='switch'
								checked={sigOn}
								disabled={sigLocked || savingSig}
								aria-describedby={sigLocked ? `${SIG_KEY}-locked` : undefined}
								onChange={(e) => void toggleSignature(e.target.checked)}
							/>
							<span className={styles.track} />
						</label>
					</div>
					<p className={styles.hint}>
						Cảnh báo người duyệt khi giấy tờ thiếu chữ ký số hợp lệ hoặc thiếu dấu đỏ / chữ ký tay — chỉ cảnh báo, không tự từ chối.
					</p>
					{sigLocked && (
						<p id={`${SIG_KEY}-locked`} className={styles.toolHint}>
							Cần bật và lưu "Tự kiểm tra file hồ sơ" trước — kiểm chữ ký chạy chung vòng xử lý đó.
						</p>
					)}
					<details className={styles.more}>
						<summary>Xem thêm</summary>
						<p>
							Kiểm chữ ký số trong file PDF (còn nguyên vẹn, chứng thư do CA tin cậy cấp) và dò dấu đỏ, chữ ký tay trên bản scan — áp dụng cho hồ sơ đăng ký khóa ĐTLT và
							hồ sơ học viên. Lưu ngay khi bấm, không cần nút Lưu. Hồ sơ đăng ký đã kiểm trong lúc tắt sẽ không tự kiểm lại chữ ký khi bật.
						</p>
					</details>
				</div>
			</div>
			<div className={styles.statusRow}>
				<Badge tone={!status.enabled ? 'gray' : status.worker_disabled || stuck ? 'amber' : 'green'} dot>
					{!status.enabled ? 'Đang tạm dừng' : status.worker_disabled ? 'Máy chủ tắt vòng xử lý' : stuck ? 'Hàng đợi bị kẹt' : 'Đang hoạt động'}
				</Badge>
				<Badge tone={status.ocr ? 'green' : 'amber'}>{status.ocr ? 'Có OCR (Tesseract)' : 'Chưa cài OCR'}</Badge>
				<Badge tone={waiting ? 'blue' : 'gray'}>Chờ kiểm: {waiting}</Badge>
				<Badge tone='gray'>Đã kiểm: {q.done}</Badge>
				{q.mismatch > 0 && <Badge tone='amber'>Có vẻ sai loại: {q.mismatch}</Badge>}
				{(sigOn || q.sig_invalid > 0) && (
					<Badge tone={q.sig_invalid ? 'amber' : 'gray'}>Chữ ký số không hợp lệ: {q.sig_invalid}</Badge>
				)}
				{(sigOn || q.sig_missing > 0) && <Badge tone={q.sig_missing ? 'amber' : 'gray'}>Thiếu dấu / chữ ký: {q.sig_missing}</Badge>}
				{q.error > 0 && <Badge tone='red'>Lỗi: {q.error}</Badge>}
				{q.skipped > 0 && <Badge tone='gray'>Bỏ qua: {q.skipped}</Badge>}
			</div>
			{warns.map((w) => (
				<div key={w} className={styles.statusWarn}>
					<WarnSvg /> <span>{w}</span>
				</div>
			))}
			<div className={styles.toolRow}>
				<Button variant='secondary' size='sm' loading={loading} onClick={load}>
					Làm mới
				</Button>
				{q.error > 0 && (
					<Button variant='secondary' size='sm' loading={retrying} onClick={retry}>
						Kiểm tra lại {q.error} file lỗi
					</Button>
				)}
				<span className={styles.toolNote}>Lần kiểm gần nhất: {ago(q.last_checked_min)}. Trạng thái theo cấu hình đã lưu.</span>
			</div>
		</>
	);
}
