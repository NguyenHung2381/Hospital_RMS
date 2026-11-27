# Rà soát bảo mật & toàn vẹn dữ liệu backend — 2026-11-26

Phiên `security`, nhánh `claude/review-security-479bca`.

## Tóm tắt

| Mức độ | Số lỗi | Đã sửa | Chưa sửa |
|---|---|---|---|
| Cao | 2 | 2 (S-01, S-02) | 0 |
| Trung bình | 3 | 2 (S-03, S-04) | 1 (S-05) |
| Thấp | 5 | 3 (S-06, S-07, S-09) | 2 (S-08, S-10) |

Mỗi lỗi đã sửa có test tái hiện trong `backend/test/security/`. Test đỏ trước khi sửa và xanh sau khi sửa:

- `tuitionReceiptIntegrity.test.js`: S-02, S-03
- `tuitionPendingScope.test.js`: S-04
- `tuitionPaymentRace.test.js`: S-06, S-07
- `passwordEventLog.test.js`: S-09
- `iclockDeviceGuard.test.js`: S-01 (6 ca lỗi, 3 ca đối chứng)

Các mục S-05, S-08, S-10 và phần chặn ở DB của S-02 chưa làm, đang chờ người dùng quyết.

**Đợt S-01 (máy chấm công)** sửa trong vùng `attendanceDevices` của phiên `backend-cleanup` (nhánh đó chỉ đổi dòng `module.exports` của `iclockService.js`, gộp sẽ xung đột nhỏ):

- `backend/src/modules/attendanceDevices/iclockGuard.js` (file mới): `ipGate` (lớp 1), `ipChange` (lớp 2)
- `backend/src/modules/attendanceDevices/iclock.routes.js`: `ipGate` đặt trước mọi xử lý; giới hạn theo số serial; `/ping` chuyển lên trước
- `backend/src/modules/attendanceDevices/iclockService.js`: `findDevice` đọc thêm cờ đổi IP; `resolveDevice` ghi `prev_ip` / `ip_changed_at`, tạm khoá khi xung đột (`suspendForConflict`); `getRequest` giữ lệnh khi vừa đổi IP
- `backend/src/modules/attendanceDevices/deviceAdminService.js`: mở lại máy thì xoá dấu vết đổi IP; danh sách máy trả `suspended_at`, `suspend_reason`, máy tạm khoá xếp lên đầu
- `backend/src/modules/audit/securityAlertService.js`: `iclock_serial_conflict` (cảnh báo ngay), `iclock_ip_blocked` (cảnh báo khi dồn dập)
- `backend/src/utils/attendancePolicy.js`: export thêm `parseCidr`, `splitList`
- `backend/database/migrations/2027-01-10_may_cham_cong_chong_gia_serial.sql` (mới). Đã thử áp lên schema DB dev trong 1 transaction rồi rollback; **chưa áp thật** (container dev chạy code của nhánh `main`, chưa có file này). Áp bằng `npm run migrate` sau khi gộp nhánh
- Frontend (vùng `frontend-cleanup`): `features/attendance-device/` — trạng thái **Tạm khoá**, lý do, nút **Mở khoá**
- Tài liệu: `infra/may-cham-cong.md` (mục 3.1, bảng xử lý sự cố), `backend/.env.example`

**File ngoài vùng `security` đã sửa** (thuộc vùng `training-cleanup`; mỗi chỗ chỉ sửa đúng các dòng cần thiết):

- `backend/src/modules/training/courses/courseEnrollmentService.js` (`removeEnrollment`)
- `backend/src/modules/training/courses/courseService.js` (`HAS_TUITION_SQL` và `remove`)
- `backend/src/modules/training/tuition/tuitionService.js`: `cancelMine`, `listPending`; `ensureFeeRow` thêm `ON CONFLICT DO NOTHING`; `lockedSummary` kiểm lại trong transaction của `submitMine` / `recordPayment` / `confirmPayment`; thêm require `coursePolicy` và `tuitionGuards`
- `backend/src/modules/training/tuition/tuitionGuards.js` (file mới): `lockFee` (S-06), `approvers` (S-07). Tách khỏi `tuitionService` để file đó không vượt `max-lines` 500
- `backend/src/modules/training/tuition/tuitionController.js` (`listPending` truyền `req.user`)

