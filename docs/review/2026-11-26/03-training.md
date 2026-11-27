# 03 — Rà soát module `training`

- Phiên: `training-cleanup` · Nhánh: `claude/review-training-d74783` (gốc `60d56a71`)
- Phạm vi: `backend/src/modules/training/` (≈24.500 dòng) và test của nó
- Ngày: 2026-11-26

## Kết quả

| Chỉ số | Trước | Sau |
|---|---|---|
| Dòng trong `src/modules/training` | 24.491 | 24.396 (**−95**; tính cả 3 file mới `customFormCrud.js`, `importText.js`, `courseGradeRoutes.js` — riêng việc tách route thêm 19 dòng đầu file/bọc hàm, D1 thêm 16 dòng chú thích/bọc transaction) |
| `npm test` | 1080 qua / 0 lỗi* | 1110 qua / 0 lỗi (thêm 30 test đơn vị) |
| `npm run lint` | 0 lỗi, 1 cảnh báo | 0 lỗi, 0 cảnh báo |
| Smoke trên DB dev (`test-integration/**`, so baseline dựng từ `60d56a71`) | — | 218 test, 216 qua, 2 bỏ qua (thiếu dữ liệu mẫu), 0 lỗi; 192 route GET giữ nguyên mã HTTP và tập trường JSON |

\* Lần chạy mốc đầu tiên báo 4 file lỗi (`test/cme/cmeCycleCompliance`, `test/security/courseLecturerCme`, `gradeLockOutcome`, `moduleKillSwitchMounts`). Chạy riêng từng file đều qua; các lần chạy đầy đủ sau đó cũng qua. Đây là lỗi chập chờn do máy tải nặng (7 phiên cùng chạy), không phải lỗi code.

Cách chạy smoke: chép `src/` + `test-integration/` của từng commit vào `/tmp/rvb` (gốc) và `/tmp/rvh` (HEAD) trong container `hospital_rms_dev-backend-1`, nối `node_modules` và `.env` của `/app`. Bản gốc ghi baseline, bản HEAD so với baseline đó. Container vẫn phục vụ checkout chính và không bị đụng tới. Các thư mục `/tmp/rv-training`, `/tmp/rvb`, `/tmp/rvh`, `/tmp/rvd1`, `/tmp/rvd2` và file `/tmp/rvb.tar`, `/tmp/rvh.tar`, `/tmp/rvd1.tar`, `/tmp/rvd2.tar` còn lại trong container (lệnh xoá bị công cụ chặn). Có thể xoá tay hoặc để mất khi tạo lại container.

## Thay đổi đã làm (xếp theo mức rủi ro)

### Rủi ro thấp nhất — chỉ đổi cấu trúc, hành vi giữ nguyên

**1. Bỏ 34 export không nơi nào dùng** (commit `31948235`)
Quét `src/`, `test/`, `scripts/`, `test-integration*`: các tên dưới đây không xuất hiện ở file nào khác. Mọi hàm/hằng **vẫn được dùng trong chính file đó**: chỉ bỏ khỏi `module.exports`, không xoá code.
Danh sách: `classSessionService.ASSISTANTS_SQL`, `courseCmeService.SOURCE`, `enrollmentExportService.DEFAULT_STATUSES`, `courseEnrollmentWorkbook.{STATUS_LABEL, slugify, givenName}`, `teachingPlanTemplate.KIND_LABEL`, `practiceAutoService.codeSuffix`, `practiceBookImportService.findRotationGroups`, `programClassService.isInternalTrainee`, `rotationPlanner.roundKey`, `sessionLecturerResolver.nameKeyOf`, `questionBankService.getQuestion`, `programLessonService.listLessonLecturers`, `docCheckAnalyzer.{analyzeSignatures, magicOf}`, `docCheckRules.{alnum, levenshtein, hasMrz, scoreKinds, nameFound}`, `docCheckService.{isCheckable, presentTraineeDocument}`, `pdfBytes.{derLength, parsePdfDate}`, `trustStore.splitCerts`, `visualMarks.{THRESHOLDS, TITLE_PHRASES}`, `registrationFileKinds.{REGISTRATION_FILE_KINDS, RETIRED_KINDS}`, `registrationProposalService.{proposedPeople, buildProposalData}`, `registrationUpload.FORM_MAX_FILES`, `tuitionSettings.BANKS`.
Đối chiếu với `06-dead-code.md` mục 1.2: cả 30 mục của phiên quét đều nằm trong danh sách này. Tôi bỏ thêm 4 mục (`STATUS_LABEL`, `KIND_LABEL`, `presentTraineeDocument`, `BANKS`) cũng chỉ dùng nội bộ. Không có file chết, không có hàm chết hẳn. Đối chiếu lại theo yêu cầu phiên điều phối: không còn mục nào của 06-dead-code.md nhóm training chưa xử lý (mục 1.1 file nạp động và 1.3 console/TODO đều không có gì phải làm).
Vẫn giữ nguyên: mọi code, mọi đường gọi nội bộ.

