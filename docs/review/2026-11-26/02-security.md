# Rà soát bảo mật & toàn vẹn dữ liệu backend — 2026-11-26

Phiên `security`, nhánh `claude/review-security-479bca`.

## Tóm tắt

| Mức độ | Số lỗi | Đã sửa | Chưa sửa |
|---|---|---|---|
| Cao | 2 | 1 (S-02) | 1 (S-01, cần người dùng quyết) |
| Trung bình | 3 | 2 (S-03, S-04) | 1 (S-05) |
| Thấp | 5 | 0 | 5 |

Mỗi lỗi đã sửa có test tái hiện trong `backend/test/security/`. Test đỏ trước khi sửa và xanh sau khi sửa:

- `tuitionReceiptIntegrity.test.js`: S-02, S-03
- `tuitionPendingScope.test.js`: S-04

**File ngoài vùng `security` đã sửa** (thuộc vùng `training-cleanup`; mỗi chỗ chỉ sửa đúng các dòng cần thiết):

- `backend/src/modules/training/courses/courseEnrollmentService.js` (`removeEnrollment`)
- `backend/src/modules/training/courses/courseService.js` (`HAS_TUITION_SQL` và `remove`)
- `backend/src/modules/training/tuition/tuitionService.js` (`cancelMine`, `listPending`, thêm require `coursePolicy`)
- `backend/src/modules/training/tuition/tuitionController.js` (`listPending` truyền `req.user`)

`npm run check:routes`: 584 route (420 có kiểm quyền, 117 chỉ cần đăng nhập, 47 công khai). Script báo mọi route đều đã khai báo phân quyền.

## Các vùng đã rà, không thấy lỗi mới

Phần lớn backend đã qua nhiều đợt sửa bảo mật (run-1 đến run-5). Các vùng sau đã đọc và không thấy lỗi mới:

- **JWT / refresh token.** Access token và refresh token ký bằng khoá riêng cho từng loại (`utils/keys.js`). Refresh token lưu dạng hash và xoay mỗi lần làm mới bằng một câu UPDATE nguyên tử. Dùng lại token cũ thì thu hồi cả họ token và tăng `token_version`. Đăng xuất mọi thiết bị, đặt lại mật khẩu (tự làm hoặc admin làm) đều xoá refresh token và tăng `token_version`. Cookie có `HttpOnly`, `SameSite=Strict`, `Secure` bắt buộc ở production, và `Path` giới hạn ở `/api/v1/auth`.
- **Lớp 2 của `authenticate`.** Kiểm `is_active`, `token_version`, hạn tài khoản và hạn mật khẩu tạm; bắt buộc bật 2FA cho tài khoản quản trị.
- **Đặt lại mật khẩu bằng OTP.** Giữ chỗ lượt thử bằng câu lệnh nguyên tử. Giới hạn 5 lần mỗi mã và 10 lần mỗi ngày. So mã bằng `timingSafeEqual`. Phản hồi không để lộ username có tồn tại hay không.
- **2FA.** Pre-auth token chỉ dùng được một lần (`consumeOnce`); nhập sai tính chung bộ đếm khoá tài khoản.
- **Chống leo thang quyền** (`privilegeGuard`): gán vai trò, sửa / xoá / đặt lại mật khẩu người khác, thay quyền của vai trò.
- **Upload.** `secureUpload` kiểm hạn mức, chữ ký file (magic bytes) và quét ClamAV theo kiểu fail-closed. `SAFE_ID` chặn đường dẫn. Link `/uploads` phải có chữ ký HMAC còn hạn, kèm CSP sandbox và `Content-Disposition`.
- **SQL động.** Các chỗ `${field} = @${field}` đều lặp trên danh sách cột cố định; không có `ORDER BY` lấy từ input.
- **Cổng công khai.** Có captcha (PoW / Turnstile / reCAPTCHA), rate limit theo IP và theo mã, và che dữ liệu cá nhân trong activity log (`logRedact`).
- **Cấu hình.** `config/env.js` dừng server ở production nếu thiếu `CORS_ORIGIN`, secret yếu hoặc `JWT_SECRET` trùng `JWT_REFRESH_SECRET`. Có `helmet`; Swagger tắt ở production.
- **Đề thi.** Nộp bài "nhận" lượt làm nguyên tử; tính trễ hạn theo giờ của DB.

