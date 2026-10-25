// Thi trực tuyến — gom các service con để controller / portal require 1 chỗ:
//   questionBankService  ngân hàng câu hỏi theo chương trình
//   examPaperService     đề thi (chọn tay / bốc ngẫu nhiên, nhiều mã đề, người chấm)
//   examGradingService   chấm tự luận, đổ điểm vào bảng điểm
//   examAttemptService   học viên làm bài / nộp bài
//   examShared           hằng số + hàm dùng chung
module.exports = {
	...require('./questionBankService'),
	...require('./examPaperService'),
	...require('./examGradingService'),
	...require('./examAttemptService'),
};