**2. Gộp `tidy` / `cleanCode` / `groupBy` trùng lặp** (commit `240dabcf`)
`courses/sessionLecturerImportService.js`, `courses/sessionLecturerResolver.js`, `programs/programLessonLecturerImportService.js` mỗi file có một bản giống hệt từng ký tự. Đã chuyển về `training/importText.js`, có test `test/training/importText.test.js`.
`programCatalogImportService.cleanCode` khác (không viết hoa) nên giữ nguyên.
Vẫn giữ nguyên: logic so khớp, đầu ra nhập Excel (các test `sessionLecturerImport`, `programLessonLecturerImport` vẫn qua).

### Rủi ro thấp — đổi cách gửi SQL, kết quả DB như cũ

**3. Gom các vòng ghi từng dòng thành 1 câu SQL** (commit `e3c22361`)
Dùng helper sẵn có `jsonValues` / `jsonRows` (cách repo đã làm ở `setLessonPrograms`, `reorderLessons`, `submitAttempt`).

| Vị trí | Trước | Sau | Vẫn giữ nguyên |
|---|---|---|---|
| `courses/classSessionService.js:224` `writeAssistants` | 1 INSERT / trợ giảng | 1 INSERT … SELECT FROM jsonValues | cùng transaction với DELETE; danh sách đã khử trùng ở `resolveAssistants` |
| `exams/examPaperService.js:80` `setPaperGraders` | 1 INSERT / người chấm | 1 INSERT … JOIN lecturers | transaction; mã GV không tồn tại vẫn bị bỏ qua |
| `programs/programLessonService.js:103` `setLessonLecturers` | 1 INSERT / GV | 1 INSERT … FROM jsonRows (lecturer_id, role) | transaction; quy tắc GV chính trùng GV phụ thì giữ vai trò chính |
| `programs/programLessonService.js:303` `linkLessons` | 2 round-trip / bài (SELECT kiểm tồn tại + INSERT) | 1 INSERT … JOIN program_lessons | bỏ bài đã gắn; mã bài không tồn tại vẫn bị bỏ nhưng vẫn giữ chỗ thứ tự và vẫn tính vào `linked` (như cũ); mã `LP` + 18 ký tự hex hoa (`newIdSql`, cùng định dạng `randomId`) |
| `programs/trainingProgramService.js:136` `setProgramTraineeTypes` | 2 round-trip / đối tượng | 1 INSERT … JOIN trainee_types | `display_order` = vị trí trong mảng gửi lên; mã không tồn tại bỏ qua |
| `courses/enrollmentRotationService.js:466` `schedule` | 1 UPDATE / vòng | 1 UPDATE … FROM jsonRows | ngày tính bởi `planSchedule` như cũ; thêm điều kiện `enrollment_id` (hẹp hơn, không rộng hơn) |
| `courses/waitlistTransferService.js:67` `transfer` | 1 UPDATE / hồ sơ | 1 UPDATE … WHERE id IN jsonValues | transaction + `lockWaitlist`; tính chỗ trống trong JS như cũ; vẫn kèm `status = 'waitlisted'`; 409 khi không chuyển được ai (kiểm trước câu UPDATE, vẫn rollback) |
| `courses/courseService.js:352` `setPrograms` | 1 DELETE / liên kết bị bỏ + 1 SELECT / chương trình mới | 1 DELETE + 1 SELECT cho cả danh sách | DELETE thêm điều kiện `course_id`; INSERT vẫn từng dòng vì mã `CP…` sinh tuần tự bằng `genCourseProgramId(tx)` |

