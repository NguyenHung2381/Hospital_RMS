import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import { downloadPracticeDocument, type PracticeDocumentType } from '../api/courseApi';

/** Tải 1 giấy tờ thực hành và lưu về máy (tên file theo mã thực hành / tên học viên). */
export const savePracticeDocument = async (
	enrollmentId: string,
	type: PracticeDocumentType,
	who: string,
	rotation?: { id: string; label: string },
) => {
	try {
		const blob = await downloadPracticeDocument(enrollmentId, type, rotation?.id);
		const zip = type === 'phieu-nhan-xet' && !rotation;
		const suffix = rotation ? `_${fileSlug(rotation.label)}` : '';
		saveBlob(blob, `${type}_${fileSlug(who)}${suffix}.${zip ? 'zip' : 'docx'}`);
	} catch (err) {
		showToast('error', err instanceof Error ? err.message : 'Không tạo được giấy tờ');
	}
};
