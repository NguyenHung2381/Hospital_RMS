import { fileSlug, saveBlob } from '@/shared/utils/saveBlob';
import { showToast } from '@/shared/utils/feedback';
import { downloadPracticeDocument, exportPracticeBook, type PracticeDocumentType } from '../api/courseApi';

/** Xuất sổ thực hành GPHN của khóa ra Excel (bố cục sổ cũ). */
export const savePracticeBook = async (courseId: string, courseName: string) => {
	try {
		saveBlob(await exportPracticeBook(courseId), `so-thuc-hanh_${fileSlug(courseName)}.xlsx`);
	} catch (err) {
		showToast('error', err instanceof Error ? err.message : 'Không xuất được sổ thực hành');
	}
};

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