Kiểm thử:
- `test/training/batchedWritesCleanup.test.js`: 7 test fakeDb kiểm số câu ghi, payload JSON và COMMIT/ROLLBACK.
- `test-integration/trainingBatchedWrites.test.js`: chạy thật trên PostgreSQL dev trong 1 transaction rồi ROLLBACK. Chặn `withActorTransaction` để không có gì được COMMIT. Kết quả 8 qua, 2 bỏ qua. `setPaperGraders` và `transfer` bỏ qua vì DB dev không có đề thi / hồ sơ chờ chuyển được; hai câu SQL đó đã được `EXPLAIN` trên PG thật để kiểm cú pháp và kiểu.

### Rủi ro thấp-trung bình — gộp handler HTTP

**4. Gộp CRUD controller có trường tuỳ chỉnh** (commit `1df42f31`)
`courseController`, `lecturerController`, `trainingProgramController`, `traineeController` mỗi file viết lại 5 handler `getAll/getById/createOne/updateOne/removeOne` gần như giống hệt (gắn/lưu `formCustomValueService`). Đã chuyển về `training/customFormCrud.js` với 2 tuỳ chọn giữ đúng khác biệt cũ:

| Thực thể | `scoped` (truyền `req.user`) | `removeCustom` (xoá giá trị trường tuỳ chỉnh khi xoá) |
|---|---|---|
| course | có | có |
| training_program | không | có |
| lecturer | không | không (`lecturerService.remove` tự xoá ở nhánh xoá cứng) |
| trainee | có | không (học viên chỉ ẩn, không xoá cứng) |

Không dùng `shared/crudController.js` vì nó không có bước trường tuỳ chỉnh và thuộc phiên `backend-cleanup`.
Vẫn giữ nguyên: `authorizePermission` + `formConfigGuard` ở route, validate ở service, hình dạng response và thông điệp (`'Cập nhật thành công'`, `'Xóa thành công'`, 201 khi tạo, 404 khi không thấy). Smoke GET không đổi. Test: `test/training/customFormCrud.test.js`.

### Rủi ro thấp — chỉ dời vị trí khai báo route

**5. Tách route Điểm / Giấy chứng nhận / CME khỏi `courses.routes.js`** (hết cảnh báo lint `max-lines`)
Khối 56 dòng chuyển nguyên văn sang `courses/courseGradeRoutes.js`. Các route trong khối: `/:id/grades*`, `/:id/gradebook`, `/enrollments/:enrollmentId/grades/*`, `/grades/:gradeId`, `/:id/certificates*`, `/certificates*`, `/:id/cme-sync`.
File mới làm theo đúng mẫu `coursePracticeRoutes.js` / `sessionImportRoutes.js`: hàm nhận `router` của khóa học và đăng ký thẳng vào đó, không dùng sub-router. Nó được gọi tại đúng vị trí cũ (sau Documents, trước `courseTuitionRoutes`).
Vẫn giữ nguyên:
- `router.use(authenticate)`.
- `router.param` kiểm phạm vi khóa cho `:id` / `:enrollmentId` / `:gradeId` / `:certId`: vẫn áp dụng vì cùng một router.
- `authorizePermission`, validator và thứ tự từng route.

Đã kiểm, đều qua:
- `test/contract/routeInventory.test.js`: khớp `routes.snapshot.txt`, không có hai route trùng method + path.
- `check:routes`: mọi route đều khai báo phân quyền.
- `test/security/gradeLockOutcome.test.js` và `test/security/courseTeachingScope.test.js`.

### Rủi ro trung bình — đổi ranh giới transaction (người dùng đã duyệt D1)

