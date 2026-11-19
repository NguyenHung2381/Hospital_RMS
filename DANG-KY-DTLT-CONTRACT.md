# Hợp đồng chung — Form đăng ký khóa đào tạo liên tục (nội viện / ngoại viện)

File tạm cho các luồng làm song song; sẽ bị xóa khi ghép nhánh. Không sửa file này.
Nếu thấy hợp đồng thiếu hoặc mâu thuẫn với code: chọn cách ít ảnh hưởng luồng khác nhất và ghi rõ trong báo cáo cuối.

## 0. Quy tắc cho mọi luồng

- Làm việc **chỉ trong worktree của mình** (thư mục hiện tại). Tuyệt đối không đọc-ghi vào checkout chính `D:\Code\React\Hospital_RMS` ngoài việc **đọc** `node_modules` — một phiên khác đang sửa ở đó.
- Bước đầu tiên: `git merge --ff-only feat/dang-ky-dtlt` để lấy nền chung (file này, migration, hằng số, khung module). Xong việc: commit vào nhánh của worktree (tiếng Việt, kiểu `feat(training): …`), **không push, không đổi nhánh, không đụng `main`**.
- Chỉ sửa file thuộc luồng mình (mục 7). **Không ai được sửa**: `backend/src/modules/training/trainees/traineeService.js`, `backend/src/modules/forms/formRegistry.training.js`, `frontend/src/features/trainee/**`, mọi file trong `backend/database/**` (migration đã có sẵn trong nền).
- Không thêm thư viện mới vào `package.json`.
- Chạy test backend trong worktree (không có `node_modules`): đặt `NODE_PATH=D:\Code\React\Hospital_RMS\backend\node_modules`, ví dụ
  `cd backend && NODE_PATH="D:/Code/React/Hospital_RMS/backend/node_modules" REDIS_HOST=127.0.0.1 REDIS_PORT=1 node --test --test-force-exit test/security/publicRegistration.test.js`.
  Nếu không chạy được thì `npm ci` trong `backend/` của worktree. **Không** tạo junction/symlink tới `node_modules` của checkout chính.
- Frontend: `npm ci` trong `frontend/` của worktree rồi `npx tsc -b` và `npx eslint <các file đã sửa>`.
- Chỉ chạy test/lint cho file của mình; không chạy `prettier --write` hay `eslint --fix` trên cả repo.
- Giao diện, thông báo, comment: tiếng Việt, theo phong cách code sẵn có (tab, comment ngắn giải thích "vì sao").
- Báo cáo cuối: nhánh + commit, file đã sửa, lệnh kiểm tra đã chạy kèm kết quả thật, việc chưa làm / chưa kiểm được, chỗ lệch hợp đồng.

## 1. Quyết định đã chốt

1. Đơn và tờ trình xuất **Word (.docx)** bằng docxtemplater; trình duyệt xem trước / in bằng `docx-preview` (đã có ở `frontend/src/shared/components/FileViewerModal`).
2. Nội viện xác minh bằng **mã nhân viên + họ tên** ngay trên form công khai (như đăng ký hội nghị: `seminarPublicService.findStaff`). Không bắt đăng nhập.
3. Ngoại viện dùng **cùng mẫu đơn**, phần "Kính gửi" đổi thành: `Giám đốc Bệnh viện Hữu nghị Đa khoa Nghệ An; Trung tâm Đào tạo và Chỉ đạo tuyến`. Nội viện: `Khoa/Phòng/TT <tên khoa>`.
4. **OTP email bắt buộc** trước khi gửi đăng ký, tắt được bằng cấu hình `TRAINING_REGISTRATION_EMAIL_OTP = 'false'`. Nội viện: OTP gửi tới email trong hồ sơ nhân sự nếu có email thật (không phải `@member.local`), không thì gửi tới email người đăng ký nhập.
5. Một form công khai `/dang-ky-khoa-hoc` dùng cho cả hai đối tượng. Cổng nhân viên không có form riêng: nút "Đăng ký" dẫn sang `/dang-ky-khoa-hoc?khoa=<courseId>&doi-tuong=noi-vien`.
6. Duyệt ghi danh có bản khai đòi đủ mốc đối chiếu, tắt được bằng `TRAINING_REGISTRATION_REQUIRE_CHECKS = 'false'`. Ngoại viện: `id_checked` + `degree_checked`. Nội viện: `proposal_checked` + đã có `dossier_file_id`.
7. Không lộ dữ liệu qua cổng ẩn danh: mọi nhánh đăng ký trả **cùng hình dạng** phản hồi (kể cả honeypot); đơn chỉ in dữ liệu người đó vừa khai (snapshot), không lấy từ hồ sơ cũ; **không cập nhật** hồ sơ học viên đã có bằng dữ liệu form (phòng Đào tạo đối chiếu rồi sửa tay).

