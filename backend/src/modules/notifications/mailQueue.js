const logger = require('../../config/logger');

// Hàng đợi gửi email ở nền, dùng cho email gửi KÈM một thao tác đã ghi xong
// (duyệt đăng ký, thông báo, thẻ đại biểu...): request trả về ngay, không chờ SMTP.
//   - Tuần tự: mỗi lúc chỉ 1 job — gửi hàng loạt không mở hàng trăm kết nối
//     SMTP cùng lúc (Gmail sẽ chặn).
//   - Job lỗi chỉ ghi log, không làm hỏng job sau.
//   - Trong bộ nhớ của tiến trình: mỗi worker (src/cluster.js) có hàng đợi
//     riêng; tiến trình dừng giữa chừng thì job chưa chạy bị mất (giống trước
//     đây khi mỗi nơi tự gửi nền). Cần chắc chắn tới nơi thì phải có hàng đợi
//     bền (bảng DB / Redis) — chưa làm.
// Email người dùng đang chờ ngay trên màn hình (OTP quên mật khẩu, gửi thử
// SMTP) KHÔNG đi qua đây — gọi thẳng mailService.

let tail = Promise.resolve();
let pending = 0;

// label: mô tả ngắn cho log khi lỗi; job: () => Promise (render + mailService.send...).
// Job chỉ chạy khi tới lượt, nên việc nặng (vẽ ảnh, truy vấn người nhận) đặt
// trong job thì cũng chạy nền.
const enqueue = (label, job) => {
	pending++;
	tail = tail
		.then(job)
		.catch((err) => logger.error(`[mail] ${label}:`, err))
		.finally(() => {
			pending--;
		});
};

// Cho test / tắt máy êm: chờ mọi job đã xếp hàng chạy xong.
const drain = () => tail;
const size = () => pending;

module.exports = { enqueue, drain, size };