**6. Ghi khóa học và chương trình áp dụng chung 1 transaction** (`courses/courseService.js`)
Trước: `create` / `update` ghi `courses` trong một transaction riêng (commit xong), rồi `setPrograms` đọc và DELETE trên pool (tự commit từng câu), mỗi INSERT `course_programs` lại một `withTransaction` riêng. INSERT lỗi giữa chừng thì khóa học đã mất liên kết cũ mà chưa có đủ liên kết mới, còn thay đổi của `courses` vẫn được giữ.
Sau:
- `setPrograms(tx, courseId, programIds, actorId)` chạy toàn bộ (đọc liên kết hiện có, DELETE, kiểm `training_programs`, INSERT từng dòng) trên `tx` do nơi gọi truyền vào.
- `create` (`:206`) gọi nó trong chính `withActorTransaction` có câu INSERT `courses`. `update` (`:246`) bọc câu UPDATE `courses` cùng `setPrograms` vào một `withActorTransaction`, thay cho `actorRequest` (vốn cũng là `withActorTransaction` cho đúng 1 câu).
- Lỗi ở bất kỳ bước nào ⇒ ROLLBACK cả lần ghi, ném lại lỗi gốc như cũ.

Vẫn giữ nguyên:
- Người thao tác cho trigger audit: câu UPDATE `courses` vẫn chạy sau `withActor(tx, actorId)` (trigger `BEFORE UPDATE` đọc `app.current_user_id`). `course_programs` không có trigger audit nên không có gì đổi về audit; `created_by` vẫn là `actorId`.
- Phân quyền ở route, validator, câu SQL (từng câu giống hệt, kể cả điều kiện `course_id` ở DELETE), cách bỏ qua mã chương trình không tồn tại, mã `CP…` sinh bằng `genCourseProgramId(tx)`. Khoá sinh mã là `pg_advisory_xact_lock` nên gọi lại trong cùng transaction không tự chặn; MAX+1 thấy dòng vừa chèn trong cùng transaction.
- `broadcast`, `getById`, `programClassService.refreshCourse` vẫn chạy sau commit như cũ. Hình dạng response không đổi.
- Không đụng `remove` / `HAS_TUITION_SQL`.

Khác biệt nhỏ chấp nhận được: khoá sinh mã khóa học (`gen_course_id_KH…`, trong `create`) giữ lâu hơn một chút, tới khi gắn xong chương trình (vài câu SQL).
Đã bỏ import `actorRequest`, `withTransaction` của `courseService.js` vì không còn dùng.

Test: `test/training/courseSetPrograms.test.js` (4 test) đánh số từng transaction trong fakeDb, kiểm UPDATE/INSERT `courses` và mọi câu của `setPrograms` cùng một transaction, có câu đặt người thao tác, 1 COMMIT; INSERT lỗi ⇒ ROLLBACK cả transaction (kể cả câu DELETE và câu ghi `courses`). Chạy các test này trên `courseService.js` bản trước thì 3/4 lỗi, đúng như mong đợi.
`test-integration/trainingBatchedWrites.test.js` đổi lời gọi sang `setPrograms(tx, …)` và chạy lại trên PostgreSQL dev (transaction ROLLBACK, bản chép ở `/tmp/rvd1` trong container): 8 qua, 2 bỏ qua như trước, 0 lỗi; phần `setPrograms` qua (gỡ, gắn, bỏ mã không tồn tại, khoá sinh mã trên transaction thật). Đường `create` / `update` đầy đủ không chạy được trong harness này vì nó chặn `withActorTransaction` để không COMMIT.

**7. Ghi chương trình và đối tượng chung 1 transaction** (`programs/trainingProgramService.js`)
Trước: `create` / `update` ghi `training_programs` bằng `actorRequest` (1 transaction cho đúng 1 câu, commit xong), rồi `setProgramTraineeTypes` DELETE và INSERT `program_trainee_types` trên pool, mỗi câu tự commit. INSERT lỗi thì chương trình mất hết đối tượng.
Sau:
- `setProgramTraineeTypes(tx, programId, typeIds)` chạy DELETE + INSERT trên `tx` của nơi gọi.
- `create` (`:218`) chạy INSERT `training_programs` và `setProgramTraineeTypes` trong một `withActorTransaction`. Trùng mã chương trình vẫn đổi thành 409 `'Mã chương trình đã tồn tại.'` (`rethrowDuplicateCode`), transaction rollback, không ghi đối tượng.
- `update` (`:250`) chỉ mở `withActorTransaction` khi có gì để ghi (có trường đổi hoặc có `trainee_type_ids` / `trainee_type_id`), giống trước: không gửi gì thì không chạy câu nào. Trong đó: UPDATE (nếu có trường đổi) rồi `setProgramTraineeTypes`. Vòng lặp trường được tách thành bước lọc `fields` trước khi mở transaction để biết có cần UPDATE không; danh sách trường, giá trị (`display_order || 0`, `emptyToNull`) và câu UPDATE giữ nguyên.

