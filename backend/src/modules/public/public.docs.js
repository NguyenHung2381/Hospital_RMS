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
 *         description: "{ version (phiên bản nội quy ghi vào bản khai), rules[], id_issue_places[], email_otp_required (Cấu hình hệ thống TRAINING_REGISTRATION_EMAIL_OTP, mặc định true) }"
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
 *       Body gửi dạng multipart/form-data: toàn bộ dữ liệu form là chuỗi JSON trong field
 *       `data`; hồ sơ học viên (ngoại viện) hoặc hồ sơ nộp bổ sung (nội viện) là đúng 1 file PDF
 *       trong field `files`. Không đính kèm file thì gửi application/json với cùng các trường.
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
 *               files:
 *                 type: array
 *                 maxItems: 1
 *                 items: { type: string, format: binary }
 *                 description: Tối đa 1 file PDF (dung lượng theo Cấu hình hệ thống UPLOAD_MAX_MB)
 *         application/json:
 *           schema:
 *             type: object
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
 *         description: Dữ liệu không hợp lệ (trả errors theo từng trường), captcha sai, thiếu email_token hoặc email chưa xác minh, hoặc field data không đọc được
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
 *         description: "{ registration_code, full_name, source, course_name, program_name, enrollment_status, registered_at, needs_dossier (nội viện chưa nộp hồ sơ bổ sung), dossier_uploaded_at, checks: { id_checked, degree_checked, proposal_checked } }"
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
 * /public/course-registration/{code}/dossier:
 *   post:
 *     summary: Nộp (thay) hồ sơ PDF bổ sung — đơn và tờ trình đã duyệt gộp một file
 *     tags: [Public]
 *     security: []
 *     description: >
 *       Multipart: field `data` là chuỗi JSON chứa yếu tố thứ hai (national_id, email hoặc download_token),
 *       field `files` là đúng một file PDF. Yếu tố thứ hai đọc từ field `data`, không đọc từ body ngoài multipart.
 *       Nếu phòng Đào tạo đã đối chiếu tờ trình thì không cho thay qua cổng công khai (409).
 *     parameters:
 *       - { in: path, name: code, required: true, schema: { type: string, minLength: 1, maxLength: 32 }, description: Mã đăng ký }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [data, files]
 *             properties:
 *               data:
 *                 type: string
 *                 description: 'Chuỗi JSON, ví dụ {"email":"..."} hoặc {"download_token":"..."}'
 *               files:
 *                 type: array
 *                 maxItems: 1
 *                 items: { type: string, format: binary }
 *                 description: Đúng một file PDF
 *     responses:
 *       200:
 *         description: "Đã nộp hồ sơ bổ sung — { uploaded: true, dossier_uploaded_at }"
 *       400:
 *         description: Không đúng một file, file không phải PDF, hoặc field data không đọc được
 *       404:
 *         description: Không tìm thấy đăng ký khớp mã và yếu tố thứ hai
 *       409:
 *         description: Phòng Đào tạo đã đối chiếu tờ trình — muốn thay file phải liên hệ Trung tâm Đào tạo và Chỉ đạo tuyến
 *       429:
 *         description: Mã đăng ký đã được tra quá 20 lần trong 1 giờ, hoặc quá 20 lượt trong 15 phút theo IP
 */