## 2. CSDL

Migration `backend/database/migrations/2026-12-27_dang_ky_khoa_hoc_don_va_xac_minh.sql` (đã có trong nền):

- `course_registrations` — khóa chính `enrollment_id` (FK `course_enrollments`, xóa theo). Cột: `registration_code` (duy nhất), `source` ('internal' | 'external'), `channel` ('public' | 'portal'), `staff_user_id`, `staff_number`, `department_id`, `snapshot` (text, chuỗi JSON), `rules_version`, `rules_accepted_at`, `declared_true_at`, `verified_email`, `email_verified_at`, `invoice_org_name`, `invoice_org_address`, `invoice_tax_code`, `invoice_budget_code`, `invoice_email`, `id_checked_at/by`, `degree_checked_at/by`, `proposal_checked_at/by`, `dossier_file_id` (FK `training_files`), `dossier_uploaded_at`, cột audit.
- `registration_email_otps` — `id` (mã thử thách, 32 ký tự hex), `email_hash` (sha256 email chữ thường), `staff_user_id`, `code_hash`, `attempts`, `expires_at`, cột audit.

Phiên khác đang thêm vào bảng `trainees` 3 cột `degree_number`, `degree_registry_number`, `ethnicity` (migration `2026-12-26_…`, kèm sửa `traineeService.create/update`). Code của ta **chỉ truyền** 3 khóa này trong `data` gọi `traineeService.create`; chưa ghép thì chúng bị bỏ qua, không lỗi.

## 3. Trường dữ liệu

Tên khóa dùng thống nhất ở API, snapshot, Cấu hình form `course_registration`. Danh sách chuẩn: `backend/src/modules/training/registration/registrationConstants.js` (`SNAPSHOT_FIELDS`, `TRAINEE_FIELDS`, `INVOICE_FIELDS`, `CHECK_KEYS`, `CLASS_RULES`, `RULES_VERSION`, `ID_ISSUE_PLACES`).