Vẫn giữ nguyên: người thao tác cho trigger audit của `training_programs` (câu ghi chạy sau `withActor` trong cùng transaction); `program_trainee_types` không có trigger. Đồng bộ cột cũ `trainee_type_id` = đối tượng đầu tiên (mảng rỗng ⇒ null). Câu INSERT đối tượng (1 câu, `display_order` = vị trí, bỏ mã không tồn tại). Mã `CT…` vẫn `randomId('CT', 18)`. `broadcast` và `getById` chạy sau commit; response không đổi. Đã bỏ import `actorRequest` không còn dùng.

**8. Gán lại chương trình cho bài học trong 1 transaction** (`programs/programLessonService.js:254` `setLessonPrograms`)
Endpoint riêng (`PUT /training-programs/lessons/:lessonId/programs`), không có câu ghi chính đi kèm. Trước: DELETE `lesson_programs`, INSERT lại, rồi `pruneLessonLecturers` DELETE `program_lesson_lecturers` của chương trình vừa bị gỡ, ba câu tự commit riêng. INSERT lỗi thì bài học mất hết chương trình.
Sau: ba câu chạy trong một `withTransaction`; `pruneLessonLecturers(tx, lessonId)` nhận `tx` (chỉ được gọi từ đây) và thấy liên kết vừa ghi trong cùng transaction. `broadcast` và `getLessonProgramIds` (đọc lại để trả response) chạy sau commit.
Vẫn giữ nguyên: dùng `withTransaction` (không thêm người thao tác) vì trước đây cũng không có, và ba bảng này không có trigger audit; từng câu SQL, mã `LP…` (`newIdSql`), quy tắc không tự xoá bài học khi danh sách rỗng, phân quyền ở route, dạng response.

Test cho 7 và 8: `test/training/programLinksTransaction.test.js` (6 test, cùng cách đánh số transaction): UPDATE / INSERT chương trình và câu đối tượng cùng transaction, có câu đặt người thao tác; INSERT đối tượng lỗi ⇒ ROLLBACK cả UPDATE và DELETE, không broadcast; trùng mã ⇒ 409, rollback; `update` không có gì ⇒ không mở transaction; `setLessonPrograms` ghi ba câu trong một transaction, đọc lại sau COMMIT, INSERT lỗi ⇒ ROLLBACK, không dọn giảng viên. Chạy trên bản cũ của hai file thì 6/6 lỗi. `test/training/batchedWrites.test.js` (thứ tự câu của `setLessonPrograms`) vẫn qua.
Trên PostgreSQL dev (`/tmp/rvd2`, ROLLBACK): `trainingBatchedWrites` (đổi lời gọi sang `setProgramTraineeTypes(tx, …)`) và `batchedWrites` (gọi `setLessonPrograms` thật): 12 qua, 2 bỏ qua như trước, 0 lỗi.

### Rủi ro thấp — đổi response ở trường hợp biên (người dùng đã duyệt D2–D4)

**9. `PUT /trainees/:id` trả 404 khi mã không tồn tại** (D2, `trainees/traineeController.js`)
Trước: `traineeService.update` trả null thì vẫn 200 `data: null` và vẫn lưu trường tuỳ chỉnh cho mã không tồn tại. Sau: dùng `updateOne` của `customFormCrud` như 3 thực thể kia: 404 `notFound`, không lưu trường tuỳ chỉnh. Bỏ bản `updateOne` riêng và import `formCustomValueService`.
Vẫn giữ nguyên: route, `authorizePermission`, `formConfigGuard`, validate; response khi thành công (`data` kèm `custom` khi có, thông điệp `'Cập nhật thành công'`). Frontend (`updateTrainee`) chỉ gọi với mã đang mở nên chỉ gặp 404 khi học viên bị xoá giữa chừng, và đã có nhánh báo lỗi chung.

