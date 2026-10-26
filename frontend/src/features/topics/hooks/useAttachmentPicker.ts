import { useCallback, useRef, useState } from 'react';
import { useUploadPolicy } from '@/shared/hooks/useUploadPolicy';

// Tệp đính kèm chờ gửi, kiểm tra theo hạn mức upload của hệ thống — props của
// RegisterAttachmentsSection (Đăng ký đề tài, Nhập đề tài đã hoàn thành).
export function useAttachmentPicker() {
	const [attachments, setAttachments] = useState<File[]>([]);
	const [fileError, setFileError] = useState('');
	const [isDragging, setIsDragging] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const uploadPolicy = useUploadPolicy();
	const handleFiles = useCallback((files: FileList | null) => {
		if (!files) return;
		const toAdd: File[] = [];
		const problems: string[] = [];
		Array.from(files).forEach((f) => {
			const problem = uploadPolicy.check(f);
			if (problem) problems.push(problem);
			else toAdd.push(f);
		});
		setFileError(problems.join(' · '));
		if (toAdd.length)
			setAttachments((prev) => {
				const s = new Set(prev.map((f) => f.name));
				return [...prev, ...toAdd.filter((f) => !s.has(f.name))];
			});
	}, [uploadPolicy]);

	const removeAttachment = useCallback((name: string) => {
		setAttachments((prev) => prev.filter((f) => f.name !== name));
		setFileError('');
	}, []);

	const resetAttachments = useCallback(() => {
		setAttachments([]);
		setFileError('');
	}, []);

	return {
		attachments,
		fileError,
		isDragging,
		fileInputRef,
		handleFiles,
		removeAttachment,
		setIsDragging,
		resetAttachments,
	};
}