File trong vùng `security`: `backend/src/modules/auth/authService.js`, `backend/src/modules/auth/passwordResetService.js` (S-09).

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

### S-01 — Cao — Máy chấm công `/iclock` chỉ nhận diện bằng số serial: lộ mẫu vân tay, giả được lượt chấm — ĐÃ SỬA (3 lớp)

- **Vị trí:** `backend/src/modules/attendanceDevices/iclockService.js` (`resolveDevice`, `getRequest`, `requireActive`); `iclock.routes.js`; `frontend/nginx.conf:151`; `infra/may-cham-cong.md`.
- **Mô tả:** Giao thức ADMS của máy (firmware Ver 6.60) không có xác thực. Server chỉ kiểm số serial (SN) đã được duyệt. SN in trên tem máy và nằm trong mọi URL (`?SN=`). Ai biết SN của một máy đã duyệt và gọi được tới `/iclock/` thì làm được ba việc:
  1. Gọi `GET /iclock/getrequest?SN=<sn>` để nhận các lệnh đang chờ, gồm `DATA UPDATE FINGERTMP ... TMP=<mẫu vân tay>` và thông tin học viên (dữ liệu sinh trắc học, NĐ 13/2023). Lệnh bị "lấy" mất nên máy thật không nhận được.
  2. Gọi `POST /iclock/cdata?SN=<sn>&table=ATTLOG` để tạo lượt chấm giả.
  3. Gửi `OPERLOG`/`BIODATA` để gắn mẫu vân tay của người khác vào mã học viên.
- **Điều kiện thực tế (người dùng xác nhận):** máy di chuyển giữa các khoa, IP đổi liên tục, nhưng **chỉ gửi từ trong mạng nội bộ của viện**. Không giới hạn được theo IP từng máy. Đã tìm hiểu: cơ chế khoá chung / đăng ký máy của "Security PUSH" chưa được xác nhận trên Ver 6.60; "Comm Key" chỉ dùng cho kết nối SDK cổng 4370.
- **Đã sửa:**
  - **Lớp 1 — dải IP:** `iclockGuard.ipGate` chỉ nhận `/iclock` từ `ICLOCK_ALLOWED_CIDRS` (mặc định `192.168.0.0/16`; theo yêu cầu người dùng **không** gồm dải máy chủ `172.16.0.0/12`, cũng không gồm `10.0.0.0/8` hay `127.0.0.1`). Request mang IP của chính proxy (`ICLOCK_PROXY_IPS`) bị chặn: backend chưa nhận được IP thật thì không cho qua (fail-closed). Ghi `security_events` `iclock_ip_blocked` (mỗi IP tối đa 1 lần / 10 phút). `/iclock/ping` vẫn mở, chỉ trả `OK`.
  - **Lớp 2 — một serial ở hai nơi:** lưu `prev_ip`, `ip_changed_at`. IP cũ quay lại trong `ICLOCK_IP_FLIP_MIN` (10) phút sau khi đổi ⇒ máy chuyển sang `suspended` (không giao lệnh, không nhận lượt chấm; máy giữ dữ liệu), ghi `security_events` `iclock_serial_conflict` và gửi email cảnh báo ngay. Máy chuyển chỗ (đổi IP một lần) không bị khoá. Quản trị bấm **Mở khoá** thì dấu vết đổi IP được xoá để theo dõi lại.
  - **Lớp 3 — giữ lệnh:** `ICLOCK_IP_HOLD_MIN` (5) phút sau khi đổi IP, `getRequest` chưa giao lệnh, nên máy giả không lấy được mẫu vân tay trước khi lớp 2 kịp khoá (nếu máy thật đang chạy). Thêm giới hạn `ICLOCK_SN_RATE_LIMIT` (240) lượt/phút theo số serial.
