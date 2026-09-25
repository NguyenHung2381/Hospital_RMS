import React from 'react';
import Logo from '../../assets/logo.png';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
	children: React.ReactNode;
}

const stats = [
	{ number: '200+', label: 'Đề tài' },
	{ number: '50+', label: 'Tiến sĩ' },
	{ number: '15+', label: 'Năm' },
];

const features = [
	'Quản lý đề tài NCKH & hội đồng xét duyệt, nghiệm thu',
	'Đào tạo liên tục: chương trình, kế hoạch, khóa học',
	'Quản lý học viên, giảng viên, lịch học & điểm danh',
	'Tổ chức thi, hội nghị – hội thảo và khảo sát',
	'Báo cáo, thống kê & phân quyền theo vai trò',
];

export default function AuthLayout({ children }: AuthLayoutProps) {
	return (
		<div className={styles.authWrapper}>
			{/* Panel trái - Branding */}
			<div className={styles.panelLeft}>
				{/* Vòng tròn trang trí */}
				<div className={styles.panelDecor} />
				<div className={styles.panelDecor} />
				<div className={styles.panelDecor} />

				{/* Glow blobs trang trí */}
				<div className={styles.glowOrb} />
				<div className={styles.glowOrb} />

				<div className={styles.panelContent}>
					{/* Logo */}
					<div className={styles.panelLogo}>
						<img
							src={Logo}
							alt='Logo Bệnh viện Hữu Nghị Đa Khoa Nghệ An'
						/>
					</div>

					{/* Tiêu đề */}
					<div>
						<h1 className={styles.panelTitle}>
							Bệnh viện
							<br />
							Hữu Nghị Đa Khoa
							<br />
							Nghệ An
						</h1>
						<p className={styles.panelSubtitle}>
							Hệ thống Quản lý Nghiên cứu Khoa học & Đào tạo
							<br />— Nơi tri thức y học được kiến tạo và lan tỏa
						</p>
					</div>

					{/* Tính năng nổi bật */}
					<ul className={styles.panelFeatures}>
						{features.map((f) => (
							<li
								key={f}
								className={styles.featureItem}
							>
								<span className={styles.featureCheck}>✓</span>
								{f}
							</li>
						))}
					</ul>

					<div className={styles.panelDivider} />

					{/* Thống kê */}
					<div className={styles.panelStats}>
						{stats.map((s) => (
							<div
								key={s.label}
								className={styles.statItem}
							>
								<div className={styles.statNumber}>{s.number}</div>
								<div className={styles.statLabel}>{s.label}</div>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Panel phải - Nội dung (form) */}
			<div className={styles.panelRight}>
				{/* Trang trí góc */}
				<div className={styles.rightRing} />
				<div className={styles.rightRing} />
				<div className={styles.rightRing} />

				<div className={styles.formWrapper}>{children}</div>

				<div className={styles.authFooter}>
					© {new Date().getFullYear()} Bệnh viện Hữu Nghị Đa Khoa Nghệ An —
					Phòng CNTT
				</div>
			</div>
		</div>
	);
}
