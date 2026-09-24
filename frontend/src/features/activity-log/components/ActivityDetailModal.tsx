import { CopySvg } from '@/assets/icons';
import { Modal } from '../../../shared/components';
import type { ActivityLog } from '../api/activityLogApi';
import styles from '../pages/ActivityLogs.module.css';
import {
	IP_KIND_LABEL,
	STATUS_TEXT,
	actorDisplay,
	durationLevel,
	formatBytes,
	formatDateTimeSec,
	formatDuration,
	parseUserAgent,
	prettyJson,
	queryParams,
} from '../utils';

interface Props {
	row: ActivityLog | null;
	onClose: () => void;
	onFilterActor: (actor: string) => void;
	onFilterIp: (ip: string) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className={styles.dField}>
			<div className={styles.dLabel}>{label}</div>
			<div className={styles.dValue}>{children ?? '—'}</div>
		</div>
	);
}

export function ActivityDetailModal({ row, onClose, onFilterActor, onFilterIp }: Props) {
	if (!row) return null;
	const ua = parseUserAgent(row.user_agent);
	const body = prettyJson(row.body);
	const qp = queryParams(row.path);
	const code = row.status_code ?? 0;
	const lvl = durationLevel(row.duration_ms);

	return (
		<Modal
			open
			onClose={onClose}
			title='Chi tiết thao tác'
			size='lg'
		>
			<div className={styles.dHero}>
				<span className={`${styles.actionBadge} ${styles[`action_${row.action}`] ?? ''}`}>
					{row.action_label}
				</span>
				<div className={styles.dHeroText}>
					<div className={styles.dHeroTitle}>{row.summary}</div>
					<div className={styles.dHeroSub}>
						{actorDisplay(row)} · {formatDateTimeSec(row.created_at)}
					</div>
				</div>
			</div>

			{row.error && (
				<div className={styles.dError}>
					<strong>Lỗi trả về:</strong> {row.error}
				</div>
			)}

			<h4 className={styles.dSection}>Người thực hiện</h4>
			<div className={styles.dGrid}>
				<Field label='Họ tên'>{row.actor_name}</Field>
				<Field label='Tài khoản'>{row.actor_username}</Field>
				<Field label='Mã nhân viên'>{row.actor_id}</Field>
				<Field label='Mã vai trò'>{row.role_id}</Field>
			</div>
			{(row.actor_id || row.actor_username) && (
				<button
					className={styles.linkBtn}
					onClick={() => onFilterActor(row.actor_id || row.actor_username || '')}
				>
					Xem mọi thao tác của người này →
				</button>
			)}

			<h4 className={styles.dSection}>Kết quả</h4>
			<div className={styles.dGrid}>
				<Field label='Trạng thái'>
					<span className={code && code < 400 ? styles.statusOk : styles.statusErr}>
						{code || '—'}
					</span>{' '}
					{STATUS_TEXT[code] ?? ''}
				</Field>
				<Field label='Thời gian xử lý'>
					<span className={`${styles.duration} ${styles[`dur_${lvl}`]}`}>
						{formatDuration(row.duration_ms)}
					</span>
				</Field>
				<Field label='Dung lượng phản hồi'>{formatBytes(row.response_bytes)}</Field>
				<Field label='Mã bản ghi tác động'>{row.target_id ?? row.result_id}</Field>
			</div>

			<h4 className={styles.dSection}>Yêu cầu (API)</h4>
			<div className={styles.dGrid}>
				<Field label='Phân hệ'>{row.module_label}</Field>
				<Field label='Phương thức'>
					<span className={`${styles.methodBadge} ${styles[`method_${row.method}`] ?? ''}`}>
						{row.method}
					</span>
				</Field>
			</div>
			<Field label='Đường dẫn đầy đủ'>
				<code className={styles.codeInline}>{row.path}</code>
				<button
					className={styles.iconBtn}
					title='Sao chép'
					onClick={() => navigator.clipboard?.writeText(row.path)}
				>
					<CopySvg style={{ width: 13, height: 13 }} />
				</button>
			</Field>
			{row.route && (
				<Field label='Mẫu endpoint'>
					<code className={styles.codeInline}>{row.route}</code>
				</Field>
			)}
			{qp.length > 0 && (
				<Field label='Tham số truy vấn'>
					<table className={styles.kvTable}>
						<tbody>
							{qp.map(([k, v], i) => (
								<tr key={`${k}-${i}`}>
									<td>{k}</td>
									<td>{v}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Field>
			)}

			<h4 className={styles.dSection}>Dữ liệu gửi lên</h4>
			{body ? (
				<pre className={styles.jsonBlock}>{body}</pre>
			) : (
				<div className={styles.dMuted}>Không có dữ liệu gửi kèm (thao tác xem hoặc không có body).</div>
			)}
			{row.files && row.files.length > 0 && (
				<Field label='Tệp tải lên'>
					<ul className={styles.fileList}>
						{row.files.map((f, i) => (
							<li key={i}>
								{f.name} <span className={styles.dMuted}>({formatBytes(f.size)}, {f.type})</span>
							</li>
						))}
					</ul>
				</Field>
			)}
			<div className={styles.dHint}>Mật khẩu, token, mã OTP được tự động che bằng [hidden].</div>

			<h4 className={styles.dSection}>Thiết bị & mạng</h4>
			<div className={styles.dGrid}>
				<Field label='Địa chỉ IP'>
					{row.ip_address}{' '}
					<span className={styles.dMuted}>({IP_KIND_LABEL[row.ip_kind]})</span>
					{row.ip_address && (
						<button
							className={styles.linkBtn}
							onClick={() => onFilterIp(row.ip_address!)}
						>
							Lọc theo IP này
						</button>
					)}
				</Field>
				<Field label='Chuỗi proxy (X-Forwarded-For)'>{row.forwarded_for}</Field>
				<Field label='Trình duyệt'>{ua?.browser}</Field>
				<Field label='Hệ điều hành / thiết bị'>{ua ? `${ua.os} · ${ua.device}` : null}</Field>
			</div>
			{row.referer && (
				<Field label='Trang đang mở (Referer)'>
					<code className={styles.codeInline}>{row.referer}</code>
				</Field>
			)}
			{row.user_agent && (
				<Field label='User-Agent đầy đủ'>
					<code className={styles.codeInline}>{row.user_agent}</code>
				</Field>
			)}
			{row.ip_kind === 'private' && (
				<div className={styles.dHint}>
					IP nội bộ (10.x, 172.16–31.x, 192.168.x) thường là IP của gateway Docker / proxy,
					không phải máy người dùng — khi truy cập qua Docker Desktop hoặc proxy chưa chuyển
					tiếp X-Forwarded-For thì mọi người đều hiện chung 1 IP này.
				</div>
			)}
		</Modal>
	);
}