## Phát hiện

### S-01 — Cao — Máy chấm công `/iclock` chỉ nhận diện bằng số serial: lộ mẫu vân tay, giả được lượt chấm — CHƯA SỬA (cần quyết)

- **Vị trí:** `backend/src/modules/attendanceDevices/iclockService.js:41` (`resolveDevice`), `:173` (`getRequest`), `:86` (`requireActive`); `frontend/nginx.conf:151`; `infra/may-cham-cong.md` (đường đi qua proxy HTTPS công khai `nckh.bvnghean.vn`).
- **Mô tả:** Giao thức ADMS không có xác thực. Server chỉ kiểm số serial (SN) đã được duyệt. SN in trên tem máy, máy gửi nó trong mọi URL (`?SN=`), và trong LAN máy gọi bằng HTTP thường. Ai biết SN của một máy đã duyệt và gọi được tới `/iclock/` (qua proxy công khai, hoặc trong LAN) thì làm được ba việc:
  1. Gọi `GET /iclock/getrequest?SN=<sn>` để nhận các lệnh đang chờ, gồm `DATA UPDATE FINGERTMP ... TMP=<mẫu vân tay>` và thông tin học viên. Đây là dữ liệu sinh trắc học, thuộc nhóm dữ liệu cá nhân nhạy cảm theo NĐ 13/2023. Lệnh bị "lấy" mất nên máy thật cũng không nhận được.
  2. Gọi `POST /iclock/cdata?SN=<sn>&table=ATTLOG` để tạo lượt chấm giả, khiến hệ thống tự điểm danh hộ học viên.
  3. Gửi `OPERLOG`/`BIODATA` để gắn mẫu vân tay của người khác vào mã học viên.
- **Đề xuất (người dùng chọn):**
  - (a) Thêm `ICLOCK_ALLOWED_CIDRS` (hoặc cột `allowed_ip` cho từng máy, chốt lúc duyệt): chỉ nhận `/iclock` từ dải IP của máy chấm công. Điều kiện là proxy của viện chuyển đúng `X-Forwarded-For` và `TRUST_PROXY` đặt đúng.
  - (b) Chặn `location /iclock/` ở proxy công khai; chỉ mở trong VLAN của máy chấm công.
  - (c) Nếu firmware hỗ trợ, đặt đường dẫn bí mật hoặc "comm key".
  - Ngoài ra nên giới hạn tốc độ theo SN, và báo động khi một SN gọi từ IP khác với IP lúc duyệt.
- **Lý do chưa sửa:** Cần quyết về hạ tầng (IP của máy, cấu hình proxy). Vùng file là `attendanceDevices`, thuộc phiên `backend-cleanup`.

### S-02 — Cao — Xoá lượt ghi danh / khoá học xoá luôn khoản học phí đã cấp biên lai — ĐÃ SỬA

- **Vị trí:** `backend/src/modules/training/courses/courseEnrollmentService.js:408` (`removeEnrollment`); `backend/src/modules/training/courses/courseService.js:296` (`HAS_TUITION_SQL`, dùng trong `remove`); nguyên nhân gốc ở `backend/database/migrations/2027-01-08_hoc_phi_hoc_vien.sql:37,82` (`ON DELETE CASCADE`).
- **Kịch bản:** Học viên A nộp 3.000.000 đ, phòng Đào tạo xác nhận và cấp biên lai `PT2026-00001`. Sau đó cán bộ xoá lượt ghi danh của A (hoặc xoá cả khoá, vì khoá chưa cấp giấy chứng nhận). FK CASCADE xoá dòng `tuition_payments`, mất chứng từ tài chính. Nếu đó là số lớn nhất, `genTuitionReceiptNo` (MAX+1) sẽ cấp lại `PT2026-00001` cho khoản của học viên B, tức hai phiếu thu đã phát ra trùng số.
- **Đã sửa:** Thêm điều kiện "không có khoản `status = 'confirmed'`" ngay trong câu DELETE (cùng kiểu với chặn khi đã có giấy chứng nhận). Nếu 0 dòng bị xoá thì trả 409 kèm lý do; transaction rollback, kể cả phần điểm danh đã xoá.
- **Giữ nguyên:** Transaction, chặn khi có giấy chứng nhận / CME, người thao tác (`withActorTransaction` ở `remove`). Ghi danh không có khoản đã xác nhận vẫn xoá như cũ.
- **Test:** `test/security/tuitionReceiptIntegrity.test.js` (3 ca S-02).
- **Còn lại (đề xuất):** Nên đổi FK `tuition_payments → course_enrollments` sang `ON DELETE RESTRICT` bằng một migration, để chặn ở tầng DB. Chưa làm vì đụng migration và cần người dùng đồng ý.

