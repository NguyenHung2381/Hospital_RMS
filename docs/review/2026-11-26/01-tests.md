# 01 — Kiểm thử (phiên `tests`)

Ngày: 2026-11-26. Nhánh: `claude/review-tests-10bdf5` (tách từ `60d56a71`). Chỉ thêm file mới trong `backend/test/**`; không sửa `src`.

## 1. Kết quả các lệnh kiểm tra

Chạy trong worktree, Node v24.22.2, sau `npm ci` ở `backend/` và `frontend/`.

| Lệnh | Kết quả | Ghi chú |
|---|---|---|
| `backend: npm test` | ✅ 1081 test: 1080 pass, 1 skip | Test bị skip: `OCR thật (Tesseract) + detectMarks`, vì máy không có Tesseract và gói `vie`. Lỗi do **môi trường**, không phải code. |
| `backend: npm run test:contract` | ✅ 3/3 | |
| `backend: npm run lint` | ✅ 0 lỗi, 1 cảnh báo | `src/modules/training/courses/courses.routes.js:577` có 505 dòng, vượt `max-lines` 500. File thuộc vùng `training-cleanup`. |
| `backend: npm run typecheck` | ✅ | |
| `backend: npm run format:check` | ✅ | |
| `backend: npm run check:routes` | ✅ | 584 route: 420 kiểm tra quyền, 117 chỉ cần đăng nhập, 47 công khai. |
| `backend: npm run check:requires` | ✅ | Nạp được cả 441 file. |
| `backend: npm run check:deps` | ✅ | Không có vòng `require`. |
| `backend: npm run test:smoke` | ✅ 208/208 | Chạy bằng `docker exec hospital_rms_dev-backend-1 npm run test:smoke`, nên chạy code của **checkout chính**, không phải worktree này. Test chỉ gọi GET và rollback. Đã gọi 191 route, bỏ qua 37 route vì không lấy được mã. Lần chạy đầu tiên ghi baseline vào `backend/test-integration/.baseline/get-shapes.json` của checkout chính. File này đã nằm trong `.gitignore`. |
| `frontend: npm run lint` | ✅ | |
| `frontend: npm run build` | ✅ | Build hết 26 giây, trong đó 83% thời gian là plugin obfuscator. Không có cảnh báo. |

**Phân loại:** không có lỗi test nào do code hỏng hay do test lỗi thời. Chỉ có 1 test bị skip vì môi trường và 1 cảnh báo lint ở vùng training.

## 2. Mức phủ test theo module

Cột "file test" đếm số file `*.test.js` có `require` trực tiếp tới `src/modules/<module>/`, tính cả file trong `test/security/`. Test đi qua app thật (như `routeMatrix` hay `moduleRouteGuards`) không được đếm.

| Module | File src | File test trước | File test sau | Test mới |
|---|---|---|---|---|
| access | 6 | 8 | 8 | |
| attendance | 5 | 1 | 1 | |
| attendanceDevices | 13 | 3 | 3 | |
| audit | 9 | 7 | 7 | |
| auth | 11 | 8 | 8 | |
| **catalog** | 21 | **0** | 1 | `catalog/catalogServices.test.js` (9) |
| cme | 18 | 6 | 6 | |
| **councils** | 13 | **1** | 3 | `councils/councilAutoAssign.test.js` (8), `councils/councilAssignment.test.js` (7) |
| dashboard | 6 | 1 | 1 | chưa làm |
| events | 2 | 17 | 23 | |
| forms | 8 | 13 | 13 | |
| notifications | 6 | 13 | 13 | |
| persons | 5 | 12 | 12 | |
| portal | 11 | 4 | 4 | |
| public | 9 | 5 | 5 | |
| **rounds** | 5 | **1** | 3 | `rounds/deadlineService.test.js` (12) |
| seminars | 20 | 5 | 5 | |
| settings | 3 | 20 | 20 | |
| **staffLicenses** | 4 | **2** | 3 | `staffLicenses/staffLicenseService.test.js` (5) |
| **surveys** | 4 | **0** | 1 | `surveys/surveyService.test.js` (15) |
| system | 4 | 2 | 2 | |
| topics | 27 | 12 | 12 | |
| training | 121 | 62 | 62 | |
| users | 5 | 6 | 6 | |

Có thêm `permissions/moduleRouteGuards.test.js` (51 test). File này đối chiếu quyền cần có ở từng route của surveys, rounds, councils, external-reviewers, staff-licenses, categories, levels, round-types, departments và venues. Với mỗi route có 3 kiểm tra:
- người không có quyền bị chặn;
- người có đúng quyền được vào;
- người có các quyền khác của cùng module vẫn bị chặn.

