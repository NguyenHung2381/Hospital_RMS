import { useEffect, useState } from 'react';
import { hasPermission } from '@/app/router/authHelpers';
import { getCouncils } from '@/features/council/api/councilApi';
import type { Council } from '@/features/council/types/council.type';
import { getCourses } from '@/features/course/api/courseApi';
import { getLecturers } from '@/features/lecturer/api/lecturerApi';
import { getSeminars } from '@/features/seminar/api/seminarApi';
import { getTrainees } from '@/features/trainee/api/traineeApi';
import { getStoredUser, type StoredUser } from '@/shared/utils/storage';

export interface ModuleOverviewItem {
	key: string;
	label: string;
	value: number;
}

const ORDER = ['trainees', 'lecturers', 'seminars', 'courses', 'councils'];

// defense_date trả về dạng "dd/mm/yyyy" từ councilService.normalize.
function parseDMY(d: string | null | undefined): Date | null {
	if (!d) return null;
	const [dd, mm, yyyy] = d.split('/').map(Number);
	if (!dd || !mm || !yyyy) return null;
	const date = new Date(yyyy, mm - 1, dd);
	return Number.isNaN(date.getTime()) ? null : date;
}

export interface ModuleOverviewState {
	items: ModuleOverviewItem[];
	loading: boolean;
	upcomingCouncils: Council[];
	councilsLoading: boolean;
	councilsError: boolean;
}

export function useModuleOverview(): ModuleOverviewState {
	const [items, setItems] = useState<ModuleOverviewItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [upcomingCouncils, setUpcomingCouncils] = useState<Council[]>([]);
	const [councilsLoading, setCouncilsLoading] = useState(() =>
		hasPermission(getStoredUser<StoredUser>(), 'councils:read'),
	);
	const [councilsError, setCouncilsError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		const user = getStoredUser<StoredUser>();
		const collected: ModuleOverviewItem[] = [];
		const tasks: Promise<void>[] = [];

		if (hasPermission(user, 'trainees:read')) {
			tasks.push(
				getTrainees()
					.then((res) => {
						collected.push({
							key: 'trainees',
							label: 'Học viên đào tạo',
							value: res.pagination.total,
						});
					})
					.catch(() => {}),
			);
		}

		if (hasPermission(user, 'lecturers:read')) {
			tasks.push(
				getLecturers()
					.then((res) => {
						collected.push({
							key: 'lecturers',
							label: 'Giảng viên / BCV',
							value: res.pagination.total,
						});
					})
					.catch(() => {}),
			);
		}

		if (hasPermission(user, 'seminars:read')) {
			tasks.push(
				getSeminars({ year: new Date().getFullYear(), limit: 1 })
					.then((res) => {
						collected.push({
							key: 'seminars',
							label: 'Hội nghị - Hội thảo CME',
							value: res.pagination.total,
						});
					})
					.catch(() => {}),
			);
		}

		if (hasPermission(user, 'courses:read')) {
			tasks.push(
				getCourses()
					.then((res) => {
						const open = res.data.filter((c) => c.display_status === 'enrolling').length;
						collected.push({
							key: 'courses',
							label: 'Khóa đào tạo đang mở',
							value: open,
						});
					})
					.catch(() => {}),
			);
		}

		if (hasPermission(user, 'councils:read')) {
			tasks.push(
				getCouncils({ limit: 0 })
					.then((res) => {
						collected.push({
							key: 'councils',
							label: 'Hội đồng Khoa học',
							value: res.pagination.total,
						});
						if (cancelled) return;
						const today = new Date();
						today.setHours(0, 0, 0, 0);
						const upcoming = res.data
							.map((c) => ({ c, date: parseDMY(c.defense_date) }))
							.filter(
								(x): x is { c: Council; date: Date } =>
									x.c.status === 'finalized' && x.date !== null && x.date >= today,
							)
							.sort((a, b) => a.date.getTime() - b.date.getTime())
							.slice(0, 6)
							.map((x) => x.c);
						setUpcomingCouncils(upcoming);
						setCouncilsError(false);
					})
					.catch(() => {
						if (!cancelled) setCouncilsError(true);
					})
					.finally(() => {
						if (!cancelled) setCouncilsLoading(false);
					}),
			);
		}

		Promise.allSettled(tasks).then(() => {
			if (cancelled) return;
			collected.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
			setItems(collected);
			setLoading(false);
		});

		return () => {
			cancelled = true;
		};
	}, []);

	return { items, loading, upcomingCouncils, councilsLoading, councilsError };
}
