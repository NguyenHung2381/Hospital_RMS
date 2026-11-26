import { useQuery } from '@tanstack/react-query';
import { Table } from 'antd';
import { Link } from 'react-router-dom';
import AdminLayout from '../../../layouts/AdminLayout';
import { useRealtimeUpdate } from '../../../layouts/hooks/useRealtime';
import { apiClient } from '@/shared/api/axios';

interface PendingEnrollment {
	id: string;
	course_id: string;
	course_name: string;
	trainee_name: string;
}

export default function PendingEnrollments() {
	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: ['courses', 'pending-enrollments'],
		queryFn: () => apiClient.get<PendingEnrollment[]>('/courses/pending-enrollments'),
		refetchOnMount: 'always',
	});
	useRealtimeUpdate('course_enrollment', () => { void refetch(); });

	return (
		<AdminLayout pageTitle='Đăng ký khóa học chờ duyệt'>
			{isError ? (
				<p role='alert'>Không tải được danh sách. <button onClick={() => void refetch()}>Thử lại</button></p>
			) : (
				<Table<PendingEnrollment>
					rowKey='id'
					dataSource={data}
					loading={isLoading}
					pagination={{ pageSize: 20, hideOnSinglePage: true }}
					locale={{ emptyText: 'Không có đăng ký chờ duyệt' }}
					columns={[
						{ title: 'Học viên', dataIndex: 'trainee_name' },
						{
							title: 'Khóa học',
							render: (_, row) => (
								<Link to={`/admin/courses/${encodeURIComponent(row.course_id)}?tab=enrollments&list=pending`}>
									{row.course_name}
								</Link>
							),
						},
					]}
				/>
			)}
		</AdminLayout>
	);
}