### S-03 — Trung bình — Học viên rút khoản nộp có thể xoá khoản vừa được xác nhận (race) — ĐÃ SỬA

- **Vị trí:** `backend/src/modules/training/tuition/tuitionService.js:284` (`cancelMine`), câu DELETE ở dòng `:303`.
- **Kịch bản:** `cancelMine` chạy SELECT để kiểm "chưa xác nhận", rồi mới chạy `DELETE ... WHERE id = @id` mà không kèm điều kiện trạng thái. Nếu phòng Đào tạo bấm "Xác nhận" xen giữa hai câu này (`confirmInTx` cấp số biên lai và commit), khoản `confirmed` có số biên lai sẽ bị xoá, chứng từ bị xoá mềm, và số biên lai có thể bị cấp lại (như S-02).
- **Đã sửa:** DELETE kèm `AND status <> 'confirmed'`. Nếu 0 dòng thì trả 409 và không xoá chứng từ.
- **Giữ nguyên:** Kiểm chủ sở hữu (`TRAINEE_OF_USER_SQL`), transaction kèm người thao tác.
- **Test:** `tuitionReceiptIntegrity.test.js` (ca S-03).

### S-04 — Trung bình — `GET /courses/tuition-pending` bỏ qua phạm vi khoá học — ĐÃ SỬA

- **Vị trí:** `backend/src/modules/training/courses/courses.routes.js:76`; `backend/src/modules/training/tuition/tuitionService.js:548` (`listPending`).
- **Kịch bản:** Một giảng viên có `courses:approve` phạm vi `assigned` gọi `GET /api/v1/courses/tuition-pending` và nhận về khoản chờ xác nhận của **mọi** khoá: họ tên học viên, số tiền, tên khoá. Các route học phí theo khoá đều qua `router.param('id')` để kiểm phạm vi, riêng danh sách gộp này thì không. `listPendingEnrollments` cùng file đã lọc đúng.
- **Đã sửa:** Phạm vi hiệu lực của `courses:approve` là `assigned` thì lọc thêm `ASSIGNED_EXISTS_SQL`. Phạm vi `all` giữ nguyên.
- **Test:** `test/security/tuitionPendingScope.test.js`.

### S-05 — Trung bình — Tra cứu công khai gửi CCCD + ngày sinh + họ tên trên URL — CHƯA SỬA

- **Vị trí:** `backend/src/modules/public/public.routes.js:84` (`GET /public/lookup?national_id=&dob=&full_name=`).
- **Mô tả:** Activity log của app đã che các trường này (`logRedact`). Tuy vậy URL đầy đủ vẫn nằm trong access log mặc định của nginx (`frontend/nginx.conf` không khai `log_format`, nên `$request` có cả query string), trong log của proxy HTTPS của viện, và trong lịch sử trình duyệt. Đây là dữ liệu cá nhân theo NĐ 13/2023.
- **Đề xuất:** Chuyển sang `POST /public/lookup` với dữ liệu trong body, như các route `/course-registration/:code/status` đã làm. Cần sửa đồng thời frontend (vùng `frontend-cleanup`), nên ghi lại để làm chung.

### S-06 — Thấp — Kiểm "vượt số còn phải nộp" nằm ngoài transaction (race nộp trùng)

