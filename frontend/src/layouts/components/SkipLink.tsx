import type { MouseEvent } from 'react';
import styles from './SkipLink.module.css';

/** id của vùng nội dung chính (`<main id="main" tabIndex={-1}>`) ở mọi layout. */
export const MAIN_ID = 'main';

/**
 * Liên kết "Bỏ qua tới nội dung": phần tử focus được đầu tiên của trang, ẩn cho
 * tới khi được focus bằng bàn phím. Tự chuyển focus vào <main> thay vì để trình
 * duyệt đổi hash (router dùng history thường, hash sẽ làm bẩn URL).
 */
export function SkipLink() {
	const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
		const main = document.getElementById(MAIN_ID);
		if (!main) return;
		e.preventDefault();
		main.focus();
		main.scrollIntoView({ block: 'start' });
	};

	return (
		<a
			href={`#${MAIN_ID}`}
			className={styles.skipLink}
			onClick={onClick}
		>
			Bỏ qua tới nội dung
		</a>
	);
}
