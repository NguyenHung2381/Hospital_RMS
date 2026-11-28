/**
 * Bộ chuyển đổi theo từng ngân hàng / dịch vụ báo giao dịch. Mỗi bộ là 1 file cùng giao diện:
 *   id      khóa lưu ở TUITION_BANK_API_PROVIDER và nằm trên đường dẫn webhook
 *   label   tên hiện ở Cấu hình hệ thống
 *   verify({ headers, rawBody, secret }) → null nếu request đúng là của ngân hàng, ngược
 *           lại là lý do từ chối. PHẢI xác thực (chữ ký / chứng thư…) — webhook là route công khai.
 *   parse(body) → BankTxn[] (body là JSON đã parse từ rawBody)
 *
 * Thêm ngân hàng (khi có tài liệu API của ngân hàng đó): viết providers/<id>.js theo tài
 * liệu, thêm vào PROVIDERS dưới đây và vào danh sách chọn ở frontend
 * features/settings/config/sections.ts (TUITION_BANK_API_PROVIDER). Lõi đối soát
 * (bankReconcileService.js) không phải sửa.
 *
 * @typedef {{ external_id: any, amount: any, content: any, account_no?: any, time?: any,
 *             direction: 'credit' | 'debit', raw?: any }} BankTxn  raw = phần JSON gốc (lưu để tra lại)
 */
const generic = require('./generic');

const PROVIDERS = { [generic.id]: generic };

/** @param {string} id */
const getProvider = (id) => (Object.hasOwn(PROVIDERS, id) ? PROVIDERS[id] : null);

module.exports = { PROVIDERS, getProvider };
