import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { SearchSvg } from '@/assets/icons';
import { Badge } from '@/shared/components';
import PublicLayout from '../../../layouts/PublicLayout';
import { formatDateOr } from '../../../shared/utils/formatDate';
import { STATUS_CFG } from '../../topics/utils/topicHelpers';
import { getTopicStatus, type TopicStatus } from '../api/publicApi';
import styles from './PublicPortal.module.css';

// Tra cứu cần mã hồ sơ + email/SĐT của 1 thành viên đề tài: chỉ mã thì người
// ngoài dò được tiêu đề mọi đề tài (mã sinh theo thứ tự NCKH_2026_001...).
export default function TopicStatusLookup() {
	const { maTraCuu } = useParams<{ maTraCuu?: string }>();
	const [code, setCode] = useState(maTraCuu ?? '');
	const [contact, setContact] = useState('');
	const [topic, setTopic] = useState<TopicStatus | null>(null);
	const [notFound, setNotFound] = useState('');
	const [loading, setLoading] = useState(false);

	const handleSearch = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!code.trim() || !contact.trim()) return;
		setLoading(true);
		setTopic(null);
		setNotFound('');
		try {
			setTopic(await getTopicStatus(code.trim(), contact.trim()));
		} catch (err) {
			// Không phân biệt "sai mã" với "sai liên hệ" — tránh dò quét mã.
			setNotFound(err instanceof Error ? err.message : 'Không tìm thấy hồ sơ.');
		} finally {
			setLoading(false);
		}
	};

	const cfg = topic ? STATUS_CFG[topic.status] : null;

	return (
		<PublicLayout
			title='Tra cứu hồ sơ đề tài đã nộp'
			subtitle='Nhập mã hồ sơ được cấp khi đăng ký đề tài, kèm email hoặc số điện thoại đã khai trong hồ sơ, để xem trạng thái xét duyệt.'
		>
			<form
				onSubmit={(e) => void handleSearch(e)}
				className={styles.searchRow}
			>
				<input
					className={styles.input}
					value={code}
					onChange={(e) => setCode(e.target.value)}
					placeholder='Mã hồ sơ (vd: NCKH_2026_001)'
					aria-label='Mã hồ sơ'
					maxLength={15}
					required
				/>
				<input
					className={styles.input}
					value={contact}
					onChange={(e) => setContact(e.target.value)}
					placeholder='Email hoặc số điện thoại trong hồ sơ'
					aria-label='Email hoặc số điện thoại'
					maxLength={100}
					autoComplete='email'
					required
				/>
				<button
					type='submit'
					className={styles.searchBtn}
					disabled={loading}
				>
					<SearchSvg /> {loading ? 'Đang tra cứu...' : 'Tra cứu'}
				</button>
			</form>

			{notFound && <div className={styles.emptyNotice}>{notFound}</div>}

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
