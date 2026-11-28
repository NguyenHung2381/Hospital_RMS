import { KeySvg } from '@/assets/icons';
import { Toggle } from '@/shared/components/Input/Toggle';
import { formatDateVN } from '@/shared/utils/formatDate';
import { useId } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSigningStatus } from '../hooks/useSigningStatus';
import type { SigningFeature } from '../types/signing.type';
import styles from './SignToggle.module.css';

/**
 * Công tắc "Ký số" đặt cạnh nút xuất / tải / duyệt.
 *  - source='personal': ký bằng chứng thư cá nhân của người đang đăng nhập;
 *  - source='certificate': ký bằng chứng thư bệnh viện dành cho giấy chứng nhận.
 * Chưa có chứng thư thì công tắc khoá và chỉ chỗ khai báo; nơi dùng bị tắt thì không hiện.
 */
export function SignToggle({
	feature,
	source,
	checked,
	onChange,
	disabled,
	compact,
	hideWhenUnavailable,
	style,
}: {
	/** Nơi dùng — quản trị tắt ở Ký số → Cấu hình thì công tắc ẩn hẳn */
	feature: SigningFeature;
	source: 'personal' | 'certificate';
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
	/** Bỏ dòng mô tả (đặt trong thanh công cụ hẹp) */
	compact?: boolean;
	/** Ẩn hẳn khi chưa có chứng thư (màn hình học viên ngoài viện cũng dùng chung) */
	hideWhenUnavailable?: boolean;
	/** Khoảng cách / bề rộng đặt ngay trên khung (không cần bọc thêm thẻ) */
	style?: React.CSSProperties;
}) {
	const id = useId();
	const { pathname } = useLocation();
	const { data, isLoading } = useSigningStatus();
	const acc = data?.[source] ?? null;
	const ready = !!acc && acc.active;
	const profilePath = pathname.startsWith('/admin') ? '/admin/profile' : '/user/profile';

	let desc: React.ReactNode;
	if (isLoading) desc = 'Đang kiểm tra chứng thư…';
	else if (!acc)
		desc =
			source === 'personal' ? (
				<>
					Bạn chưa khai báo chứng thư số —{' '}
					<Link
						to={`${profilePath}#chu-ky-so`}
						className={styles.link}
					>
						khai báo ở Hồ sơ cá nhân
					</Link>
				</>
			) : (
				'Chưa cấu hình chứng thư bệnh viện (Quản trị → Ký số)'
			);
	else if (!acc.active) desc = 'Tài khoản ký số đang tạm ngưng';
	else
		desc = [
			acc.cert_subject?.match(/CN=([^,]+)/)?.[1] ?? acc.label,
			acc.cert_valid_to ? `hiệu lực đến ${formatDateVN(acc.cert_valid_to)}` : null,
		]
			.filter(Boolean)
			.join(' · ');

	if (data?.config && !data.config.features[feature]) return null;
	if (hideWhenUnavailable && (isLoading || !ready)) return null;

	const label = source === 'personal' ? 'Ký số bằng chứng thư của tôi' : 'Ký số bằng chứng thư bệnh viện';

	return (
		<div
			className={`${styles.row} ${checked && ready ? styles.rowOn : ''}`}
			style={style}
		>
			<span className={styles.icon}>
				<KeySvg />
			</span>
			<div className={styles.text}>
				<label
					htmlFor={id}
					className={styles.title}
				>
					{label}
				</label>
				{!compact && <div className={styles.desc}>{desc}</div>}
			</div>
			<Toggle
				id={id}
				on={checked && ready}
				disabled={disabled || !ready}
				onChange={() => onChange(!checked)}
				title={ready ? label : typeof desc === 'string' ? desc : 'Chưa khai báo chứng thư số'}
			/>
		</div>
	);
}
