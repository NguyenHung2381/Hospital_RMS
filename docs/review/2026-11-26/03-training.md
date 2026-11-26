# 03 — Rà soát module `training`

- Phiên: `training-cleanup` · Nhánh: `claude/review-training-d74783` (gốc `60d56a71`)
- Phạm vi: `backend/src/modules/training/` (≈24.500 dòng) và test của nó
- Ngày: 2026-11-26

## Kết quả

| Chỉ số | Trước | Sau |
|---|---|---|
| Dòng trong `src/modules/training` | 24.491 | 24.370 (**−121**: thêm 215, xoá 336; tính cả 2 file mới `customFormCrud.js`, `importText.js`) |
| `npm test` | 1080 qua / 0 lỗi* | 1094 qua / 0 lỗi (thêm 14 test đơn vị) |
| `npm run lint` | 0 lỗi, 1 cảnh báo | 0 lỗi, 1 cảnh báo (`courses.routes.js` 505 dòng > 500, có từ trước) |
| Smoke trên DB dev (`test-integration/**`, so baseline dựng từ `60d56a71`) | — | 218 test, 216 qua, 2 bỏ qua (thiếu dữ liệu mẫu), 0 lỗi; 192 route GET giữ nguyên mã HTTP và tập trường JSON |

\* Lần chạy mốc đầu tiên báo 4 file lỗi (`test/cme/cmeCycleCompliance`, `test/security/courseLecturerCme`, `gradeLockOutcome`, `moduleKillSwitchMounts`). Chạy riêng từng file đều qua; các lần chạy đầy đủ sau đó cũng qua. Đây là lỗi chập chờn do máy tải nặng (7 phiên cùng chạy), không phải lỗi code.

Cách chạy smoke: chép `src/` + `test-integration/` của từng commit vào `/tmp/rvb` (gốc) và `/tmp/rvh` (HEAD) trong container `hospital_rms_dev-backend-1`, nối `node_modules` và `.env` của `/app`. Bản gốc ghi baseline, bản HEAD so với baseline đó. Container vẫn phục vụ checkout chính và không bị đụng tới. Các thư mục `/tmp/rv-training`, `/tmp/rvb`, `/tmp/rvh` và file `/tmp/rvb.tar`, `/tmp/rvh.tar` còn lại trong container (lệnh xoá bị công cụ chặn). Có thể xoá tay hoặc để mất khi tạo lại container.

## Thay đổi đã làm (xếp theo mức rủi ro)

### Rủi ro thấp nhất — chỉ đổi cấu trúc, hành vi giữ nguyên

**1. Bỏ 34 export không nơi nào dùng** (commit `31948235`)
Quét `src/`, `test/`, `scripts/`, `test-integration*`: các tên dưới đây không xuất hiện ở file nào khác. Mọi hàm/hằng **vẫn được dùng trong chính file đó**: chỉ bỏ khỏi `module.exports`, không xoá code.
Danh sách: `classSessionService.ASSISTANTS_SQL`, `courseCmeService.SOURCE`, `enrollmentExportService.DEFAULT_STATUSES`, `courseEnrollmentWorkbook.{STATUS_LABEL, slugify, givenName}`, `teachingPlanTemplate.KIND_LABEL`, `practiceAutoService.codeSuffix`, `practiceBookImportService.findRotationGroups`, `programClassService.isInternalTrainee`, `rotationPlanner.roundKey`, `sessionLecturerResolver.nameKeyOf`, `questionBankService.getQuestion`, `programLessonService.listLessonLecturers`, `docCheckAnalyzer.{analyzeSignatures, magicOf}`, `docCheckRules.{alnum, levenshtein, hasMrz, scoreKinds, nameFound}`, `docCheckService.{isCheckable, presentTraineeDocument}`, `pdfBytes.{derLength, parsePdfDate}`, `trustStore.splitCerts`, `visualMarks.{THRESHOLDS, TITLE_PHRASES}`, `registrationFileKinds.{REGISTRATION_FILE_KINDS, RETIRED_KINDS}`, `registrationProposalService.{proposedPeople, buildProposalData}`, `registrationUpload.FORM_MAX_FILES`, `tuitionSettings.BANKS`.
Đối chiếu với `06-dead-code.md` mục 1.2: cả 30 mục của phiên quét đều nằm trong danh sách này. Tôi bỏ thêm 4 mục (`STATUS_LABEL`, `KIND_LABEL`, `presentTraineeDocument`, `BANKS`) cũng chỉ dùng nội bộ. Không có file chết, không có hàm chết hẳn.
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
| `courses/courseService.js:344` `setPrograms` | 1 DELETE / liên kết bị bỏ + 1 SELECT / chương trình mới | 1 DELETE + 1 SELECT cho cả danh sách | DELETE thêm điều kiện `course_id`; INSERT vẫn từng dòng vì mã `CP…` sinh tuần tự bằng `genCourseProgramId(tx)` |

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
| lecturer | không | không |
| trainee | có | không (`updateOne` giữ bản riêng, xem đề xuất D2) |