- **Giữ nguyên:** chỉ máy đã duyệt mới gửi/nhận dữ liệu; máy lạ vẫn vào *Chờ duyệt* (tối đa `MAX_PENDING`); giới hạn theo IP; kiểm phân hệ `TRAINING`; giới hạn body 10 MB.
- **Test:** `test/security/iclockDeviceGuard.test.js` — IP Internet và dải `172.16.x` bị chặn; IP của proxy bị chặn; giới hạn theo serial; tạm khoá khi IP cũ quay lại; giữ lệnh khi vừa đổi IP; mở lại xoá dấu vết. Đối chứng: máy `192.168.x` vẫn gửi được, `/ping` mở, máy chuyển chỗ không bị khoá, IP không đổi thì giao lệnh bình thường.
- **Việc vận hành bắt buộc (production):** đặt `TRUSTED_PROXIES=192.168.34.20` (nginx) và `ICLOCK_PROXY_IPS=192.168.34.20` (backend), rồi kiểm cột IP trên trang Máy chấm công là IP riêng của từng máy. Thiếu `TRUSTED_PROXIES` thì mọi máy bị chặn (đúng thiết kế fail-closed). Hướng dẫn: `infra/may-cham-cong.md` mục 3.1.
- **Còn hở:** người trong mạng viện biết SN vẫn giả được máy lúc máy thật tắt. Muốn chặn hẳn cần mã bí mật riêng từng máy (ví dụ tên miền con bí mật, cần DNS và chứng chỉ wildcard ở proxy, phải thử trên máy thật trước). Nên cân nhắc thêm: chặn `/iclock/` ở proxy viện với nguồn ngoài mạng nội bộ.

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

### S-06 — Thấp — Kiểm "vượt số còn phải nộp" nằm ngoài transaction (race nộp trùng) — ĐÃ SỬA

- **Vị trí:** `tuitionService.js:448` (`recordPayment`), `:233` (`submitMine`), `:498` (`confirmPayment` không kiểm lại số còn lại).
- **Mô tả:** Hai cán bộ ghi nhận cùng lúc, hoặc học viên gửi hai lần song song, đều qua được bước kiểm rồi cùng INSERT, gây nộp thừa. Xác nhận nhiều khoản chờ có tổng vượt số phải nộp cũng không bị chặn. Hệ thống có hiển thị `overpaid` nên không mất dữ liệu, nhưng biên lai vẫn được cấp cho số tiền thừa.
- **Đã sửa:** Trong transaction của `submitMine`, `recordPayment` và `confirmPayment`, sau `ensureFeeRow`, hàm `tuitionGuards.lockFee` chạy `SELECT ... FROM enrollment_fees ... FOR UPDATE` rồi đọc lại các khoản nộp. Số còn phải nộp được tính lại từ đó: học viên gửi thì trừ cả khoản đang chờ; cán bộ ghi nhận hoặc xác nhận thì tính theo số còn lại. Vượt thì trả 409 và transaction rollback, không INSERT, không cấp biên lai. `ensureFeeRow` thêm `ON CONFLICT (enrollment_id) DO NOTHING`, để hai thao tác đầu tiên chạy song song không bị lỗi khoá chính mà chờ nhau.
- **Giữ nguyên:** Bước kiểm sơ bộ ngoài transaction (trả 400 sớm, không lưu chứng từ thừa), kiểm chủ sở hữu và lượt ghi danh thuộc khoá, người thao tác (`withActorTransaction`), chặn xác nhận trùng (`confirmInTx`, `status = 'pending'`).
- **Test:** `test/security/tuitionPaymentRace.test.js`, gồm 3 ca lỗi và 1 ca đối chứng (còn đủ thì vẫn ghi nhận).

### S-07 — Thấp — Thông báo học phí gửi tới mọi người có `courses:approve`, kể cả phạm vi `assigned` — ĐÃ SỬA

- **Vị trí:** `tuitionService.js:166` (`approvers`).
- **Mô tả:** Giảng viên có `courses:approve@assigned` nhận được thông báo "<họ tên học viên> báo đã chuyển khoản <số tiền> khoá <tên khoá>" của cả những khoá không được phân công. Lỗi cùng loại với S-04, nhưng nằm ở kênh thông báo.
- **Đã sửa:** `tuitionGuards.approvers(courseId)` chỉ trả người có `courses:approve` với phạm vi hiệu lực `all`, cộng với người có phạm vi `assigned` **và** được phân công khoá đó (`lecturer_assignments`, giảng viên còn hoạt động). Đây là cùng điều kiện mà `listPending` và `router.param` của khoá học đang dùng. `submitMine` truyền `row.course_id` vào.
- **Test:** `tuitionPaymentRace.test.js` (ca S-07).

