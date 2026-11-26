import { apiClient } from '@/shared/api/axios';
import { seg } from '@/shared/api/path';
import type { MyTuition, PaymentMethod, PendingTuitionPayment, TuitionItem } from '../types/tuition.type';

/** Học viên — học phí của chính mình (/me/tuition) */
export const myTuitionApi = {
	get: () => apiClient.get<MyTuition>('/me/tuition'),
	/** Báo đã chuyển khoản kèm chứng từ (ảnh / PDF) ⇒ chờ phòng Đào tạo xác nhận */
	submit: (
		enrollmentId: string,
		data: { amount: number; paid_date: string; transfer_ref?: string; note?: string },
		file: File,
	) => {
		const form = new FormData();
		form.append('amount', String(data.amount));
		form.append('paid_date', data.paid_date);
		if (data.transfer_ref) form.append('transfer_ref', data.transfer_ref);
		if (data.note) form.append('note', data.note);
		form.append('file', file);
		return apiClient.postForm<MyTuition>(`/me/tuition/${seg(enrollmentId)}/payments`, form);
	},
	cancel: (paymentId: string) => apiClient.delete<MyTuition>(`/me/tuition/payments/${seg(paymentId)}`),
	receipt: (paymentId: string) => apiClient.postBlob(`/me/tuition/payments/${seg(paymentId)}/receipt`, {}),
};

/** Phòng Đào tạo — học phí của 1 khóa */
export const courseTuitionApi = {
	list: (courseId: string, programId?: string) =>
		apiClient.get<TuitionItem[]>(
			`/courses/${seg(courseId)}/tuition${programId ? `?program_id=${encodeURIComponent(programId)}` : ''}`,
		),
	setFee: (
		courseId: string,
		enrollmentId: string,
		data: { base_amount: number | null; discount_amount: number; discount_reason: string | null },
	) => apiClient.put<TuitionItem>(`/courses/${seg(courseId)}/tuition/enrollments/${seg(enrollmentId)}/fee`, data),
	record: (
		courseId: string,
		enrollmentId: string,
		data: { amount: number; method: PaymentMethod; paid_date: string; transfer_ref?: string; note?: string },
	) =>
		apiClient.post<TuitionItem>(`/courses/${seg(courseId)}/tuition/enrollments/${seg(enrollmentId)}/payments`, data),
	confirm: (courseId: string, paymentId: string) =>
		apiClient.patch<TuitionItem>(`/courses/${seg(courseId)}/tuition/payments/${seg(paymentId)}/confirm`, {}),
	reject: (courseId: string, paymentId: string, review_note: string) =>
		apiClient.patch<TuitionItem>(`/courses/${seg(courseId)}/tuition/payments/${seg(paymentId)}/reject`, {
			review_note,
		}),
	receipt: (courseId: string, paymentId: string) =>
		apiClient.postBlob(`/courses/${seg(courseId)}/tuition/payments/${seg(paymentId)}/receipt`, {}),
	pending: () => apiClient.get<PendingTuitionPayment[]>('/courses/tuition-pending'),
};