Không dùng `shared/crudController.js` vì nó không có bước trường tuỳ chỉnh và thuộc phiên `backend-cleanup`.
Vẫn giữ nguyên: `authorizePermission` + `formConfigGuard` ở route, validate ở service, hình dạng response và thông điệp (`'Cập nhật thành công'`, `'Xóa thành công'`, 201 khi tạo, 404 khi không thấy). Smoke GET không đổi. Test: `test/training/customFormCrud.test.js`.

## Phát hiện chưa sửa

| # | Vị trí | Mức | Mô tả | Đề xuất | Đã sửa? |
|---|---|---|---|---|---|
| F1 | `programs/trainingProgramService.js:136`, `:241`, `:265` | trung bình | `setProgramTraineeTypes` chạy DELETE rồi INSERT trên pool, không chung transaction với nhau và với UPDATE chương trình. Nếu INSERT lỗi (vd. trùng khoá), chương trình mất hết đối tượng. Tương tự `courseService.setPrograms` (`:344`) và `programLessonService.setLessonPrograms` (`:253`). | Bọc trong `withActorTransaction` cùng câu ghi chương trình/khóa học. Cần làm cẩn thận để trigger audit vẫn ghi người thao tác. | Chưa (đổi ranh giới transaction, cần người dùng đồng ý) |
| F2 | `lecturers/lecturerService.js:249-260` | thấp | `try { … } catch {}` nuốt **mọi** lỗi khi kiểm GV đã được dùng (chú thích nói bảng `lecturer_assignments` "chưa tồn tại", trong khi migration đã có từ lâu). Lỗi DB tạm thời sẽ bị coi là "chưa dùng", dẫn tới DELETE cứng; FK chặn nên không mất dữ liệu nhưng người dùng nhận lỗi 500 khó hiểu. | Bỏ try/catch (nhánh chết). | Chưa |
| F3 | `trainees/traineeService.js:101`, `:169` | thấp | `getById(id, true)` sau create/update: tham số thứ hai là `actor`, truyền `true` thì `canReadSensitive(true)` = false ⇒ response luôn che CCCD/SĐT kể cả với người có `trainees:read_sensitive`. An toàn về bảo mật nhưng gây hiểu lầm. | Truyền actor thật (cần sửa chữ ký `create/update`), hoặc đổi tên tham số cho rõ. Có đổi response nên chưa làm. | Chưa |
| F4 | `trainees/traineeController.js:26` | thấp | `updateOne` của học viên không trả 404: `traineeService.update` trả null (mã không tồn tại) thì vẫn 200 `data: null` và **vẫn lưu** trường tuỳ chỉnh cho mã không tồn tại. | Dùng `updateOne` của `customFormCrud` (trả 404, không lưu). Đổi mã HTTP ở trường hợp biên. | Chưa (D2) |
| F5 | `lecturerController` / `lecturerService.remove`, `traineeController.removeOne` | thấp | Xoá giảng viên (DELETE cứng khi chưa dùng) không xoá `form_custom_values` của giảng viên ⇒ dòng mồ côi. Học viên chỉ ẩn (`hidden_at`) nên giữ là hợp lý. | Bật `removeCustom` cho giảng viên chỉ ở nhánh DELETE cứng. | Chưa |
| F6 | `courses/practiceBookExportService.js:14-21`, `courses/practiceDocumentService.js:40-46`, `registration/registrationDocumentService.js:32-54`, `tuition/tuitionReceiptPdf.js:74-81` | thấp | `pad2` / `toDate` / `dmy` chép 4 lần, khác nhau tinh vi (UTC hay giờ VN, chuỗi `YYYY-MM-DD` hay `Date`). | Gom vào `utils/vnDate.js` (vùng `backend-cleanup`) sau khi chốt một quy ước múi giờ. | Chưa |
| F7 | `registration/docCheck/docCheckService.js:26`, `registration/registrationDocumentService.js:29`, `tuition/tuitionController.js:11` | thấp | Tên bệnh viện viết cứng 3 lần. | Một hằng hoặc `system_settings`. `tuitionController` đang được phiên security sửa nên chưa đụng. | Chưa |
| F8 | `courses/lecturerAssignmentService.js:360` `syncLessonsFromSessions` | thấp | N+1: mỗi bài học 4 câu SELECT + `setLessonLecturers` (thêm vài câu). Nhập kế hoạch giảng dạy cả khóa có thể tới hàng chục bài. | Đọc 4 tập cho mọi bài trong 1 lượt (`subject_id IN jsonValues`) rồi chia theo bài trong JS. Logic phức tạp nên cần test riêng. | Chưa |
| F9 | `courses/gradebookService.js:415` `lock`, `:315` `saveBulk` | thấp | 1 `ensureGradeRow` + 1 UPDATE / học viên. | Có thể gom UPDATE `locked_at` cho các dòng đã có. Nhưng `ensureGradeRow` cần khoá sinh mã `genGradeId` nên không gom toàn bộ. | Chưa |
| F10 | `courses/practiceBookWriter.js:63` `addToCatalogs` | thấp | SELECT + INSERT / tên danh mục. | `INSERT … SELECT FROM jsonValues WHERE NOT EXISTS`. Tên bảng là hằng nên an toàn. | Chưa |
| F11 | `courses/classSessionService.js:400` `createSessionsBulk`, `courses/courseAttendanceService.js:190` `checkInSelf`, `trainees/traineeAccountService.js:110` `grantAccounts` | — | Vòng ghi từng dòng, **cố ý**: mã sinh tuần tự trong transaction, kiểm trùng từng buổi, kiểm thiết bị điểm danh hộ, mỗi học viên 1 transaction riêng để lỗi một người không chặn cả lô (có bcrypt). | Giữ nguyên. | Không cần |
| F12 | `courses/courses.routes.js` | thấp | 505 dòng, vượt `max-lines` (cảnh báo lint duy nhất). | Tách nhóm route (vd. lịch học / điểm) sang file `*Routes.js` như `coursePracticeRoutes.js`. Cần đối chiếu `routes.snapshot.txt`. | Chưa |

