# Bộ chứng thư gốc tin cậy — kiểm chữ ký số trên PDF

Dùng bởi `src/modules/training/registration/docCheck/signature/trustStore.js` (nạp một lần cho mỗi
tiến trình). Chuỗi chứng thư của người ký phải đi tới một chứng thư trong `roots/` thì chữ ký mới
được coi là `trusted`.

- `roots/` — chứng thư gốc tự ký, là điểm tin cậy (trust anchor).
- `intermediates/` — CA trung gian, KHÔNG phải điểm tin cậy; chỉ để nối chuỗi khi file ký không
  nhúng đủ chứng thư trung gian. Chứng thư trong đây vẫn phải được một gốc trong `roots/` ký.

Mỗi file là một chứng thư X.509 dạng PEM (đuôi `.crt` vì CI chặn file `.pem` trong git). File
`.p7b` của NEAC đã được tách ra lấy chứng thư duy nhất bên trong; nội dung chứng thư giữ nguyên.

## Nguồn (lấy ngày 26/11/2026)

**NEAC — Trung tâm Chứng thực điện tử quốc gia** (gốc của các CA công cộng: VNPT-CA, Viettel-CA,
BkavCA, FPT-CA, MISA-CA…). Trang <https://rootca.gov.vn/>, mục *Thông tin CTCKS RootCA → CTCKS
RootCA*; file tải ở `https://rootca.gov.vn/crt/<tên file>`. Không lấy *ROOT CA EMA*, *CA ERD*,
*CA LTA* (không dùng cho ký văn bản).

**Ban Cơ yếu Chính phủ — Cục Chứng thực số và Bảo mật thông tin** (chữ ký số chuyên dùng công vụ).
`https://ca.gov.vn` chuyển hướng tới <https://dichvucong.ca.gov.vn/>, mục *Tải tài nguyên →
Chứng thư số và CRL*; file tải ở `https://dichvucong.ca.gov.vn/api/tainguyen/download/<id>`. SHA-1
của từng file tải về khớp giá trị SHA-1 trang này công bố trong danh sách tài nguyên.

## Danh sách

Vân tay = SHA-256 của chứng thư (DER), dạng `openssl x509 -fingerprint -sha256`.

| File | Tên (CN) | Hiệu lực | Vân tay SHA-256 |
| --- | --- | --- | --- |
| `roots/neac-vietnam-national-root-ca-g3.crt` | Vietnam National Root CA G3 | 2024-06-20 → 2049-06-20 | `7B3269E7D79AEBBFAE5095F45BBB7074771E690CB7DF02B441062B12F7690ECE` |
| `roots/neac-vietnam-national-root-ca-g2.crt` | Vietnam National Root CA | 2014-04-15 → 2039-04-15 | `BAC8BF609AB420A8EE1780D74F4DE5C7F7184959D2A7375B0A75E4C29F0908E7` |
| `roots/neac-mic-national-root-ca-sha1.crt` | MIC National Root CA | 2008-05-16 → 2040-05-16 | `CA918D635BB130BEC97639E6AABF7EDBC4EB1310F8058B9419F467AE0230AD8C` |
| `roots/neac-root-ca-usbtoken.crt` | VIETNAM NATIONAL ROOT CA - USBTOKEN | 2025-11-25 → 2050-11-19 | `41803135F13A6359866E7E6F76DAFD598D496836944A52DD1FAD66B3BF2EE63B` |
| `roots/neac-root-ca-remote-signing.crt` | VIETNAM NATIONAL ROOT CA - RS | 2025-11-25 → 2050-11-19 | `12AFEBA2545F6FC0F31EC130F31BF2D16184A2B5B7CEBCB43CFD1BA35DD4EA46` |
| `roots/neac-root-ca-mobilepki.crt` | VIETNAM NATIONAL ROOT CA - MOBILEPKI | 2025-11-25 → 2050-11-19 | `C75535D65C0FF7480A3D6F393D56DA5F7C92DDCC071F4E9166C3F8D660EF836C` |
| `roots/neac-root-ca-tsa.crt` | VIETNAM NATIONAL ROOT CA - TSA | 2025-11-25 → 2050-11-19 | `D343B3C5132F7D1676C3560025AEFEF036FCEEC073C33F18E075B3A21C8F8552` |
| `roots/bcy-rootca-chuyen-dung-chinh-phu-g2.crt` | RootCA chuyên dùng Chính phủ G2 | 2018-08-22 → 2048-08-14 | `F04BA4B459A7C9A1B971AD9B1CB833E695A80C79AEA63B174B66A70EDFE2FDB8` |
| `roots/bcy-rootca-chuyen-dung-chinh-phu.crt` | Co quan chung thuc so chuyen dung Chinh phu (RootCA) | 2010-03-10 → 2030-03-05 | `F7BC89054CEC7F12730D7B8CD3EB7955B163835087E5EB873EDFB584763B3F90` |
| `intermediates/bcy-ca-dich-vu-phan-mem-g2.crt` | CA phục vụ cho dịch vụ phần mềm G2 | 2018-08-28 → 2048-08-14 | `40F3072893F35607E48F868DE76556905EC9784C3F1C9467DE767372556DF208` |
| `intermediates/bcy-ca-co-quan-dang-g2.crt` | CA phục vụ các cơ quan Đảng G2 | 2018-08-22 → 2048-08-14 | `E4B402E3CB4CACC0A20D21FA49BCE76BEB4EB47BA7FFB7A8F71C554DBE561A81` |
| `intermediates/bcy-ca-co-quan-nha-nuoc-g2.crt` | CA phục vụ các cơ quan Nhà nước G2 | 2018-08-22 → 2048-08-14 | `D8CAB7A4AEF92E6BB2509D7C61CEE7B44F3731B2D21074963530277B366FAE4B` |
| `intermediates/bcy-subca-dang-cong-san.crt` | Co quan chung thuc so Dang Cong san | 2010-11-08 → 2030-02-26 | `6E218B3EBC2F31B0D03205C64FD7E8920FB47187D37AFCDB4CB2BB4178BF4635` |
| `intermediates/bcy-subca-chinh-phu.crt` | Co quan chung thuc so Chinh phu | 2010-03-25 → 2030-03-04 | `75E969C07BA35C29C72BBC1BFB880F20F3891A619B00B77EB02CA6160736A1FE` |
| `intermediates/bcy-subca-bo-tai-chinh.crt` | Co quan chung thuc so Bo Tai chinh | 2010-03-10 → 2030-03-04 | `A262CFA489DBBE666F8B89FAB832547809874D5A06FA9F7A38FC227EBDF40514` |

