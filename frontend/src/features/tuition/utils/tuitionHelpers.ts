import { notify } from '@/shared/utils/feedback';
import { saveBlob } from '@/shared/utils/saveBlob';

/** Hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (mặc định / giới hạn ô ngày nộp). */
export const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

/** "1.500.000" / "1 500 000" ⇒ 1500000 */
export const parseVndInput = (v: string) => Number(v.replace(/[.\s,]/g, ''));

/** Tải phiếu thu PDF (khoản đã xác nhận) */
export const downloadReceipt = async (load: () => Promise<Blob>, receiptNo: string | null) => {
	try {
		saveBlob(await load(), `phieu-thu-${receiptNo ?? 'hoc-phi'}.pdf`);
	} catch (err) {
		notify.error(err instanceof Error ? err.message : 'Không tải được phiếu thu');
	}
};
