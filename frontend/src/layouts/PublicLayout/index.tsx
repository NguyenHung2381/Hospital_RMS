import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import Logo from '../../assets/logo.png';
import styles from './PublicLayout.module.css';

export type PublicSection = 'training' | 'research';

// Mỗi mảng một menu riêng: học viên đăng ký khóa học không thấy mục nghiên cứu
// khoa học và ngược lại.
const SECTIONS: Record<PublicSection, { sub: string; nav: readonly (readonly [string, string])[] }> = {
	training: {
		sub: 'Cổng thông tin đào tạo',
		nav: [
			['/dang-ky-khoa-hoc', 'Đăng ký khóa học'],
			['/tra-cuu-don-dang-ky', 'Tra cứu đơn đăng ký'],
			['/tra-cuu-ket-qua', 'Kết quả học tập, chứng chỉ'],
		],
	},
	research: {
		sub: 'Cổng nghiên cứu khoa học',
		nav: [
			['/de-xuat-de-tai', 'Đăng ký đề tài'],
			['/tra-cuu-ho-so', 'Tra cứu hồ sơ đề tài'],
			['/thu-vien-de-tai', 'Thư viện đề tài'],
		],
	},
};

interface PublicLayoutProps {
	title: string;
	subtitle?: string;
	/** Mảng của trang — quyết định menu hiển thị (mặc định: đào tạo) */
	section?: PublicSection;
	/** Trang đứng riêng (vd. đăng ký hội nghị qua QR): không menu, không nút đăng nhập */
	bare?: boolean;
	children: React.ReactNode;
}

// Layout tối giản cho cổng công khai (đăng ký khóa học, tra cứu kết quả) —
// không sidebar admin, không yêu cầu đăng nhập. Tách hẳn khỏi AdminLayout để
// tránh lộ điều hướng nội bộ cho người ngoài hệ thống.
export default function PublicLayout({ title, subtitle, section = 'training', bare, children }: PublicLayoutProps) {
	const { sub, nav } = SECTIONS[section];
	const brand = (
		<>
			<img
				src={Logo}
				alt='Logo'
				className={styles.brandLogo}
			/>
			<div className={styles.brandText}>
				<div className={styles.brandName}>Bệnh viện Hữu nghị Đa khoa Nghệ An</div>
				<div className={styles.brandSub}>{sub}</div>
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
								{nav.map(([to, label]) => (
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
				© {new Date().getFullYear()} Bệnh viện Hữu nghị Đa khoa Nghệ An — Phòng CNTT
			</footer>
		</div>
	);
}