Không thấy dấu hiệu lỗi bảo mật mới trong vùng này:
- `check:routes` báo mọi route đều khai báo phân quyền.
- Các chỗ ghép chuỗi SQL đều dùng hằng, danh sách cột cố định, hoặc giá trị đã kiểm (`PARTS.includes(part)`).
- `generateTempPassword` dùng `crypto.randomInt`.

## Lưu ý khi gộp nhánh

- Phiên `security` (nhánh `claude/review-security-479bca`) có sửa `courses/courseService.js` (`HAS_TUITION_SQL` trong `remove`), `courses/courseEnrollmentService.js`, `tuition/tuitionService.js`, `tuition/tuitionController.js`. Nhánh này chỉ sửa `courseService.js` ở khối `require` đầu file (thêm `jsonValues`) và hàm `setPrograms`, nên có thể xung đột nhẹ ở khối `require`. Khi gộp cần giữ cả hai.
- `shared/crudService.js` / `crudController.js` không bị sửa. Đề xuất mục E của phiên `backend-cleanup` (thêm tuỳ chọn cho `createCrudService`) không ảnh hưởng module này vì `training` không dùng hai file đó.

## Đề xuất cần người dùng quyết

- **D1** (F1): Có bọc các cặp "xoá cũ rồi chèn mới" (`setProgramTraineeTypes`, `setPrograms`, `setLessonPrograms`) vào chung transaction với câu ghi chính không? Lợi: không mất liên kết khi lỗi giữa chừng. Đổi: ranh giới transaction và cách ghi người thao tác cho audit.
- **D2** (F4): Có cho `PUT /trainees/:id` trả 404 khi mã không tồn tại (thay vì 200 `data: null`) không? Nếu đồng ý thì `traineeController.updateOne` dùng luôn bản của `customFormCrud`.
- **D3** (F3): Có muốn response sau khi tạo/sửa học viên hiện đủ CCCD/SĐT với người có quyền `read_sensitive` (như khi xem chi tiết) không?
- **D4** (F2, F5): Bỏ `try/catch` nuốt lỗi ở `lecturerService.remove` và xoá trường tuỳ chỉnh khi xoá cứng giảng viên?