### S-08 — Thấp — Nộp khảo sát không nằm trong transaction

- **Vị trí:** `backend/src/modules/surveys/surveyService.js:254` (`submitResponse`).
- **Mô tả:** INSERT `survey_responses` và từng `survey_answers` là các câu riêng lẻ. Nếu lỗi giữa chừng (DB rớt, đáp án quá dài), phản hồi bị lưu dở, và người dùng không nộp lại được vì nhận 409 "đã nộp". `answer_options` cũng không được đối chiếu với các lựa chọn của câu hỏi.
- **Đề xuất:** Bọc trong `withTransaction`; kiểm `answer_options` thuộc `question.options`.

### S-09 — Thấp — Tự đặt lại / tự đổi mật khẩu thành công không ghi `security_events` — ĐÃ SỬA

- **Vị trí:** `backend/src/modules/auth/passwordResetService.js:128` (`resetPassword`); `authService.changePassword`.
- **Mô tả:** Chỉ lần thử sai (`password_reset_failed`) và đặt lại bởi admin (`password_reset_by_admin`) được ghi vào `security_events`. Lần đặt lại bằng OTP thành công thì chỉ có trong activity log (file). Trang Sự kiện bảo mật và cảnh báo vì vậy không thấy được dấu hiệu chiếm tài khoản qua hộp thư.
- **Đã sửa:** Ghi `security_events` sau khi đổi thành công:
  - `passwordResetService.resetPassword` ghi `password_reset_self` (actor = target = người dùng, IP).
  - `authService.changePassword` ghi `password_changed` (actor, IP, user agent).
  - Hai loại này không được thêm vào danh sách gửi email cảnh báo ngay (`securityAlertService.IMMEDIATE`), để quản trị không nhận email mỗi lần có người đổi mật khẩu. Nếu muốn cảnh báo khi xảy ra dồn dập, có thể thêm vào `BURST`.
  - `securityEvents.log` không bao giờ throw, nên lỗi ghi nhật ký không làm hỏng việc đổi mật khẩu.
- **Test:** `test/security/passwordEventLog.test.js`, gồm 2 ca lỗi và 1 ca đối chứng (sai OTP thì không ghi).

### S-10 — Thấp — Khoá `url` / `image` trong `FILE_KEYS` ký mọi chuỗi `/uploads/...` mang tên trường đó

- **Vị trí:** `backend/src/utils/signedUpload.js:42`.
- **Mô tả:** Hiện chưa thấy trường người dùng tự nhập nào tên `url` hoặc `image` được trả về cho chính người nhập (đã kiểm baseline schema; giá trị trường tuỳ biến của form chỉ có khoá do admin đặt). Tuy vậy, sau này nếu thêm một cột hay trường JSON tự do tên `url`, ta sẽ lặp lại lỗi L-07 (máy ký link).
- **Đề xuất:** Chỉ ký `url` / `image` ở các response upload cụ thể, hoặc cấm đặt khoá `url` / `image` cho trường tuỳ biến trong `formConfigService`.

## Ghi chú cho các phiên khác

- `training-cleanup`: 4 file training đã sửa và thêm file mới `tuition/tuitionGuards.js` (xem đầu báo cáo). Khi gộp, giữ lại:
  - điều kiện `tuition_payments ... status = 'confirmed'` trong các câu DELETE;
  - tham số `actor` của `listPending`;
  - `lockedSummary` (gọi `lockFee`) trong 3 transaction ghi tiền;
  - `approvers(row.course_id)`.
  
  Đợt S-06/S-07/S-09 không đụng thêm vào `courseService.js`.
- `backend-cleanup`: S-01 đã sửa trong `attendanceDevices` (xem đầu báo cáo). Khi gộp giữ `ipGate`, `snLimiter`, phần `prev_ip` / `ip_changed_at` / `ip_hold` trong `iclockService`. S-08 (`surveys`) chưa sửa.
- `frontend-cleanup`: `features/attendance-device/` có thêm trạng thái `suspended` (S-01). S-05 cần đổi lời gọi `GET /public/lookup` sang POST, nếu người dùng đồng ý.
