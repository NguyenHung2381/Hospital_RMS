import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertSvg, SearchSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import PublicLayout from '../../../layouts/PublicLayout';
import { formatDateOr } from '../../../shared/utils/formatDate';
import { STATUS_CFG } from '../../topics/utils/topicHelpers';
import { getTopicStatus, type TopicStatus } from '../api/publicApi';
import styles from './PublicPortal.module.css';

export default function TopicStatusLookup() {
	const { maTraCuu } = useParams<{ maTraCuu?: string }>();
	const [code, setCode] = useState(maTraCuu ?? '');
	const [topic, setTopic] = useState<TopicStatus | null>(null);
	const [notFound, setNotFound] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const search = async (value: string) => {
		if (!value.trim()) return;
		setLoading(true);
		setError('');
		setTopic(null);
		setNotFound(false);
		try {
			setTopic(await getTopicStatus(value.trim()));
		} catch {
			// Không phân biệt "sai mã" với lỗi khác cho người dùng — tránh dò quét mã.
			setNotFound(true);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		if (!maTraCuu) return;
		const run = async () => {
			await search(maTraCuu);
		};
		void run();
	}, [maTraCuu]);

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		void search(code);
	};

	const cfg = topic ? STATUS_CFG[topic.status] : null;

	return (
		<PublicLayout
			title='Tra cứu hồ sơ đề tài đã nộp'
			subtitle='Nhập mã hồ sơ được cấp khi đăng ký đề tài qua cổng công khai để xem trạng thái xét duyệt.'
		>
			{error && (
				<div className={`${styles.alertBox} ${styles.alertError}`}>
					<AlertSvg /> {error}
				</div>
			)}

			<form
				onSubmit={handleSearch}
				className={styles.searchRow}
			>
				<input
					className={styles.input}
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder='Nhập mã hồ sơ (vd: NCKH_2026_001)...'
				/>
				<button
					type='submit'
					className={styles.searchBtn}
					disabled={loading}
				>
					<SearchSvg /> {loading ? 'Đang tra cứu...' : 'Tra cứu'}
				</button>
			</form>

			{notFound && <div className={styles.emptyNotice}>Không tìm thấy hồ sơ với mã này.</div>}

			{topic && (
				<div style={{ marginTop: 24 }}>
					<div className={styles.sectionTitle}>{topic.title}</div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
						{cfg && (
							<Badge
								tone={cfg.tone}
								dot
							>
								{cfg.label}
							</Badge>
						)}
						<span style={{ color: 'var(--color-gray-500)', fontSize: 'var(--font-size-sm)' }}>
							Nộp ngày {formatDateOr(topic.created_at)}
						</span>
					</div>
				</div>
			)}
		</PublicLayout>
	);
}
