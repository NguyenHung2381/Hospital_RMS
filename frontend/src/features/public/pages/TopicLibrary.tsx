import { useEffect, useState } from 'react';
import PublicLayout from '../../../layouts/PublicLayout';
import { formatDateOr } from '../../../shared/utils/formatDate';
import { getFeaturedTopics, type FeaturedTopic } from '../api/publicApi';
import styles from './PublicPortal.module.css';

export default function TopicLibrary() {
	const [topics, setTopics] = useState<FeaturedTopic[] | null>(null);
	const [error, setError] = useState('');

	useEffect(() => {
		getFeaturedTopics()
			.then(setTopics)
			.catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải thư viện đề tài'));
	}, []);

	return (
		<PublicLayout
			title='Thư viện đề tài'
			subtitle='Các đề tài nghiên cứu khoa học và bài báo đã được công nhận, chọn giới thiệu công khai.'
		>
			{error && <div className={styles.emptyNotice}>{error}</div>}

			{topics && topics.length === 0 && !error && (
				<div className={styles.emptyNotice}>Chưa có đề tài nào được giới thiệu.</div>
			)}

			{topics && topics.length > 0 && (
				<div className={styles.libraryList}>
					{topics.map((t) => (
						<div
							key={t.id}
							className={styles.libraryCard}
						>
							<div className={styles.libraryTitle}>{t.title}</div>
							{t.description && <div className={styles.libraryDesc}>{t.description}</div>}
							<div className={styles.libraryMeta}>
								<span className={styles.badge} style={{ color: '#0c447c', background: '#e6f1fb' }}>
									{t.article_type === 'bai_bao' ? 'Bài báo / Tập san' : 'Đề tài NCKH'}
								</span>
								{t.department_name && <span>{t.department_name}</span>}
								{t.category_name && <span>{t.category_name}</span>}
								{t.round_year && <span>Năm {t.round_year}</span>}
								{t.journal_name && <span>{t.journal_name}</span>}
								{t.publish_date && <span>Xuất bản {formatDateOr(t.publish_date)}</span>}
							</div>
						</div>
					))}
				</div>
			)}
		</PublicLayout>
	);
}
