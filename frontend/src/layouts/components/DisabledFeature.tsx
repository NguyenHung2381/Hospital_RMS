import { Link } from 'react-router-dom';
import { EmptyState } from '../../shared/components';
import styles from './DisabledFeature.module.css';

/**
 * Thay cho nội dung trang khi mục đó bị quản trị viên tắt (module hoặc
 * "Menu hiển thị"). `homePath` là trang chủ của từng cổng.
 */
export function DisabledFeature({ homePath }: { homePath: string }) {
	return (
		<EmptyState
			title='Chức năng này đã được quản trị viên tắt.'
			action={
				<Link
					to={homePath}
					className={styles.homeLink}
				>
					Về trang chủ
				</Link>
			}
		/>
	);
}
