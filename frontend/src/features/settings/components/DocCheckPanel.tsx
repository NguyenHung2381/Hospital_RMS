import { useCallback, useEffect, useState } from 'react';
import { WarnSvg } from '../../../assets/icons';
import { Badge, Button } from '../../../shared/components';
import { notify } from '../../../shared/utils/feedback';
import { settingsApi, type DocCheckStatus } from '../api/settingsApi';
import styles from '../pages/SystemSettings.module.css';

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

	return (
		<>
			<div className={styles.statusRow}>
				<Badge tone={!status.enabled ? 'gray' : status.worker_disabled || stuck ? 'amber' : 'green'} dot>
					{!status.enabled ? 'Đang tạm dừng' : status.worker_disabled ? 'Máy chủ tắt vòng xử lý' : stuck ? 'Hàng đợi bị kẹt' : 'Đang hoạt động'}
				</Badge>
				<Badge tone={status.ocr ? 'green' : 'amber'}>{status.ocr ? 'Có OCR (Tesseract)' : 'Chưa cài OCR'}</Badge>
				<Badge tone={waiting ? 'blue' : 'gray'}>Chờ kiểm: {waiting}</Badge>
				<Badge tone='gray'>Đã kiểm: {q.done}</Badge>
				{q.mismatch > 0 && <Badge tone='amber'>Có vẻ sai loại: {q.mismatch}</Badge>}
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