**10. Bản ghi trả về sau tạo / sửa học viên che CCCD theo quyền như GET chi tiết** (D3)
Trước: `create` / `update` trả `getById(id, true)`; tham số thứ hai là `actor`, `true` không có `permissions` nên CCCD luôn bị che (`••••8901`), kể cả với người có `trainees:read_sensitive`. Hệ quả: ở trang chi tiết học viên (`TraineeDetail` đặt state bằng response), lưu xong mà bấm sửa tiếp thì form chứa CCCD đã che và kiểm tra `/^d{9,12}$/` ở frontend báo lỗi, buộc nhập lại.
Sau:
- `traineeService.create(data, actorId, { fetch, actor })` và `update(id, data, actorId, { actor })` trả `getById(id, actor)`.
- `customFormCrud` với `scoped: true` truyền thêm `{ actor: req.user }` cho `create` / `update` (trainee và course; `courseService.create/update` không nhận tham số đó nên bỏ qua).
Vẫn giữ nguyên: quy tắc che nằm ở `maskSensitive` / `canReadSensitive` (`traineeListService`), không sửa; người thiếu quyền vẫn thấy `••••` + 4 số cuối. Nơi gọi khác (import Excel, đăng ký công khai, ghi danh, `fetch: false`) không truyền `actor` ⇒ che như trước. Chỉ `national_id` được che, SĐT chưa bao giờ bị che (F3 cũ ghi nhầm "CCCD/SĐT").

**11. `lecturerService.remove` không nuốt lỗi DB** (D4)
Bỏ `try { … } catch {}` quanh câu kiểm giảng viên đã được dùng. Ba bảng `lecturer_assignments`, `class_sessions`, `session_lecturers` đều có trong baseline / migration nên nhánh "bảng chưa tồn tại" là nhánh chết. Lỗi DB giờ trả 500 ngay thay vì bị coi là "chưa dùng" rồi thử DELETE cứng.
Vẫn giữ nguyên: câu kiểm (3 bảng), chưa dùng ⇒ DELETE cứng + xoá trường tuỳ chỉnh, đã dùng ⇒ `is_active = false`; cả hai trong `withActorTransaction`.
Phần "xoá trường tuỳ chỉnh khi xoá cứng giảng viên" của D4 (F5) **đã có sẵn** từ commit `a8541222` (2026-10-27): F5 là phát hiện nhầm, không cần sửa.

Test cho 9–11: `test/training/traineeLecturerDecisions.test.js` (5 test) và thêm 1 test vào `customFormCrud.test.js` (`{ actor }` chỉ truyền khi `scoped`). Chạy trên bản cũ của 4 file nguồn: 5/6 test lỗi; test còn lại (nhánh xoá cứng / vô hiệu hoá của giảng viên) giữ hành vi cũ nên qua ở cả hai bản.

## Phát hiện chưa sửa