`councils`, `portal`, `public`, `users`, `persons` và `notifications` hóa ra đã có test khá đủ, chủ yếu nằm trong `test/security/`. Vì vậy tôi dồn công sức vào `surveys`, `catalog`, `rounds` và `councils`, là những module có nhiều logic nghiệp vụ mà gần như chưa có test. Còn ít test: `dashboard`, `attendance`, `system`.

**Số test:** trước 1081 (1080 pass, 1 skip). Sau 1188 (1185 pass, 1 skip, 2 todo). Thêm 107 test, tất cả đều xanh.

Hai test `todo` ghi lại lỗi thật (mục 3, #1 và #5). Node chạy chúng nhưng không tính là fail. Khi lỗi được sửa, bỏ `todo` thì test trở thành test hồi quy.

Đã chạy thử trên bản gộp tạm `claude/review-backend-b73be5` + `claude/review-security-479bca` + nhánh này: 1198 test, 0 fail. Trong lúc thử phát hiện 2 test `setLevels` phụ thuộc vào cách viết cũ, vì commit `dced50c8` của backend-cleanup đổi sang một câu `INSERT…SELECT`. Đã viết lại 2 test này để kiểm theo hành vi, nên chạy được với cả hai cách viết (commit `be713fca`).

## 3. Lỗi thật tìm được (chưa sửa, cần chuyển cho phiên sở hữu)

| # | file:dòng | Mức | Mô tả | Đề xuất | Phiên nhận | Đã sửa |
|---|---|---|---|---|---|---|
| 1 | `backend/src/modules/surveys/surveyService.js:257-258` | trung bình | `submitResponse` với id khảo sát không tồn tại: `getForRespond` trả `null`, sau đó dòng 258 đọc `survey.questions` và ném TypeError, trả về **500** thay vì 404. Có test todo trong `test/surveys/surveyService.test.js`. | `if (!survey) throw httpError(404, ...)` | backend-cleanup | Chưa |
| 2 | `backend/src/modules/surveys/surveyService.js:254-299` | trung bình | Dòng `survey_responses` và các dòng `survey_answers` được ghi bằng nhiều câu riêng lẻ, không nằm trong transaction. Nếu lỗi sau khi đã ghi phản hồi, phản hồi sẽ không có câu trả lời. Khi đó UNIQUE(survey_id, respondent) chặn nộp lại (409), nên người dùng không bao giờ sửa được. Phiên security cũng ghi nhận lỗi này (S-08). | Gói trong `withActorTransaction(actor.id, ...)`. Câu trả lời ghi một lần bằng `jsonRows`. | backend-cleanup | Chưa |
| 3 | `backend/src/modules/surveys/surveyService.js:77-105` | trung bình | `setQuestions` chạy `DELETE` rồi `INSERT` từng câu, không có transaction và không ghi người thao tác. Khi khảo sát đã có phản hồi, `DELETE FROM survey_questions` vi phạm `fk_survans_question` (không có ON DELETE CASCADE, xem `database/baseline/02_constraints_indexes.sql:430`), nên sửa câu hỏi của khảo sát đã có người trả lời sẽ lỗi 500. | Chạy trong transaction có người thao tác. Nếu đã có phản hồi thì trả 409 với thông báo rõ, hoặc chỉ cho sửa câu hỏi khi khảo sát còn ở trạng thái `draft`. | backend-cleanup | Chưa |
| 4 | `backend/src/modules/surveys/surveyService.js:281-298` | thấp | `answer_options` không được đối chiếu với `options` của câu hỏi. Câu `single_choice` vẫn nhận nhiều lựa chọn, và lựa chọn lạ được lưu rồi xuất hiện trong `getResults` như một mục mới. Route chỉ kiểm `answers` là mảng. | Lọc `answer_options` theo `question.options`. Câu `single_choice` chỉ nhận tối đa 1 lựa chọn. | backend-cleanup | Chưa |
| 5 | `backend/src/modules/rounds/deadlineService.js:50-106` | trung bình | `upsert` (POST `/research-rounds/:id/deadlines/:phase`) không kiểm `start_date ≤ deadline_date` và không kiểm mốc có nằm trong thời gian của đợt hay không, trong khi `prepareBatch` (lúc tạo đợt) có kiểm cả hai. Ngày sai định dạng thành `Invalid Date` rồi gây lỗi CSDL 500. Có test todo trong `test/rounds/deadlineService.test.js`. | Dùng lại phần kiểm tra của `prepareBatch` (đọc ngày của đợt trước khi ghi). | backend-cleanup | Chưa |
| 6 | `backend/src/modules/rounds/rounds.routes.js:112-120` | thấp | DELETE `/deadlines/:phase` không kiểm `phase` (route POST có kiểm 1–9). `parseInt('abc')` cho NaN và NaN được đưa vào tham số TinyInt. | Kiểm giống route POST và trả 400. | backend-cleanup | Chưa |
| 7 | `backend/src/modules/councils/councilAutoAssignService.js:112-250` | trung bình | `autoAssign` tạo hội đồng, thêm 5 ghế, gán đề tài và chia buổi bằng nhiều transaction riêng. Nếu lỗi giữa chừng (ví dụ lỗi ở ghế thứ 3 của hội đồng thứ 2), sẽ còn hội đồng nháp thiếu ghế và đề tài đã gán dở. Chạy lại thì các đề tài đã gán không còn được tính vào danh sách chưa gán. | Một transaction cho mỗi hệ chuyên môn (truyền `tx` vào `create`, `addMember`, `assignTopics`), hoặc dọn các hội đồng vừa tạo khi lỗi. | backend-cleanup | Chưa |
| 8 | `backend/src/modules/rounds/roundService.js:328-330` | trung bình | `update`: `UPDATE research_rounds`, `writeLevels` và `syncTopicLevels` chạy riêng lẻ. Phiên backend-cleanup đã ghi nhận lỗi này (mục A trong báo cáo 04). Test mới chưa phủ phần này. | Theo báo cáo 04. | backend-cleanup | Chưa |
| 9 | `backend/src/modules/training/courses/courses.routes.js:577` | thấp | Cảnh báo lint `max-lines` (505/500). | Tách nhóm route. | training-cleanup | Chưa |

Ghi chú, không tính là lỗi: GET `/departments/:id` chỉ cần đăng nhập, trong khi GET `/departments` cần `departments:read`. Đây là chủ đích, vì đã khai báo trong `src/permissions/routePolicy.js:254` là "Danh mục dropdown". Tuy vậy dữ liệu chi tiết vẫn trả về `head_full_name`, `user_count` và `topic_count`. Nếu muốn chặt hơn thì có thể cho route chi tiết trả ít trường hơn.

## 4. Test mới: kiểm gì, và lưu ý khi gộp

Tất cả các file đều dùng `test/auth/fakeDb.js` (CSDL giả) theo cùng kiểu với các test đang có. Mỗi file chạy ở tiến trình riêng.

- `surveys/surveyService.test.js`:
  - điều kiện được trả lời: trạng thái, vai trò đích, đã nộp hay chưa (403/409);
  - kiểm lại điều kiện trước khi ghi;
  - người nộp lấy từ phiên;
  - bỏ qua question_id lạ;
  - trùng UNIQUE thì trả 409, lỗi CSDL khác giữ nguyên;
  - lọc câu hỏi sai;
  - đếm kết quả, kể cả lựa chọn 0 phiếu;
  - tham số tìm kiếm được tham số hóa.
- `rounds/deadlineService.test.js`:
  - `prepareBatch`: giới hạn 9 mốc, từng loại lỗi ngày, mục bổ sung hợp lệ;
  - mã mốc vừa cột `varchar(12)`;
  - upsert và xóa đều chạy trong transaction có người thao tác;
  - chặn xóa mốc đã phát sinh hành động.
- `councils/councilAutoAssign.test.js`:
  - chia cụm (ưu tiên ít hội đồng nhất, cận dưới và cận trên);
  - loại người cùng khoa với đề tài và tài khoản khoa dùng chung;
  - không cho một người ngồi 2 ghế;
  - nếu hết người phù hợp trong viện thì lấy chuyên gia ngoài viện trong danh sách được chọn, nếu vẫn không có thì để trống ghế và cảnh báo;
  - chia buổi sáng/chiều.
- `councils/councilAssignment.test.js`:
  - chỉ gán đề tài cùng đợt;
  - xóa ghế thay thế của hội đồng cũ trước khi chuyển;
  - trả 404 khi đề tài không thuộc hội đồng;
  - ghế thay thế: thêm mới nếu chưa có, cập nhật nếu đã có.
- `catalog/catalogServices.test.js`:
  - sinh mã LDT/CD/RT dưới khóa, trong transaction; đạt 99 thì trả 409 và rollback;
  - cấp độ theo đợt và theo loại đợt, có fallback khi chưa cấu hình;
  - `setLevels` (kiểm theo hành vi): bỏ mã trùng, mã rỗng, mã lạ; rollback khi lỗi;
  - xóa khoa: gỡ liên kết theo đúng thứ tự trong một transaction.
- `staffLicenses/staffLicenseService.test.js`:
  - tạo và sửa chỉ ghi các cột có trong `fieldDefs`, mã do server sinh;
  - không đổi `user_id` khi sửa;
  - `getMentors` giới hạn kết quả trong khoảng 1..50 và tham số hóa tìm kiếm.
- `permissions/moduleRouteGuards.test.js`: xem mục 2.

**Lưu ý khi gộp:** nếu backend-cleanup đổi các câu SQL mà test đang khớp chuỗi (`INSERT INTO survey_answers`, `DELETE FROM round_deadlines`, `UPDATE topics SET council_id`...), cần sửa phần khớp chuỗi đó trong test tương ứng. Riêng `addSets` (commit `464ad62f`) đã được kiểm trên bản gộp thử và không làm vỡ test nào.

## 5. Bổ sung 27/11: dashboard, attendance, system

Số test tăng từ 1188 lên 1292 (1288 pass, 1 skip vì thiếu Tesseract, 3 todo, 0 fail). Lint, typecheck và format:check đều xanh.

Ba module này trước đây gần như chưa có test riêng. Phạm vi khoa của phân ca đã có test ở `permissions/staffAttendanceScope.test.js`; kill switch của dashboard có test ở `security/moduleKillSwitchMounts.test.js`.

| File mới | Số test | Kiểm gì |
| --- | --- | --- |
| `dashboard/dashboardService.test.js` | 8 | gộp theo trạng thái/khoa/loại bài/năm, lọc theo `@year`, cache theo năm (không làm bẩn cache), tỷ lệ lấp đầy lớp, đủ 12 tháng cho dashboard hội thảo và dashboard chung |
| `dashboard/overviewMonthsTimezone.test.js` | 2 (1 todo) | nhãn 12 tháng so với `@from` khi server chạy giờ UTC |
| `dashboard/dashboardExport.test.js` | 6 | sheet theo `sections`, tên sheet hợp lệ và không trùng, dòng tiến độ hội đồng, năm/sections rác thì dùng mặc định |
| `attendance/leaveRequestService.test.js` | 16 | giới hạn ngày theo cấu hình, chỉ học viên đang học khóa, ca phải có trong lịch, đơn trùng ⇒ 409, thông báo đúng người duyệt, duyệt theo phạm vi khoa, không tự duyệt, đơn đã xử lý ⇒ 409 |
| `attendance/shiftService.test.js` | 14 | kiểm dữ liệu ca, ký hiệu trùng, không xóa ca đang dùng, đổi mẫu mặc định trong transaction, phân ca theo lô (giới hạn ô, ca ngừng dùng ⇒ rollback) |
| `attendance/staffAttendanceService.test.js` | 11 | bảng điểm danh 1 ngày (vắng / chưa điểm danh / nghỉ có phép, đơn đã duyệt được ưu tiên), điểm danh chỉ cho học viên, gộp lý do từ chối |
| `system/systemRoutes.test.js` | 12 | `/health/db` không lộ lỗi CSDL, `/csp-report` (che token, cắt 300 ký tự, tối đa 10 báo cáo, 16kb ⇒ 413, quá 100 lần ⇒ 429), `/modules`, `/modules/menus`, `/excel/build` (tên file/sheet an toàn, chuỗi `=...` không thành công thức), `/excel/parse` |
| `permissions/dashboardAttendanceSystemGuards.test.js` | 35 | quyền cần có ở từng route của dashboard/báo cáo, điểm danh và hệ thống; route công khai |

**Lỗi thật mới (chưa sửa, thuộc backend-cleanup):**

10. `dashboardService.js:355-462` (`getOverviewStats`, dòng 361 và 452): `@from` tính theo ngày giờ VN (`todayVN()`), còn nhãn 12 tháng lại tính theo giờ máy (`new Date()`). Server chạy giờ UTC (Docker) thì trong 7 giờ đầu mỗi tháng (00:00–07:00 giờ VN), biểu đồ bỏ mất tháng hiện tại và hiện thêm một tháng ngoài cửa sổ truy vấn. Có test todo; sửa xong thì bỏ `todo`. Cách sửa: tính nhãn tháng từ `todayVN()` bằng getter UTC.

**Điểm yếu nhỏ (không viết test todo vì không giả lập ổn định được):**

- `leaveRequestService.createMine`: bước kiểm đơn trùng và bước INSERT không nằm trong transaction và không có khóa. Nếu học viên bấm gửi 2 lần cùng lúc thì có thể tạo ra 2 đơn trùng thời gian.
- `shiftService.removeShift`: bước kiểm "ca đang dùng" và bước DELETE cũng không nằm trong transaction. Nếu có người phân ca đúng lúc ca đang bị xóa, khóa ngoại sẽ báo lỗi 500.

## 6. Bổ sung 27/11: training, seminars

Số test tăng từ 1292 lên 1335 (1327 pass, 1 skip, 7 todo, 0 fail). Lint, typecheck và format:check đều xanh.

Training đã có nhiều test từ trước (42 file), nên đợt này chỉ nhắm vào những file nguồn chưa có test nào nạp tới và có logic nghiệp vụ. Seminars trước đó chỉ có test chứng chỉ.

| File mới | Số test | Kiểm gì |
| --- | --- | --- |
| `training/courseAttendanceService.test.js` | 9 | QR điểm danh (hết hạn, ký cho mục đích khác, sai purpose ⇒ 401), học viên phải thuộc lớp của buổi, 1 thiết bị chỉ điểm danh cho 1 người, điểm đã khóa thì không đổi trạng thái (cả lô ⇒ 409), máy chấm công không ghi đè điểm danh tay và giữ lần chấm sớm nhất |
| `training/questionBank.test.js` | 11 (2 todo) | lọc ngân hàng, giá trị mặc định khi tạo, đường dẫn ảnh phải trong thư mục câu hỏi, nhập hàng loạt trong 1 transaction, đổi sang tự luận thì bỏ phương án, dọn ảnh cũ khi không câu nào dùng, không xóa câu đang có trong đề; validate ở route |
| `training/examSharedLessonProgress.test.js` | 7 | bốc câu đủ số lượng hoặc báo thiếu, giữ thứ tự câu của lượt làm bài, tính lại tiến độ bài học theo đúng bộ lọc (có mặt + đi muộn đều tính là đã học) |
| `seminars/hospitalTraining.test.js` | 9 (1 todo) | bộ lọc tập huấn bệnh viện, số tiết ⇒ tín chỉ CME, ghi khoa bắt buộc, nhân viên tự đăng ký/hủy (đủ 4 lý do không được hủy) |
| `seminars/seminarStatsService.test.js` | 4 | bảng tổng hợp hội thảo do BV tổ chức, thống kê CME, phân trang sổ CME, số cuối của sổ không nhỏ hơn số đã cấp |
| `database/singleStatementQueries.test.js` | 3 (1 todo) | quét `src` tìm `.query()` ghép nhiều câu SQL; chặn trường hợp mới, 2 chỗ đã biết ghi bằng todo |

**Lỗi thật mới (chưa sửa):**

11. **(nặng)** PostgreSQL không nhận nhiều câu SQL có tham số trong 1 lần query (lỗi 42601). Đã thử cả hai chỗ trên DB dev trong transaction rồi rollback: đều báo lỗi.
    - `seminars/hospitalTraining.js:49-62` (`setRequiredDepartments`): lưu buổi tập huấn có khoa bắt buộc bị 500.
    - `topics/topicService.js:226-238` (`setRelatedDepartments`): tạo đề tài có chuyên ngành liên quan thì đề tài đã được lưu (dòng 270-279) rồi mới lỗi 500. Người dùng thấy lỗi, gửi lại sẽ tạo đề tài trùng. Sửa đề tài có chuyên ngành liên quan cũng lỗi.
    - Cách sửa: tách thành 2 lần query, chạy trong cùng 1 transaction.
    - Sửa xong thì bỏ `todo` ở `test/database/singleStatementQueries.test.js`, `test/seminars/hospitalTraining.test.js` và xóa 2 file khỏi `KNOWN`.
12. `training/exams/exams.routes.js:78-90`: `POST /exams/questions` (tạo lẻ) không kiểm đáp án đúng có nằm trong các phương án, trong khi `/questions/bulk` có kiểm. Hậu quả là lưu được câu mà chấm tự động luôn cho 0 điểm (`examAttemptService.js:244`). Có test todo.
13. `training/exams/exams.routes.js:134`: `PUT /exams/questions/:id` không có validate nào, nên sửa được câu thành nội dung rỗng, điểm âm, hoặc đáp án không có trong phương án. Có test todo.
