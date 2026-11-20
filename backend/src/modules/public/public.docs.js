// Tài liệu OpenAPI cho public.routes.js (swagger-jsdoc đọc qua config/swagger.js).
// Chỉ có comment — sửa route thì sửa tài liệu ở đây cho khớp.

/**
 * @swagger
 * tags:
 *   name: Public
 *   description: Cổng công khai (đăng ký khóa học, tra cứu kết quả) — không cần đăng nhập
 */

/**
 * @swagger
 * /public/course-registration/rules:
 *   get:
 *     summary: Nội quy lớp học và danh mục nơi cấp CCCD cho form đăng ký khóa đào tạo liên tục
 *     tags: [Public]
 *     security: []
 *     responses:
 *       200:
 *         description: "{ version (phiên bản nội quy ghi vào bản khai), rules[], id_issue_places[], email_otp_required (Cấu hình hệ thống TRAINING_REGISTRATION_EMAIL_OTP, mặc định true), attachments: { extensions: ['.pdf','.jpg','.jpeg','.png'], max_size_mb (= UPLOAD_MAX_MB), kinds: { internal: [{ key, label, hint, required }], external: [...] } } — hồ sơ bắt buộc theo đối tượng }"
 *       403:
 *         description: Module Đào tạo đang tắt (MODULE_DISABLED)
 *       429:
 *         description: Quá 120 lượt trong 15 phút theo IP
 */

/**
 * @swagger
 * /public/course-registration/staff-check:
 *   post:
 *     summary: Tra nhân viên nội viện theo mã NV và họ tên trước khi đăng ký (không cần đăng nhập)
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Họ tên phải khớp (bỏ dấu, không phân biệt hoa thường) cùng mã nhân viên mới ra hồ sơ.
 *       Chỉ trả thông tin hiển thị để người đăng ký xác nhận — không trả SĐT, ngày sinh hay
 *       email đầy đủ (email chỉ còn dạng che).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [staff_number, full_name]
 *             properties:
 *               staff_number:
 *                 type: string
 *                 pattern: '^\d{1,9}$'
 *                 example: "1234"
 *               full_name:
 *                 type: string
 *                 maxLength: 150
 *                 example: "Nguyễn Văn A"
 *     responses:
 *       200:
 *         description: "{ full_name, department_id, department_name, qualification, email_masked }"
 *       400:
 *         description: Mã nhân viên không đúng định dạng (1–9 chữ số) hoặc thiếu họ tên
 *       404:
 *         description: Không tìm thấy nhân viên khớp họ tên và mã nhân viên đã nhập
 *       429:
 *         description: Quá 20 lượt trong 15 phút theo IP, hoặc mã nhân viên đã tra quá 10 lần trong 1 giờ
 */

/**
 * @swagger
 * /public/course-registration/email-otp:
 *   post:
 *     summary: Xin mã xác minh 6 số gửi tới email trước khi đăng ký khóa đào tạo liên tục
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Nội viện: mã gửi tới email thật trong hồ sơ nhân sự nếu có, không thì tới email đã nhập.
 *       Không khớp nhân viên vẫn trả phản hồi y hệt (để không lộ thông tin nhân viên). Mã có
 *       hiệu lực 10 phút, nhập sai tối đa 5 lần; hai lần xin mã cách nhau tối thiểu 60 giây.
 *       Cần captcha: lấy captcha_token và captcha_answer từ GET /public/captcha.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source, email, captcha_token]
 *             properties:
 *               source: { type: string, enum: [internal, external], description: Nội viện / ngoại viện }
 *               email: { type: string, format: email, maxLength: 100 }
 *               staff_number: { type: string, description: 'Bắt buộc khi source = internal (1–9 chữ số)' }
 *               full_name: { type: string, maxLength: 150, description: 'Bắt buộc khi source = internal' }
 *               captcha_token: { type: string }
 *               captcha_answer: { type: string, description: Lời giải proof-of-work của captcha }
 *     responses:
 *       200:
 *         description: "{ challenge_id (32 ký tự hex), to_masked (email đã che), ttl_min: 10 }"
 *       400:
 *         description: Captcha sai hoặc đã hết hạn, hoặc dữ liệu không hợp lệ
 *       429:
 *         description: Vừa gửi mã tới email này (chờ 60 giây), email xin quá 5 lần trong 1 giờ, mã nhân viên xin quá 5 lần trong 1 giờ, hoặc quá 10 lượt trong 15 phút theo IP
 */

