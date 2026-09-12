import React from 'react';
import { Link } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import styles from './PublicLayout.module.css';

interface PublicLayoutProps {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}

// Layout tối giản cho cổng công khai (đăng ký khóa học, tra cứu kết quả) —
// không sidebar admin, không yêu cầu đăng nhập. Tách hẳn khỏi AdminLayout để
// tránh lộ điều hướng nội bộ cho người ngoài hệ thống.
export default function PublicLayout({ title, subtitle, children }: PublicLayoutProps) {
	return (
		<div className={styles.wrapper}>
			<header className={styles.header}>
				<div className={styles.headerInner}>
					<Link
						to='/'
						className={styles.brand}
					>
						<img
							src={Logo}
							alt='Logo'
							className={styles.brandLogo}
						/>
						<div>
							<div className={styles.brandName}>Bệnh viện Hữu Nghị Đa Khoa Nghệ An</div>
							<div className={styles.brandSub}>Cổng thông tin Đào tạo</div>
						</div>
					</Link>
					<nav className={styles.nav}>
						<Link
							to='/dang-ky-khoa-hoc'
							className={styles.navLink}
						>
							Đăng ký khóa học
						</Link>
						<Link
							to='/tra-cuu-ket-qua'
							className={styles.navLink}
						>
							Tra cứu kết quả
						</Link>
						<Link
							to='/login'
							className={styles.navLinkPrimary}
						>
							Đăng nhập hệ thống
						</Link>
					</nav>
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
