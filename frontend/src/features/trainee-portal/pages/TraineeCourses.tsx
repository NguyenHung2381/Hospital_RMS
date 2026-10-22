import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpenSvg, DocPlusSvg } from '@/assets/icons';
import { EmptyState, InlineLoading } from '@/shared/components';
import TraineeLayout from '../../../layouts/TraineeLayout';
import type { OpenCourse } from '../../portal/api/meApi';
import { OpenCourseCard, OpenCourseDetail } from '../../portal/pages/MyTraining';
import { CourseCard } from '../components/TraineeCards';
import { useMyTraining } from '../hooks/useMyTraining';
import styles from './TraineePortal.module.css';

type Tab = 'current' | 'done' | 'open';

/** Khóa học của học viên: đang học / đã hoàn thành / đang mở đăng ký (đăng ký ngay tại đây). */
export default function TraineeCourses() {
	const { data, error, reload } = useMyTraining();
	const [params, setParams] = useSearchParams();
	const [opening, setOpening] = useState<OpenCourse | null>(null);

	const enrolled = data?.enrolled ?? [];
	const done = enrolled.filter((c) => c.display_status === 'completed' || c.display_status === 'cancelled');
	const current = enrolled.filter((c) => !done.includes(c));
	const open = data?.open_courses ?? [];
	const tab: Tab = params.get('tab') === 'dang-ky' ? 'open' : params.get('tab') === 'hoan-thanh' ? 'done' : 'current';
	const setTab = (t: Tab) =>
		setParams(t === 'open' ? { tab: 'dang-ky' } : t === 'done' ? { tab: 'hoan-thanh' } : {}, { replace: true });

	const tabs: { key: Tab; label: string; count: number }[] = [
		{ key: 'current', label: 'Đang học', count: current.length },
		{ key: 'done', label: 'Đã kết thúc', count: done.length },
		{ key: 'open', label: 'Mở đăng ký', count: open.length },
	];
	const list = tab === 'done' ? done : current;

	if (opening) {
		return (
			<TraineeLayout
				pageTitle='Đăng ký khóa học'
				pageSubtitle='Chọn chương trình phù hợp rồi gửi đăng ký — phòng Đào tạo sẽ xét duyệt'
			>
				<OpenCourseDetail
					key={opening.id}
					course={opening}
					onBack={() => setOpening(null)}
					onDone={() => {
						setOpening(null);
						setTab('current');
						reload();
					}}
				/>
			</TraineeLayout>
		);
	}

	return (
		<TraineeLayout
			pageTitle='Khóa học của tôi'
			pageSubtitle='Bấm vào một khóa để xem bài học, tài liệu và làm bài kiểm tra'
		>
			<div
				className={styles.segment}
				role='tablist'
			>
				{tabs.map((t) => (
					<button
						key={t.key}
						type='button'
						role='tab'
						aria-selected={tab === t.key}
						className={`${styles.segmentItem} ${tab === t.key ? styles.segmentActive : ''}`}
						onClick={() => setTab(t.key)}
					>
						{t.label}
						<span className={styles.segmentCount}>{t.count}</span>
					</button>
				))}
			</div>

			{error && (
				<EmptyState
					title='Không thể tải dữ liệu'
					desc={error}
				/>
			)}
			{!data && !error && <InlineLoading />}

			{data &&
				(tab === 'open' ? (
					open.length === 0 ? (
						<EmptyState
							icon={<DocPlusSvg />}
							title='Hiện chưa có khóa học nào mở đăng ký'
						/>
					) : (
						<div className={styles.courseGrid}>
							{open.map((c) => (
								<OpenCourseCard
									key={c.id}
									course={c}
									onOpen={() => {
										setOpening(c);
										window.scrollTo({ top: 0 });
									}}
								/>
							))}
						</div>
					)
				) : list.length === 0 ? (
					<EmptyState
						icon={<BookOpenSvg />}
						title={tab === 'done' ? 'Chưa có khóa học nào kết thúc' : 'Bạn chưa tham gia khóa học nào'}
						desc={tab === 'current' && open.length ? 'Chuyển sang tab "Mở đăng ký" để đăng ký học.' : undefined}
					/>
				) : (
					<div className={styles.courseGrid}>
						{list.map((c) => (
							<CourseCard
								key={c.enrollment_id}
								c={c}
							/>
						))}
					</div>
				))}
		</TraineeLayout>
	);
}