/**
 * @swagger
 * /public/course-registration/email-otp/verify:
 *   post:
 *     summary: Nhập mã xác minh email — đúng mã thì nhận email_token để gửi kèm khi đăng ký
 *     tags: [Public]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [challenge_id, code]
 *             properties:
 *               challenge_id: { type: string, pattern: '^[a-f0-9]{32}$', description: Lấy từ email-otp }
 *               code: { type: string, pattern: '^\d{6}$', example: "123456" }
 *     responses:
 *       200:
 *         description: "{ email_token } — JWT hiệu lực 30 phút, gửi trong field email_token khi POST /public/course-registration"
 *       400:
 *         description: Mã không đúng, đã hết hạn, hoặc đã nhập sai quá 5 lần (cùng một thông điệp, phải xin mã mới)
 *       429:
 *         description: Quá 20 lần nhập trong 15 phút theo IP
 */

/**
 * @swagger
 * /public/course-registration:
 *   post:
 *     summary: Đăng ký khóa đào tạo liên tục (nội viện / ngoại viện) — thay Google Form
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Body BẮT BUỘC là multipart/form-data: toàn bộ dữ liệu form là chuỗi JSON trong field
 *       `data`; mỗi loại hồ sơ bắt buộc là 1 phần file riêng tên `files[<kind>]` (PDF, JPG hoặc PNG,
 *       mỗi file tối đa UPLOAD_MAX_MB). Nội viện: files[application_signed] (Đơn đăng ký đã ký) và
 *       files[proposal_approved] (Tờ trình đã duyệt). Ngoại viện: files[national_id], files[degree],
 *       files[license], files[decision]. Thiếu loại bắt buộc, gửi loại của đối tượng kia hoặc request
 *       không phải multipart ⇒ 400 trước khi kiểm captcha / giới hạn / ghi dữ liệu (honeypot vẫn đứng
 *       đầu). Danh sách loại lấy từ GET /public/course-registration/rules (attachments.kinds).
 *       Khi Cấu hình hệ thống TRAINING_REGISTRATION_EMAIL_OTP bật (mặc định) thì bắt buộc
 *       email_token (xem email-otp/verify). Mọi nhánh — kể cả bot bị chặn bằng honeypot —
 *       đều trả cùng hình dạng phản hồi và cùng thông điệp.
 *       Nội viện: khớp lại mã NV và họ tên với hồ sơ nhân sự; khoa và trình độ lấy từ hồ sơ
 *       nhân sự, không tin dữ liệu form. Ngoại viện: chỉ gắn vào hồ sơ học viên cũ khi CCCD,
 *       ngày sinh và họ tên đều khớp; không khớp thì tạo hồ sơ mới không CCCD để phòng Đào tạo đối chiếu.
 *       download_token trong phản hồi là yếu tố thứ hai để tra cứu / tải đơn, hết hạn sau 30 phút.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [data, captcha_token]
 *             properties:
 *               data:
 *                 type: string
 *                 description: "Chuỗi JSON gồm các trường bên dưới (bắt buộc khi gửi multipart)"
 *               "files[application_signed]": { type: string, format: binary, description: 'Nội viện — Đơn đăng ký đã ký' }
 *               "files[proposal_approved]": { type: string, format: binary, description: 'Nội viện — Tờ trình đã duyệt' }
 *               "files[national_id]": { type: string, format: binary, description: 'Ngoại viện — Căn cước công dân' }
 *               "files[degree]": { type: string, format: binary, description: 'Ngoại viện — Bằng tốt nghiệp' }
 *               "files[license]": { type: string, format: binary, description: 'Ngoại viện — Chứng chỉ hành nghề' }
 *               "files[decision]": { type: string, format: binary, description: 'Ngoại viện — Quyết định cử đi học' }
 *         application/json:
 *           schema:
 *             type: object
 *             description: Cùng các trường của field data (chỉ để mô tả; request thật phải là multipart kèm file hồ sơ)
 *             required: [source, full_name, course_id, captcha_token, rules_accepted, declared_true]
 *             properties:
 *               source: { type: string, enum: [internal, external] }
 *               full_name: { type: string, maxLength: 150 }
 *               course_id: { type: string, maxLength: 20 }
 *               program_id: { type: string, maxLength: 20, description: Chương trình của khóa (nếu khóa có chia chương trình) }
 *               captcha_token: { type: string }
 *               captcha_answer: { type: string, description: Lời giải proof-of-work của captcha }
 *               rules_accepted: { type: boolean, description: Phải là true — cam kết nội quy lớp học }
 *               declared_true: { type: boolean, description: Phải là true — cam kết thông tin khai đúng sự thật }
 *               email_token: { type: string, description: 'Bắt buộc khi bật xác minh email (từ email-otp/verify)' }
 *               email: { type: string, format: email, maxLength: 100 }
 *               invoice_email: { type: string, format: email, maxLength: 100 }
 *               staff_number: { type: string, description: 'Bắt buộc khi source = internal (1–9 chữ số)' }
 *               national_id: { type: string, description: 'CCCD / CMND — cấu trúc phải khớp giới tính và năm sinh; có CCCD thì bắt buộc dob' }
 *               national_id_issued_date: { type: string, format: date }
 *               national_id_issued_place: { type: string, maxLength: 200 }
 *               dob: { type: string, format: date }
 *               gender: { type: string, enum: [male, female, other] }
 *               graduated_year: { type: integer, minimum: 1900, maximum: 2100 }
 *               ethnicity: { type: string, maxLength: 50 }
 *               hometown: { type: string, maxLength: 255 }
 *               permanent_address: { type: string, maxLength: 255 }
 *               address: { type: string, maxLength: 255 }
 *               phone: { type: string, maxLength: 20 }
 *               qualification: { type: string, maxLength: 150, description: Chỉ ngoại viện }
 *               graduated_school: { type: string, maxLength: 200 }
 *               graduated_major: { type: string, maxLength: 200 }
 *               degree_number: { type: string, maxLength: 50 }
 *               degree_registry_number: { type: string, maxLength: 50 }
 *               workplace: { type: string, maxLength: 200 }
 *               work_specialty: { type: string, maxLength: 200 }
 *               work_seniority: { type: string, maxLength: 100 }
 *               trainee_type_id: { type: string, maxLength: 20 }
 *               department_id: { type: string, maxLength: 20 }
 *               invoice_org_name: { type: string, maxLength: 255 }
 *               invoice_org_address: { type: string, maxLength: 255 }
 *               invoice_tax_code: { type: string, maxLength: 20 }
 *               invoice_budget_code: { type: string, maxLength: 20 }
 *               custom: { type: object, description: 'Trường bổ sung theo Cấu hình form course_registration (trong multipart là chuỗi JSON)' }
 *     responses:
 *       201:
 *         description: "Đã nhận đăng ký, chờ duyệt — { submitted: true, registration_code, download_token }"
 *       400:
 *         description: "Dữ liệu không hợp lệ (trả errors theo từng trường), thiếu hồ sơ bắt buộc ('Vui lòng đính kèm đủ hồ sơ bắt buộc: …'), hồ sơ không thuộc đối tượng đã chọn, file không phải PDF / JPG / PNG, mỗi loại quá 1 file, captcha sai, thiếu email_token hoặc email chưa xác minh, hoặc field data không đọc được"
 *       403:
 *         description: Khóa hiện không trong thời gian đăng ký, hoặc module Đào tạo đang tắt
 *       404:
 *         description: Khóa không tồn tại, đã hủy hoặc không mở đăng ký công khai; nội viện — không tìm thấy nhân viên khớp mã NV và họ tên
 *       409:
 *         description: Nội viện — nhân viên đã có đăng ký ở khóa này hoặc đang theo học chương trình khác
 *       429:
 *         description: Quá 10 lượt trong 15 phút theo IP, hoặc cùng CCCD / cùng mã NV đã đăng ký quá 5 lần trong ngày
 */

