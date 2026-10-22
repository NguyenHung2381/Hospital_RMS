import { FileTextSvg } from '@/assets/icons';
import { EmptyState } from '@/shared/components';
import TraineeLayout from '../../../layouts/TraineeLayout';
import { MyTraineeDocumentsCard } from '../../portal/components/MyTraineeDocumentsCard';

/** Giấy tờ hồ sơ học viên: checklist theo khóa đã ghi danh, tự nộp file còn thiếu. */
export default function TraineeDocuments() {
	return (
		<TraineeLayout
			pageTitle='Giấy tờ hồ sơ'
			pageSubtitle='Nộp các giấy tờ còn thiếu — phòng Đào tạo sẽ kiểm tra và duyệt'
		>
			<MyTraineeDocumentsCard
				empty={
					<EmptyState
						icon={<FileTextSvg />}
						title='Chưa có yêu cầu giấy tờ nào'
						desc='Tài khoản chưa gắn hồ sơ học viên hoặc khóa học không yêu cầu giấy tờ.'
					/>
				}
			/>
		</TraineeLayout>
	);
}