| # | Vị trí | Mức | Mô tả | Đề xuất | Đã sửa? |
|---|---|---|---|---|---|
| F1 | `programs/trainingProgramService.js` `setProgramTraineeTypes` / `create` / `update` | trung bình | `setProgramTraineeTypes` chạy DELETE rồi INSERT trên pool, không chung transaction với nhau và với UPDATE chương trình. Nếu INSERT lỗi (vd. trùng khoá), chương trình mất hết đối tượng. Tương tự `courseService.setPrograms` và `programLessonService.setLessonPrograms`. | Bọc trong `withActorTransaction` cùng câu ghi chương trình/khóa học. Cần làm cẩn thận để trigger audit vẫn ghi người thao tác. | **Đã sửa** (thay đổi 6, 7, 8) |
| F2 | `lecturers/lecturerService.js:249-260` | thấp | `try { … } catch {}` nuốt **mọi** lỗi khi kiểm GV đã được dùng (chú thích nói bảng `lecturer_assignments` "chưa tồn tại", trong khi migration đã có từ lâu). Lỗi DB tạm thời sẽ bị coi là "chưa dùng", dẫn tới DELETE cứng; FK chặn nên không mất dữ liệu nhưng người dùng nhận lỗi 500 khó hiểu. | Bỏ try/catch (nhánh chết). | **Đã sửa** (thay đổi 11) |
| F3 | `trainees/traineeService.js:101`, `:169` | thấp | `getById(id, true)` sau create/update: tham số thứ hai là `actor`, truyền `true` thì `canReadSensitive(true)` = false ⇒ response luôn che CCCD kể cả với người có `trainees:read_sensitive`. An toàn về bảo mật nhưng gây hiểu lầm. | Truyền actor thật (cần sửa chữ ký `create/update`), hoặc đổi tên tham số cho rõ. Có đổi response nên chưa làm. | **Đã sửa** (thay đổi 10) |
| F4 | `trainees/traineeController.js:26` | thấp | `updateOne` của học viên không trả 404: `traineeService.update` trả null (mã không tồn tại) thì vẫn 200 `data: null` và **vẫn lưu** trường tuỳ chỉnh cho mã không tồn tại. | Dùng `updateOne` của `customFormCrud` (trả 404, không lưu). Đổi mã HTTP ở trường hợp biên. | **Đã sửa** (thay đổi 9) |
| F5 | `lecturerController` / `lecturerService.remove`, `traineeController.removeOne` | thấp | Xoá giảng viên (DELETE cứng khi chưa dùng) không xoá `form_custom_values` của giảng viên ⇒ dòng mồ côi. Học viên chỉ ẩn (`hidden_at`) nên giữ là hợp lý. | Bật `removeCustom` cho giảng viên chỉ ở nhánh DELETE cứng. | **Không cần**: phát hiện nhầm, `lecturerService.remove` đã xoá trường tuỳ chỉnh ở nhánh DELETE cứng |
| F6 | `courses/practiceBookExportService.js:14-21`, `courses/practiceDocumentService.js:40-46`, `registration/registrationDocumentService.js:32-54`, `tuition/tuitionReceiptPdf.js:74-81` | thấp | `pad2` / `toDate` / `dmy` chép 4 lần, khác nhau tinh vi (UTC hay giờ VN, chuỗi `YYYY-MM-DD` hay `Date`). | Gom vào `utils/vnDate.js` (vùng `backend-cleanup`) sau khi chốt một quy ước múi giờ. | Chưa |
| F7 | `registration/docCheck/docCheckService.js:26`, `registration/registrationDocumentService.js:29`, `tuition/tuitionController.js:11` | thấp | Tên bệnh viện viết cứng 3 lần. | Một hằng hoặc `system_settings`. `tuitionController` đang được phiên security sửa nên chưa đụng. | Chưa |
| F8 | `courses/lecturerAssignmentService.js:360` `syncLessonsFromSessions` | thấp | N+1: mỗi bài học 4 câu SELECT + `setLessonLecturers` (thêm vài câu). Nhập kế hoạch giảng dạy cả khóa có thể tới hàng chục bài. | Đọc 4 tập cho mọi bài trong 1 lượt (`subject_id IN jsonValues`) rồi chia theo bài trong JS. Logic phức tạp nên cần test riêng. | Chưa |
| F9 | `courses/gradebookService.js:415` `lock`, `:315` `saveBulk` | thấp | 1 `ensureGradeRow` + 1 UPDATE / học viên. | Có thể gom UPDATE `locked_at` cho các dòng đã có. Nhưng `ensureGradeRow` cần khoá sinh mã `genGradeId` nên không gom toàn bộ. | Chưa |
| F10 | `courses/practiceBookWriter.js:63` `addToCatalogs` | thấp | SELECT + INSERT / tên danh mục. | `INSERT … SELECT FROM jsonValues WHERE NOT EXISTS`. Tên bảng là hằng nên an toàn. | Chưa |
| F11 | `courses/classSessionService.js:400` `createSessionsBulk`, `courses/courseAttendanceService.js:190` `checkInSelf`, `trainees/traineeAccountService.js:110` `grantAccounts` | — | Vòng ghi từng dòng, **cố ý**: mã sinh tuần tự trong transaction, kiểm trùng từng buổi, kiểm thiết bị điểm danh hộ, mỗi học viên 1 transaction riêng để lỗi một người không chặn cả lô (có bcrypt). | Giữ nguyên. | Không cần |
| F12 | `courses/courses.routes.js` | thấp | 505 dòng, vượt `max-lines` (cảnh báo lint duy nhất). | Đã tách nhóm Điểm / Giấy chứng nhận / CME sang `courseGradeRoutes.js` (xem thay đổi 5). | **Đã sửa** |