/**
 * @swagger
 * /public/course-registration/{code}/status:
 *   post:
 *     summary: Tra cứu trạng thái đăng ký theo mã đăng ký
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Bắt buộc yếu tố thứ hai trong body, đúng một trong ba: national_id, email (đã khai khi đăng ký)
 *       hoặc download_token (nhận lúc đăng ký). Sai mã hay sai yếu tố thứ hai đều trả 404 như nhau.
 *       Thiếu cả ba yếu tố thì trả 400.
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string, minLength: 1, maxLength: 32 }, description: Mã đăng ký }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               national_id: { type: string, maxLength: 20 }
 *               email: { type: string, format: email, maxLength: 100 }
 *               download_token: { type: string, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: "{ registration_code, full_name, source, course_name, program_name, enrollment_status, registered_at, can_upload (đơn còn pending / waitlisted), files[] (mỗi loại hồ sơ của đối tượng: kind, label, required, legacy, uploaded_at, file_name, file_url luôn null, mime_type, review_status), files_missing[] (khóa loại bắt buộc còn thiếu; file ngoại viện bị từ chối tính là thiếu) }"
 *       400:
 *         description: Không có yếu tố thứ hai nào trong body
 *       404:
 *         description: Không tìm thấy đăng ký khớp mã và yếu tố thứ hai
 *       429:
 *         description: Mã đăng ký đã được tra quá 20 lần trong 1 giờ, hoặc quá 20 lượt trong 15 phút theo IP
 */

