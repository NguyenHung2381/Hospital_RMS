// Cờ gửi qua multipart/form-data hoặc query string luôn là chuỗi: chỉ '1' và
// 'true' mới bật (giá trị khác, kể cả boolean true, coi là tắt — như các chỗ
// trước đây tự viết `v === '1' || v === 'true'`).
const formFlag = (v) => v === '1' || v === 'true';

module.exports = { formFlag };