Không thấy dấu hiệu lỗi bảo mật mới trong vùng này:
- `check:routes` báo mọi route đều khai báo phân quyền.
- Các chỗ ghép chuỗi SQL đều dùng hằng, danh sách cột cố định, hoặc giá trị đã kiểm (`PARTS.includes(part)`).
- `generateTempPassword` dùng `crypto.randomInt`.

## Lưu ý khi gộp nhánh

- Phiên `security` (nhánh `claude/review-security-479bca`) có sửa `courses/courseService.js` (`HAS_TUITION_SQL` trong `remove`), `courses/courseEnrollmentService.js`, `tuition/tuitionService.js`, `tuition/tuitionController.js`. Nhánh này sửa `courseService.js` ở khối `require` đầu file (thêm `jsonValues`, bỏ `actorRequest` và `withTransaction`) và các hàm `create`, `update`, `setPrograms` (thay đổi 3 và 6), không đụng `remove`. Có thể xung đột nhẹ ở khối `require`: khi gộp cần giữ cả hai, và nếu nhánh security có dùng `actorRequest` / `withTransaction` trong `courseService.js` thì giữ lại hai import đó (lint `no-unused-vars` sẽ báo nếu thừa hoặc thiếu). Tương tự `trainingProgramService.js` đã bỏ import `actorRequest` (thay đổi 7); nhánh security không sửa file này theo danh sách trên.
- `shared/crudService.js` / `crudController.js` không bị sửa. Đề xuất mục E của phiên `backend-cleanup` (thêm tuỳ chọn cho `createCrudService`) không ảnh hưởng module này vì `training` không dùng hai file đó.

## Đề xuất cần người dùng quyết

- **D1** (F1): Có bọc các cặp "xoá cũ rồi chèn mới" (`setProgramTraineeTypes`, `setPrograms`, `setLessonPrograms`) vào chung transaction với câu ghi chính không? Lợi: không mất liên kết khi lỗi giữa chừng. Đổi: ranh giới transaction và cách ghi người thao tác cho audit.
  - 2026-11-27: người dùng duyệt — **đã làm cả ba**: `setPrograms` (thay đổi 6), `setProgramTraineeTypes` (7), `setLessonPrograms` (8).
- **D2** (F4): Có cho `PUT /trainees/:id` trả 404 khi mã không tồn tại (thay vì 200 `data: null`) không? Nếu đồng ý thì `traineeController.updateOne` dùng luôn bản của `customFormCrud`.
- **D3** (F3): Có muốn response sau khi tạo/sửa học viên hiện đủ CCCD/SĐT với người có quyền `read_sensitive` (như khi xem chi tiết) không?
- **D4** (F2, F5): Bỏ `try/catch` nuốt lỗi ở `lecturerService.remove` và xoá trường tuỳ chỉnh khi xoá cứng giảng viên?
  - 2026-11-27: người dùng duyệt D2, D3, D4 — đã làm (thay đổi 9, 10, 11). Phần xoá trường tuỳ chỉnh của D4 đã có sẵn.

Không còn đề xuất nào chờ quyết. Ghi nhận thêm (chưa sửa, ngoài D1–D4): người **không** có `trainees:read_sensitive` mở form sửa học viên thì CCCD đã che (`••••8901`), và frontend bắt nhập lại CCCD đủ số mỗi lần lưu (họ vốn không được xem số đó). Có thể cho backend bỏ qua `national_id` dạng `••••…` khi cập nhật, hoặc frontend không gửi trường đó khi chưa sửa. Cần thống nhất với phiên `security` / `frontend-cleanup`.