File gốc tải về (để đối chiếu nếu tải lại):

| File tải về | SHA-256 của file tải về |
| --- | --- |
| `vnrca-g3.p7b` | `bd3f0e005540d3d8052857e50248476883efec7bd7db21328f571b6814c3d732` |
| `vnrca256.p7b` | `a367cf9a0300c1f4e98f32eac1179e6f46227de55bd5fa0977f1ef5bb95bbcee` |
| `micnrca.crt` | `ca918d635bb130bec97639e6aabf7edbc4eb1310f8058b9419f467ae0230ad8c` |
| `vnrca-usbtoken.p7b` | `1f48935e32e0edc373c5097e62df69edd8d99d78f13d35e283de2967157c649e` |
| `vnrca-rs.p7b` | `e15efcafec7d16260d15fa07b5243b2b7f4209f9b890a0a13715713f5ca15954` |
| `vnrca-mobilepki.p7b` | `1042b0752ec728ff2887cdcc888357edd33af9ecef2590d19b3c10c67a76011c` |
| `vnrca-tsa.p7b` | `537e51ed9e96f597a18fab62ef588d066d314375c16f12f445f91bbcef66f72d` |
| BCY *RootCA chuyên dùng Chính phủ G2* | `6e1ee7028e9572b91806f88e398fbf58daa171197b53a42577fcb8058784c296` |
| BCY *RootCA - Cơ quan chứng thực số chuyên dùng Chính phủ* | `fba775e22098d4585cb1d3096a32304d93c587731f31e34f6adc91617ce7f60e` |
| BCY *CA phục vụ cho dịch vụ, phần mềm G2* | `559bccc1f70fd00c47e4d7ca709f70b9d04a9e066cdb25f77694f8f617332166` |
| BCY *CA phục vụ các cơ quan Đảng G2* | `a72ff7d0869856feed157798707dd11470e088376f6895c658ccf58e575a2fe2` |
| BCY *CA phục vụ các cơ quan nhà nước G2* | `cbd742f00ebfd8ea8d940ff365d56c06bf9a7fa1a51fe1108e510d73b3800859` |
| BCY *Sub CA Đảng Cộng sản* | `7b7dad345790b36156b3be7b477de086bc8b06d7a753f09c126f1daf676b0af0` |
| BCY *Sub CA Chính phủ* | `8bf277cd766ff6cb7b8f51c98f2105d08a3aee0d8f82fbfa74bb439854434e57` |
| BCY *Sub CA Bộ Tài chính* | `ec39a53416300269b4609086371fda5aa5d532d02aed95c73a81a9213aabac3e` |

## Thêm / thay chứng thư

1. Chỉ tải từ trang chính thức ở trên; đối chiếu vân tay với trang (nếu trang có công bố).
2. Lưu dạng PEM, một chứng thư mỗi file, đuôi `.crt`, vào `roots/` (tự ký) hoặc `intermediates/`.
3. Cập nhật bảng trên. Test `test/training/pdfSignature.test.js` kiểm mọi file trong thư mục này
   đều có trong bảng với đúng vân tay, và mọi gốc đều tự ký.

Lưu ý: *RootCA* thế hệ cũ của Ban Cơ yếu và 3 Sub CA của nó hết hạn tháng 3/2030. Chữ ký có dấu
thời gian trước ngày đó vẫn kiểm được (hiệu lực xét tại thời điểm ký).