| Khóa | Nhãn | Kiểu | Mặc định bắt buộc | Ghi vào hồ sơ học viên |
|---|---|---|---|---|
| `source` | Đối tượng (nội viện / ngoại viện) | 'internal' \| 'external' | có (khóa cứng) | — |
| `full_name` | Họ và tên | text ≤150 | có (khóa cứng) | có |
| `dob` | Ngày sinh | date | có | có |
| `gender` | Giới tính | male/female/other | có | có |
| `ethnicity` | Dân tộc | text ≤50 | không | có |
| `hometown` | Quê quán | text ≤255 | không | không (chỉ snapshot) |
| `national_id` | Số CCCD | text ≤20 | có | có |
| `national_id_issued_date` | Ngày cấp | date | có | có |
| `national_id_issued_place` | Nơi cấp | text ≤200 | có | có |
| `permanent_address` | Địa chỉ thường trú | text ≤255 | có | có |
| `address` | Địa chỉ liên hệ | text ≤255 | không | có |
| `phone` | Số điện thoại | text ≤20 | có | có |
| `email` | Email | email ≤100 | có | có |
| `qualification` | Trình độ | text ≤150 | có | có |
| `graduated_school` | Trường tốt nghiệp | text ≤200 | có | có |
| `graduated_year` | Năm tốt nghiệp | số nguyên 1900–2100 | có | có |
| `graduated_major` | Chuyên ngành tốt nghiệp | text ≤200 | không | không |
| `degree_number` | Số hiệu văn bằng | text ≤50 | có | có |
| `degree_registry_number` | Số vào sổ cấp bằng | text ≤50 | có | có |
| `workplace` | Đơn vị công tác | text ≤200 | không | có |
| `work_specialty` | Chuyên ngành đang công tác | text ≤200 | không | không |
| `work_seniority` | Thâm niên công tác | text ≤100 | không | không |
| `trainee_type_id` | Đối tượng học viên | danh mục | không | có |
| `staff_number` | Mã nhân viên | số 1–9 chữ số | có khi `source = internal` | — |
| `department_id` | Khoa/Phòng/TT đang công tác | danh mục | có khi `source = internal` | có |
| `invoice_org_name` | Tên đơn vị (hóa đơn) | text ≤255 | không | — (cột riêng) |
| `invoice_org_address` | Địa chỉ đơn vị | text ≤255 | không | — |
| `invoice_tax_code` | Mã số thuế đơn vị | text ≤20 | không | — |
| `invoice_budget_code` | Mã đơn vị quan hệ ngân sách | text ≤20 | không | — |
| `invoice_email` | Email nhận hóa đơn | email ≤100 | không | — |
| `rules_accepted` | Cam kết thực hiện nội quy | boolean | phải là true (khóa cứng) | — |
| `declared_true` | Cam kết thông tin đúng sự thật | boolean | phải là true (khóa cứng) | — |

Nội viện: khoa/phòng và trình độ lấy từ hồ sơ nhân sự sau khi khớp mã nhân viên + họ tên (server không tin giá trị form gửi cho 2 trường này). Thông tin hóa đơn chỉ hỏi ngoại viện.

Kiểm CCCD: `backend/src/utils/nationalId.js` / `frontend/src/shared/utils/nationalId.ts` (`checkNationalId(value, { dob, gender })`). Sai cấu trúc hoặc lệch giới tính / năm sinh ⇒ chặn gửi (400 ở server).

## 4. API

Tiền tố `/api/v1`. Phản hồi theo `utils/response.js` (`{ success, data, message }`).

### 4.1 Công khai — luồng L2 làm, luồng L4 gọi (`/public/...`)

Mọi route có rate-limit theo IP; route mới phải khai ở mục `public` của `permissions/routePolicy.js`.

| Route | Body | Trả về |
|---|---|---|
| `GET /public/course-registration/rules` | — | `{ version, rules: string[], id_issue_places: string[], email_otp_required: boolean }` |
| `POST /public/course-registration/staff-check` | `{ staff_number, full_name }` | 200 `{ full_name, department_id, department_name, qualification, email_masked: string \| null }`; không khớp ⇒ 404 thông báo chung |
| `POST /public/course-registration/email-otp` | `{ source, email, staff_number?, full_name?, captcha_token, captcha_answer }` | 200 `{ challenge_id, to_masked, ttl_min }` (luôn cùng hình dạng) |
| `POST /public/course-registration/email-otp/verify` | `{ challenge_id, code }` | 200 `{ email_token }` (JWT 30 phút); sai / hết hạn ⇒ 400 thông báo chung |
| `POST /public/course-registration` (đã có, multipart: `data` = JSON, `files` = tối đa 1 PDF) | mọi khóa ở mục 3 + `course_id`, `program_id?`, `custom?`, `email_token` (khi bật OTP), `captcha_token`, `captcha_answer`, `website` (honeypot) | 201 `{ submitted: true, registration_code, download_token }` — **cùng hình dạng ở mọi nhánh** |
| `POST /public/course-registration/:code/status` | `{ national_id }` hoặc `{ email }` hoặc `{ download_token }` | `{ registration_code, full_name, source, course_name, program_name, enrollment_status, registered_at, needs_dossier: boolean, dossier_uploaded_at, checks: { id_checked, degree_checked, proposal_checked } }`; sai ⇒ 404 chung |
| `POST /public/course-registration/:code/application` | như trên | file .docx (Đơn đăng ký) |
| `POST /public/course-registration/:code/dossier` (multipart: `data` = JSON như trên, `files` = đúng 1 PDF) | | `{ uploaded: true, dossier_uploaded_at }` |

