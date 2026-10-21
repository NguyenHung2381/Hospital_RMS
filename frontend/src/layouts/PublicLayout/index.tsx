import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import styles from './PublicLayout.module.css';

const NAV = [
	['/dang-ky-khoa-hoc', 'Đăng ký khóa học'],
	['/de-xuat-de-tai', 'Đăng ký đề tài'],
	['/tra-cuu-ket-qua', 'Tra cứu kết quả'],
	['/tra-cuu-ho-so', 'Tra cứu hồ sơ đề tài'],
] as const;

interface PublicLayoutProps {
	title: string;
	subtitle?: string;
	/** Trang đứng riêng (vd. đăng ký hội nghị qua QR): không menu, không nút đăng nhập */
	bare?: boolean;
	children: React.ReactNode;
}

// Layout tối giản cho cổng công khai (đăng ký khóa học, tra cứu kết quả) —
// không sidebar admin, không yêu cầu đăng nhập. Tách hẳn khỏi AdminLayout để
// tránh lộ điều hướng nội bộ cho người ngoài hệ thống.
export default function PublicLayout({ title, subtitle, bare, children }: PublicLayoutProps) {
	const brand = (
		<>
			<img
				src={Logo}
				alt='Logo'
				className={styles.brandLogo}
			/>
			<div className={styles.brandText}>
				<div className={styles.brandName}>Bệnh viện Hữu Nghị Đa Khoa Nghệ An</div>
				<div className={styles.brandSub}>Cổng thông tin Đào tạo</div>
			</div>
		</>
	);
	return (
		<div className={styles.wrapper}>
			<header className={styles.header}>
				<div className={styles.headerInner}>
					{bare ? (
						<div className={styles.brand}>{brand}</div>
					) : (
						<>
							<Link
								to='/'
								className={styles.brand}
							>
								{brand}
							</Link>
							<Link
								to='/login'
								className={styles.navLinkPrimary}
							>
								Đăng nhập<span className={styles.hideXs}> hệ thống</span>
							</Link>
							<nav className={styles.nav}>
								{NAV.map(([to, label]) => (
									<NavLink
										key={to}
										to={to}
										className={({ isActive }) =>
											isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
										}
									>
										{label}
									</NavLink>
								))}
							</nav>
						</>
					)}
				</div>
			</header>

			<main className={styles.main}>
				<div className={styles.card}>
					<h1 className={styles.title}>{title}</h1>
					{subtitle && <p className={styles.subtitle}>{subtitle}</p>}
					{children}
				</div>
			</main>

			<footer className={styles.footer}>
				© {new Date().getFullYear()} Bệnh viện Hữu Nghị Đa Khoa Nghệ An — Phòng CNTT
			</footer>
		</div>
	);
}
