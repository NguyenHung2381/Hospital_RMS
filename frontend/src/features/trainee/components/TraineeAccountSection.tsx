import { useState } from 'react';
import { KeySvg } from '@/assets/icons';
import { showToast } from '@/shared/utils/feedback';
import {
	grantTraineeAccounts,
	resetTraineeAccountPassword,
	setTraineeAccountActive,
	type GrantedTraineeAccount,
} from '../api/traineeApi';
import type { Trainee } from '../types/trainee.type';
import { GrantedAccountsModal } from './GrantedAccountsModal';
import ds from '../pages/TraineeDetail.module.css';
import styles from '../pages/Trainees.module.css';

/**
 * Tài khoản đăng nhập của học viên — CẤP RIÊNG, không gộp vào tài khoản nội viện
 * (không hiện ở trang Quản lý người dùng). Cấp / khoá / đặt lại mật khẩu ngay tại đây.
 */
export function TraineeAccountSection({
	trainee,
	canManage,
	onChanged,
}: {
	trainee: Trainee;
	canManage: boolean;
	onChanged: () => void;
}) {
	const [busy, setBusy] = useState(false);
	// Mật khẩu chỉ hiện một lần (sau khi cấp / đặt lại) để sao chép gửi học viên
	const [shown, setShown] = useState<GrantedTraineeAccount[]>([]);
	const granted = trainee.account_granted && !!trainee.account_username;
	const active = trainee.account_active !== false;

	const run = async (action: () => Promise<void>, fallback: string) => {
		setBusy(true);
		try {
			await action();
			onChanged();
		} catch (err) {
			showToast('error', err instanceof Error ? err.message : fallback);
		} finally {
			setBusy(false);
		}
	};

	const grant = () =>
		run(async () => {
			const r = await grantTraineeAccounts([trainee.id]);
			if (r.credentials.length) {
				setShown(r.credentials);
				showToast('success', 'Đã cấp tài khoản học viên');
			} else {
				showToast('error', r.skipped[0]?.reason ?? 'Không cấp được tài khoản');
			}
		}, 'Cấp tài khoản thất bại');

	const reset = () => {
		if (!window.confirm(`Đặt lại mật khẩu tài khoản ${trainee.account_username} về mặc định? Học viên sẽ bị đăng xuất khỏi mọi phiên.`))
			return;
		void run(async () => {
			const r = await resetTraineeAccountPassword(trainee.id);
			if (r?.temporary_password && trainee.user_id && trainee.account_username) {
				setShown([
					{
						trainee_id: trainee.id,
						user_id: trainee.user_id,
						username: trainee.account_username,
						full_name: trainee.full_name,
						password_plain: r.temporary_password,
					},
				]);
			}
			showToast('success', 'Đã đặt lại mật khẩu');
		}, 'Đặt lại mật khẩu thất bại');
	};

	const toggle = () => {
		if (active && !window.confirm(`Khoá tài khoản ${trainee.account_username}? Học viên sẽ không đăng nhập được.`))
			return;
		void run(async () => {
			await setTraineeAccountActive(trainee.id, !active);
			showToast('success', active ? 'Đã khoá tài khoản' : 'Đã mở khoá tài khoản');
		}, 'Cập nhật tài khoản thất bại');
	};

	return (
		<section className={ds.infoSection}>
			<h3 className={ds.infoSectionTitle}>Tài khoản học viên</h3>
			<div className={ds.infoGrid}>
				<div className={ds.infoItem}>
					<span className={ds.factLabel}>Tên đăng nhập</span>
					<span className={granted ? ds.infoValue : ds.infoEmpty}>
						{granted ? trainee.account_username : 'Chưa cấp'}
					</span>
				</div>
				{granted && (
					<div className={ds.infoItem}>
						<span className={ds.factLabel}>Trạng thái</span>
						<span>
							<span className={active ? ds.chipDone : ds.chipMissing}>
								{active ? 'Đang hoạt động' : 'Đã khoá'}
							</span>
						</span>
					</div>
				)}
				<div className={`${ds.infoItem} ${ds.infoItemFull}`}>
					<span className={ds.factLabel}>
						Tài khoản học viên được cấp riêng, tách khỏi tài khoản nội viện — kể cả học viên là nhân
						viên bệnh viện. Mật khẩu mặc định là tên đăng nhập, phải đổi ở lần đăng nhập đầu.
					</span>
				</div>
			</div>
			{canManage && (
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
					{!granted ? (
						<button
							className={styles.btnGhost}
							onClick={() => void grant()}
							disabled={busy}
						>
							<KeySvg /> Cấp tài khoản
						</button>
					) : (
						<>
							<button
								className={styles.btnGhost}
								onClick={reset}
								disabled={busy}
							>
								<KeySvg /> Đặt lại mật khẩu
							</button>
							<button
								className={styles.btnGhost}
								onClick={toggle}
								disabled={busy}
							>
								{active ? 'Khoá tài khoản' : 'Mở khoá tài khoản'}
							</button>
						</>
					)}
				</div>
			)}
			{shown.length > 0 && (
				<GrantedAccountsModal
					accounts={shown}
					onClose={() => setShown([])}
				/>
			)}
		</section>
	);
}
