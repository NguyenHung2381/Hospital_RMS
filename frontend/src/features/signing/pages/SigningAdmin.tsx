import { FilterSvg, HistorySvg, KeySvg, PlusSvg } from '@/assets/icons';
import AdminLayout from '@/layouts/AdminLayout';
import { Button } from '@/shared/components';
import base from '@/shared/components/Table/CrudPage.module.css';
import { showToast } from '@/shared/utils/feedback';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { signingApi } from '../api/signingApi';
import { AccountsPanel } from '../components/AccountsPanel';
import { ConfigPanel } from '../components/ConfigPanel';
import { LogsPanel } from '../components/LogsPanel';
import { SIGNING_STATUS_KEY } from '../hooks/useSigningStatus';
import type { SigningAccount } from '../types/signing.type';
import styles from './SigningAdmin.module.css';

type Tab = 'accounts' | 'config' | 'logs';
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
	{ key: 'accounts', label: 'Tài khoản ký', icon: <KeySvg /> },
	{ key: 'config', label: 'Cấu hình', icon: <FilterSvg /> },
	{ key: 'logs', label: 'Nhật ký ký số', icon: <HistorySvg /> },
];

/** Quản trị → Ký số: chứng thư bệnh viện, chứng thư cá nhân cán bộ đã khai báo, nhật ký ký. */
export default function SigningAdmin() {
	const [params, setParams] = useSearchParams();
	const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'accounts') as Tab;
	const qc = useQueryClient();
	const [accounts, setAccounts] = useState<SigningAccount[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshKey, setRefreshKey] = useState(0);
	const [creating, setCreating] = useState(false);

	const reload = () => {
		setRefreshKey((k) => k + 1);
		void qc.invalidateQueries({ queryKey: SIGNING_STATUS_KEY });
	};

	useEffect(() => {
		signingApi
			.listAccounts()
			.then(setAccounts)
			.catch((e) => showToast('error', e instanceof Error ? e.message : 'Không tải được tài khoản ký số'))
			.finally(() => setLoading(false));
	}, [refreshKey]);

	const noCertAccount = !loading && !accounts.some((a) => a.use_for_certificates);

	return (
		<AdminLayout
			pageTitle='Ký số'
			pageSubtitle='Ký số từ xa qua VIN-HSM — giấy chứng nhận CME, văn bản đào tạo, phiếu phê duyệt đề tài'
			breadcrumbs={[{ label: 'Quản trị hệ thống' }]}
			headerActions={
				tab === 'accounts' ? (
					<Button
						variant='primary'
						icon={<PlusSvg />}
						onClick={() => setCreating(true)}
					>
						Thêm tài khoản ký số
					</Button>
				) : undefined
			}
		>
			<div
				className={base.tabs}
				role='tablist'
			>
				{TABS.map((t) => (
					<button
						key={t.key}
						role='tab'
						aria-selected={tab === t.key}
						className={`${base.tabBtn} ${tab === t.key ? base.tabBtnActive : ''}`}
						onClick={() => setParams(t.key === 'accounts' ? {} : { tab: t.key }, { replace: true })}
					>
						{t.icon}
						{t.label}
					</button>
				))}
			</div>

			{tab === 'accounts' && noCertAccount && (
				<p className={styles.notice}>
					Chưa chọn chứng thư ký giấy chứng nhận CME — thêm (hoặc sửa) một tài khoản bệnh viện và bật "Dùng ký
					giấy chứng nhận CME".
				</p>
			)}

			<div className={base.tableCard}>
				{tab === 'config' ? (
					<ConfigPanel />
				) : tab === 'accounts' ? (
					<AccountsPanel
						accounts={accounts}
						loading={loading}
						creating={creating}
						onCloseCreate={() => setCreating(false)}
						onChanged={reload}
					/>
				) : (
					<LogsPanel accounts={accounts} />
				)}
			</div>

			{tab === 'accounts' && (
				<details className={styles.guide}>
					<summary className={styles.guideSummary}>Cách hoạt động</summary>
					<div className={styles.guideBody}>
						<p>
							Khóa ký nằm trong HSM của VIN-HSM; hệ thống gửi file cần ký kèm API key/secret của chứng thư và nhận
							lại file đã ký. Secret được mã hóa trên máy chủ (cùng khóa với mã 2FA, nằm ngoài cơ sở dữ liệu) —
							sao lưu thư mục <code>secrets</code> cùng cơ sở dữ liệu.
						</p>
						<ul>
							<li>
								<strong>Giấy chứng nhận CME</strong>: ký bằng chứng thư bệnh viện được đánh dấu ở bảng trên. Người
								xuất giấy cần thêm quyền "Ký bằng chứng thư bệnh viện" (Vai trò &amp; quyền → Ký số).
							</li>
							<li>
								<strong>Giấy tờ thực hành, đơn đăng ký, tờ trình</strong> và <strong>phiếu phê duyệt đề tài</strong>:
								ký bằng chứng thư cá nhân của chính người thao tác — mỗi cán bộ tự khai báo ở Hồ sơ cá nhân → Chữ ký
								số.
							</li>
							<li>Mọi lần ký (cả khi lỗi) ghi ở tab Nhật ký ký số, kèm mã băm SHA-256 của file trước và sau khi ký.</li>
						</ul>
					</div>
				</details>
			)}
		</AdminLayout>
	);
}