- `download_token`: JWT 30 phút gắn `enrollment_id`, để màn "đăng ký thành công" tải đơn ngay mà không phải nhập lại CCCD. Yếu tố thứ hai luôn gửi trong **body** (POST), không đưa CCCD / email lên URL.
- `needs_dossier` = `source === 'internal'` và chưa có `dossier_file_id`.
- Nhánh nội viện khi gửi đăng ký: server khớp lại mã nhân viên + họ tên, ghi danh bằng `courseEnrollmentService.registerStaff(courseId, userId, null, { programId })`, ghi `staff_user_id`, `staff_number`, `department_id` vào bản khai.
- Gửi đăng ký xong: gửi email xác nhận kèm mã đăng ký tới email đã xác minh (không chặn phản hồi nếu gửi lỗi).

### 4.2 Cổng nhân viên — luồng L5 (`/me/...`, đã đăng nhập)

| Route | Trả về |
|---|---|
| `GET /me/course-registrations` | bản khai của tôi (`courseRegistrationService.listByStaff`), kèm `needs_dossier` |
| `GET /me/course-registrations/:enrollmentId/application` | .docx đơn của tôi |
| `POST /me/course-registrations/:enrollmentId/dossier` (multipart, 1 PDF) | `{ uploaded: true, dossier_uploaded_at }` |
| `GET /me/department-proposals` | các nhóm (khóa + chương trình) có nhân viên khoa tôi đăng ký: `{ course_id, course_name, program_id, program_name, department_id, department_name, people: [...] }[]` |
| `GET /me/department-proposals/document?course_id=&program_id=` | .docx Tờ trình của khoa tôi |

Quyền xem nhóm / tải tờ trình của một khoa: tài khoản khoa (`utils/deptAccount.js`), trưởng khoa của khoa đó, hoặc người có bản khai trong chính nhóm đó.

### 4.3 Quản trị — luồng L5 (`/courses/...`, `authorizePermission(['courses', 'read' | 'update'])`)

| Route | Trả về |
|---|---|
| `GET /courses/enrollments/:enrollmentId/registration` | bản khai (snapshot đã parse) + `diffs: { key, declared, profile }[]` so với hồ sơ học viên + `checks`; không có ⇒ `null` |
| `PUT /courses/enrollments/:enrollmentId/registration/checks` | body `{ id_checked?, degree_checked?, proposal_checked? }` ⇒ bản khai sau khi sửa |
| `GET /courses/enrollments/:enrollmentId/registration/application` | .docx đơn |
| `GET /courses/enrollments/:enrollmentId/registration/dossier` | file PDF hồ sơ nộp bổ sung (theo cách tải file đang dùng cho giấy tờ học viên) |
| `GET /courses/:id/proposals` | các nhóm nội viện của khóa theo khoa + chương trình |
| `GET /courses/:id/proposals/document?department_id=&program_id=` | .docx Tờ trình |

Chặn duyệt (quyết định 6) đặt trong luồng duyệt 1 lượt và duyệt hàng loạt; thông báo nói rõ còn thiếu mốc nào.

## 5. Module nội bộ (chữ ký trong file khung — không đổi chữ ký)

- `backend/src/modules/training/registration/courseRegistrationService.js` — L2 cài: `genCode`, `create`, `getByEnrollment`, `getByCode`, `listByStaff`, `setChecks`, `attachDossier`, `listInternalGroups`. L5 chỉ gọi.
- `backend/src/modules/training/registration/registrationDocumentService.js` — L3 cài: `renderApplication(data)`, `renderProposal(data)`, hàm thuần không đọc CSDL. L2 và L5 gom dữ liệu rồi gọi.
- Luồng gọi module của luồng khác: `require` bình thường (file khung đã có); test của mình thì mock hàm đó.