- **Vị trí:** `tuitionService.js:448` (`recordPayment`), `:233` (`submitMine`), `:498` (`confirmPayment` không kiểm lại số còn lại).
- **Mô tả:** Hai cán bộ ghi nhận cùng lúc, hoặc học viên gửi hai lần song song, đều qua được bước kiểm rồi cùng INSERT, gây nộp thừa. Xác nhận nhiều khoản chờ có tổng vượt số phải nộp cũng không bị chặn. Hệ thống có hiển thị `overpaid` nên không mất dữ liệu, nhưng biên lai vẫn được cấp cho số tiền thừa.
- **Đề xuất:** Trong transaction, `SELECT ... FROM enrollment_fees WHERE enrollment_id = @eid FOR UPDATE` (sau `ensureFeeRow`), rồi tính lại số còn lại trước khi INSERT / xác nhận.

### S-07 — Thấp — Thông báo học phí gửi tới mọi người có `courses:approve`, kể cả phạm vi `assigned`

- **Vị trí:** `tuitionService.js:166` (`approvers`).
- **Mô tả:** Giảng viên có `courses:approve@assigned` nhận được thông báo "<họ tên học viên> báo đã chuyển khoản <số tiền> khoá <tên khoá>" của cả những khoá không được phân công. Lỗi cùng loại với S-04, nhưng nằm ở kênh thông báo.
- **Đề xuất:** Lọc người nhận theo phân công của khoá (`lecturer_assignments`), hoặc chỉ gửi cho người có phạm vi `all`.

### S-08 — Thấp — Nộp khảo sát không nằm trong transaction

- **Vị trí:** `backend/src/modules/surveys/surveyService.js:254` (`submitResponse`).
- **Mô tả:** INSERT `survey_responses` và từng `survey_answers` là các câu riêng lẻ. Nếu lỗi giữa chừng (DB rớt, đáp án quá dài), phản hồi bị lưu dở, và người dùng không nộp lại được vì nhận 409 "đã nộp". `answer_options` cũng không được đối chiếu với các lựa chọn của câu hỏi.
- **Đề xuất:** Bọc trong `withTransaction`; kiểm `answer_options` thuộc `question.options`.

### S-09 — Thấp — Tự đặt lại / tự đổi mật khẩu thành công không ghi `security_events`

- **Vị trí:** `backend/src/modules/auth/passwordResetService.js:128` (`resetPassword`); `authService.changePassword`.
- **Mô tả:** Chỉ lần thử sai (`password_reset_failed`) và đặt lại bởi admin (`password_reset_by_admin`) được ghi vào `security_events`. Lần đặt lại bằng OTP thành công thì chỉ có trong activity log (file). Trang Sự kiện bảo mật và cảnh báo vì vậy không thấy được dấu hiệu chiếm tài khoản qua hộp thư.
- **Đề xuất:** Ghi `password_reset_self` / `password_changed` (actor, IP) sau khi đổi thành công.

### S-10 — Thấp — Khoá `url` / `image` trong `FILE_KEYS` ký mọi chuỗi `/uploads/...` mang tên trường đó

- **Vị trí:** `backend/src/utils/signedUpload.js:42`.
- **Mô tả:** Hiện chưa thấy trường người dùng tự nhập nào tên `url` hoặc `image` được trả về cho chính người nhập (đã kiểm baseline schema; giá trị trường tuỳ biến của form chỉ có khoá do admin đặt). Tuy vậy, sau này nếu thêm một cột hay trường JSON tự do tên `url`, ta sẽ lặp lại lỗi L-07 (máy ký link).
- **Đề xuất:** Chỉ ký `url` / `image` ở các response upload cụ thể, hoặc cấm đặt khoá `url` / `image` cho trường tuỳ biến trong `formConfigService`.

## Ghi chú cho các phiên khác

- `training-cleanup`: 4 file training đã sửa (xem đầu báo cáo). Khi gộp, giữ lại điều kiện `tuition_payments ... status = 'confirmed'` trong các câu DELETE và tham số `actor` của `listPending`.
- `backend-cleanup`: S-01 (`attendanceDevices`) và S-08 (`surveys`) thuộc vùng của bạn; chưa sửa.
- `frontend-cleanup`: S-05 cần đổi lời gọi `GET /public/lookup` sang POST, nếu người dùng đồng ý.
