import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevLSvg } from '@/assets/icons';
import { Button, Card, EmptyState, InlineLoading } from '@/shared/components';
import { showToast } from '@/shared/utils/feedback';
import UserLayout from '../../../layouts/UserLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { GradebookTable } from '../../course/components/GradebookTable';
import type { Gradebook } from '../../course/types/course.type';
import { teachingApi } from '../api/teachingApi';

/** Giảng viên nhập điểm khóa mình dạy — chỉ phần được phân (cột còn lại chỉ xem). */
export default function MyTeachingGrades() {
	const { id = '' } = useParams();
	const navigate = useNavigate();
	const [book, setBook] = useState<Gradebook | null>(null);
	const [error, setError] = useState('');

	const load = useCallback(
		() =>
			teachingApi
				.getGradebook(id)
				.then((b) => {
					setBook(b);
					setError('');
				})
				.catch((err) => setError(err instanceof Error ? err.message : 'Không tải được bảng điểm')),
		[id],
	);
	useEffect(() => {
		void load();
	}, [load]);
	useRealtimeUpdate(['grade', 'attendance'], load);

	return (
		<UserLayout
			pageTitle='Nhập điểm'
			pageSubtitle='Điểm lý thuyết / thực hành phần bạn được phân công'
			headerActions={
				<Button
					variant='secondary'
					size='sm'
					icon={<ChevLSvg />}
					onClick={() => navigate('/user/khoa-hoc?tab=giang-day')}
				>
					Quay lại
				</Button>
			}
		>
			{error ? (
				<EmptyState
					title='Không thể mở bảng điểm'
					desc={error}
				/>
			) : !book ? (
				<InlineLoading />
			) : (
				<Card>
					<Card.Body>
						<GradebookTable
							book={book}
							fileName='bang-diem'
							onSave={async (rows) => {
								const r = await teachingApi.saveGrades(id, rows);
								showToast('success', `Đã lưu điểm ${r.saved} học viên`);
								await load();
							}}
						/>
					</Card.Body>
				</Card>
			)}
		</UserLayout>
	);
}