/**
 * @swagger
 * /public/course-registration/{code}/application:
 *   post:
 *     summary: Tải Đơn đăng ký (.docx) của lượt đăng ký — cùng yếu tố thứ hai như tra cứu trạng thái
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Trả file Word thay vì JSON (Content-Disposition attachment, Cache-Control no-store).
 *       Đơn in đúng dữ liệu người đó đã khai khi đăng ký (bản khai), không lấy từ hồ sơ hiện tại.
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string, minLength: 1, maxLength: 32 }, description: Mã đăng ký }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               national_id: { type: string, maxLength: 20 }
 *               email: { type: string, format: email, maxLength: 100 }
 *               download_token: { type: string, maxLength: 2000 }
 *     responses:
 *       200:
 *         description: File Đơn đăng ký (.docx)
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: Không có yếu tố thứ hai nào trong body
 *       404:
 *         description: Không tìm thấy đăng ký khớp mã và yếu tố thứ hai
 *       429:
 *         description: Mã đăng ký đã được tra quá 20 lần trong 1 giờ, hoặc quá 20 lượt trong 15 phút theo IP
 */

/**
 * @swagger
 * /public/course-registration/{code}/files/{kind}:
 *   post:
 *     summary: Nộp (thay) 1 file hồ sơ của lượt đăng ký
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Multipart: field `data` là chuỗi JSON chứa yếu tố thứ hai (national_id, email hoặc download_token),
 *       field `file` là đúng một file PDF, JPG hoặc PNG. Yếu tố thứ hai đọc từ field `data`, không đọc từ
 *       body ngoài multipart. Chỉ nhận khi đơn còn chờ duyệt hoặc trong danh sách chờ; đơn đã được xử lý thì
 *       không cho thay qua cổng công khai (409). Nội viện: file cũ cùng loại bị xóa; ngoại viện: file vào
 *       hồ sơ học viên (chờ duyệt), dòng hồ sơ cũ còn chờ duyệt bị thay, đã duyệt / từ chối được giữ lại.
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string, minLength: 1, maxLength: 32 }, description: Mã đăng ký }
 *       - in: path
 *         name: kind
 *         required: true
 *         schema: { type: string, enum: [application_signed, proposal_approved, national_id, degree, license, decision] }
 *         description: Loại hồ sơ (phải thuộc đối tượng của đơn)
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [data, file]
 *             properties:
 *               data:
 *                 type: string
 *                 description: 'Chuỗi JSON, ví dụ {"email":"..."} hoặc {"download_token":"..."}'
 *               file: { type: string, format: binary, description: Đúng một file PDF / JPG / PNG }
 *     responses:
 *       200:
 *         description: "Đã nộp hồ sơ — { kind, uploaded_at, files_missing[] }"
 *       400:
 *         description: Loại hồ sơ không hợp lệ (cho đơn này), không có file, file không phải PDF / JPG / PNG, thiếu yếu tố thứ hai, hoặc field data không đọc được
 *       404:
 *         description: Không tìm thấy đăng ký khớp mã và yếu tố thứ hai
 *       409:
 *         description: Đơn đăng ký đã được xử lý — muốn thay file phải liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến
 *       429:
 *         description: Mã đăng ký đã được tra quá 20 lần trong 1 giờ, hoặc quá 20 lượt trong 15 phút theo IP
 */

