import { useNavigate } from 'react-router-dom';
import { defaultPath, hasToken } from '../../../app/router/authHelpers';
import { Button } from '../../components/Button';
import { AlertSvg } from '@/assets/icons';
import styles from './NotFound.module.css';

export default function NotFound() {
	const navigate = useNavigate();
	const home = hasToken() ? defaultPath() : '/login';

	return (
		<div className={styles.wrapper}>
			<div className={styles.glowOrb} />
			<div className={styles.glowOrb} />
			<div className={styles.ring} />
			<div className={styles.ring} />

			<div className={styles.content}>
				<div className={styles.code}>404</div>
				<div className={styles.icon}>
					<AlertSvg
						width={26}
						height={26}
					/>
				</div>
				<h1 className={styles.title}>Không tìm thấy trang</h1>
				<p className={styles.desc}>
					Trang bạn đang tìm không tồn tại, đã bị di chuyển hoặc đường dẫn
					không chính xác. Vui lòng kiểm tra lại hoặc quay về trang chủ.
				</p>
				<div className={styles.actions}>
					<Button
						variant='secondary'
						onClick={() => navigate(-1)}
					>
						Quay lại
					</Button>
					<Button onClick={() => navigate(home)}>Về trang chủ</Button>
				</div>
			</div>
		</div>
	);
}