## 6. Giấy tờ Word

Mẫu gốc (chưa có biến): `backend/templates/training/goc/don-dang-ky-dtlt.goc.docx`, `to-trinh-dtlt.goc.docx`. L3 chuyển thành mẫu có biến `backend/templates/training/don-dang-ky-dtlt.docx`, `to-trinh-dtlt.docx` rồi xóa thư mục `goc/`.

Đơn đăng ký: giữ nguyên bố cục mẫu (quốc hiệu, tiêu đề, các dòng thông tin, 3 cam kết, nơi ký). Điền: họ tên **in hoa**, dân tộc, ngày sinh `dd/mm/yyyy`, quê quán, số CCCD, ngày cấp, nơi cấp, địa chỉ liên hệ (`address`, trống thì dùng `permanent_address`), điện thoại, email, trường tốt nghiệp, năm tốt nghiệp, chuyên ngành tốt nghiệp (`graduated_major`, trống thì `qualification`), cơ quan đang công tác (nội viện: `Bệnh viện Hữu nghị Đa khoa Nghệ An – <khoa>`), chuyên ngành đang công tác, thâm niên, khóa đào tạo đăng ký (`course_name` + `program_name`), "Nghệ An, ngày … tháng … năm …" theo `created_at`, họ tên dưới chỗ ký. Thêm dòng **Mã đăng ký: <registration_code>** ở cuối trang. Ô trống in dòng chấm để điền tay.

Tờ trình: tên khoa (mọi chỗ "KHOA: …", "khoa ……"), năm, tên lớp (`course_name` / `program_name`), bảng danh sách lặp theo `people` (TT, MNV, Họ tên, Năm sinh, TĐCM), nội dung lớp học, thời gian từ ngày … đến ngày …, kinh phí (`tuition_fee` định dạng `1.500.000`), bảng phân tích nhu cầu đào tạo: nội dung đào tạo = tên lớp, `technique`, `certified_count`, `proposed_count` (mặc định = số người trong `people`), `in_other_training_count`, `reason`; ô không có dữ liệu để trống cho khoa ghi tay. Giữ nguyên phần ký (Lãnh đạo Trung tâm ĐT-CĐT, Trưởng khoa).

## 7. Phân chia file

| Luồng | Được sửa / tạo |
|---|---|
| **L2** Backend công khai | `backend/src/modules/public/**`, `backend/src/modules/forms/formRegistry.js` (chỉ form `course_registration`), `backend/src/modules/training/registration/courseRegistrationService.js` + file mới cùng thư mục cho OTP email, `backend/src/modules/notifications/mailService.js`, `backend/src/jobs/**` (dọn OTP hết hạn), `backend/src/permissions/routePolicy.js` (chỉ mục `public`), `backend/src/utils/**` nếu cần loại file / đường upload mới, `backend/test/**` cho phần của mình |
| **L3** Giấy tờ Word | `backend/src/modules/training/registration/registrationDocumentService.js`, `backend/templates/training/**`, `backend/scripts/` (script dựng mẫu, nếu cần), `backend/test/training/registrationDocument*.test.js` |
| **L4** Form công khai | `frontend/src/features/public/**`, `frontend/src/app/router/publicRoutes.tsx` |
| **L5** Nội viện + duyệt | `backend/src/modules/portal/**`, `backend/src/modules/training/courses/**`, `backend/src/permissions/routePolicy.js` (chỉ mục `authOnly`), file mới trong `backend/src/modules/training/registration/` (tên khác 2 file khung), `backend/test/**` cho phần của mình, `frontend/src/features/portal/**`, `frontend/src/features/course/**` |

Cần sửa file ngoài phần mình: không sửa, ghi vào báo cáo để người ghép xử lý.