/**
 * @swagger
 * /public/course-registration/draft/application:
 *   post:
 *     summary: Tải Đơn đăng ký nháp (.docx) điền sẵn — chỉ nội viện, chưa có mã đăng ký
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Body JSON là dữ liệu người đó vừa gõ ở form (khóa thừa bị bỏ qua), source phải là internal.
 *       Không cần captcha nhưng phải khớp lại mã nhân viên + họ tên (sai ⇒ 404 chung) và bị giới hạn theo
 *       IP (30 lượt / 15 phút) và theo mã NV (20 lượt / giờ, dùng chung với Tờ trình nháp). Đơn không có dòng
 *       "Mã đăng ký", ngày lập đơn để trống. Khóa học phải đang mở đăng ký công khai.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [source, course_id, staff_number, full_name]
 *             properties:
 *               source: { type: string, enum: [internal] }
 *               course_id: { type: string, maxLength: 20 }
 *               program_id: { type: string, maxLength: 20, description: Bắt buộc khi khóa có chương trình }
 *               staff_number: { type: string, description: 1–9 chữ số }
 *               full_name: { type: string, maxLength: 150 }
 *               dob: { type: string, format: date }
 *               national_id: { type: string }
 *               email: { type: string, format: email }
 *               phone: { type: string, maxLength: 20 }
 *     responses:
 *       200:
 *         description: File Đơn đăng ký nháp (.docx), tên Don-dang-ky-<họ-tên>-ban-nhap.docx
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: Dữ liệu không hợp lệ, source không phải internal, thiếu hoặc sai chương trình của khóa
 *       403:
 *         description: Khóa hiện không trong thời gian đăng ký
 *       404:
 *         description: Không tìm thấy nhân viên khớp mã NV + họ tên; hoặc khóa không tồn tại / đã đóng đăng ký
 *       429:
 *         description: Quá 30 lượt trong 15 phút theo IP, hoặc mã NV đã tạo giấy tờ quá 20 lần trong 1 giờ
 */

/**
 * @swagger
 * /public/course-registration/draft/proposal:
 *   post:
 *     summary: Tải Tờ trình nháp + Bảng phân tích nhu cầu (.docx) — chỉ nội viện
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Tờ trình ghi đúng 1 người (người đăng ký) của khoa lấy từ hồ sơ nhân sự; mọi ô của Bảng phân tích
 *       nhu cầu để trống. Kinh phí lấy học phí chương trình, ngày lớp lấy ngày bắt đầu / kết thúc của khóa.
 *       Cùng giới hạn và cách khớp nhân viên như Đơn đăng ký nháp.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [course_id, staff_number, full_name]
 *             properties:
 *               course_id: { type: string, maxLength: 20 }
 *               program_id: { type: string, maxLength: 20 }
 *               staff_number: { type: string }
 *               full_name: { type: string, maxLength: 150 }
 *               dob: { type: string, format: date, description: Để in năm sinh trong bảng danh sách }
 *     responses:
 *       200:
 *         description: File Tờ trình nháp (.docx), tên To-trinh-<khoa>-<lớp>-ban-nhap.docx
 *         content:
 *           application/vnd.openxmlformats-officedocument.wordprocessingml.document:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: Dữ liệu không hợp lệ, thiếu hoặc sai chương trình của khóa
 *       403:
 *         description: Khóa hiện không trong thời gian đăng ký
 *       404:
 *         description: Không tìm thấy nhân viên khớp mã NV + họ tên; hoặc khóa không tồn tại / đã đóng đăng ký
 *       429:
 *         description: Quá 30 lượt trong 15 phút theo IP, hoặc mã NV đã tạo giấy tờ quá 20 lần trong 1 giờ
 */
