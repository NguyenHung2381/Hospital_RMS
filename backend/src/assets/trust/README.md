# Bộ chứng thư gốc tin cậy — kiểm chữ ký số trên PDF

Dùng bởi `src/modules/training/registration/docCheck/signature/trustStore.js` (nạp một lần cho mỗi
tiến trình). Chuỗi chứng thư của người ký phải đi tới một chứng thư trong `roots/` thì chữ ký mới
được coi là `trusted`.

- `roots/` — chứng thư gốc tự ký, là điểm tin cậy (trust anchor).
- `intermediates/` — CA trung gian, KHÔNG phải điểm tin cậy; chỉ để nối chuỗi khi file ký không
  nhúng đủ chứng thư trung gian (và chứng thư TSA, khi dấu thời gian không nhúng chứng thư của nó).
  Chứng thư trong đây vẫn phải được một gốc trong `roots/` ký. Tên file kèm năm hết hạn.

Mỗi file là một chứng thư X.509 dạng PEM (đuôi `.crt` vì CI chặn file `.pem` trong git). File
`.p7b` tải về đã được tách ra lấy chứng thư cần dùng; nội dung chứng thư giữ nguyên.

## Nguồn (lấy ngày 26/11/2026)

**NEAC — Trung tâm Chứng thực điện tử quốc gia** (gốc của các CA công cộng: VNPT-CA, Viettel-CA,
BkavCA, FPT-CA, MISA-CA…). Trang <https://rootca.gov.vn/>, mục *Thông tin CTCKS RootCA → CTCKS
RootCA*; file tải ở `https://rootca.gov.vn/crt/<tên file>`. Không lấy *ROOT CA EMA*, *CA ERD*,
*CA LTA* (không dùng cho ký văn bản).

**CA công cộng (trung gian dưới gốc NEAC)**: VNPT-CA, Viettel-CA, BkavCA, FPT-CA, MISA-CA — cũng lấy từ
<https://rootca.gov.vn/>, mục *Thông tin các CA công cộng → <tên CA>*; file tải ở
`https://rootca.gov.vn/crt/<tên file>`. Mỗi file `.p7b` gồm chứng thư CA trung gian kèm gốc NEAC cấp nó
(gốc trùng vân tay với gốc trong `roots/`); chỉ giữ chứng thư trung gian. Lấy cả bản đã hết hạn để
kiểm được chữ ký cũ (hiệu lực xét tại thời điểm ký). 3 chứng thư *Timestamping* là chứng thư ký dấu
thời gian của TSA (không phải CA). 3 file *RS 2026* là PKCS#7 dạng PEM, còn lại DER.

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

CA trung gian của CA công cộng (`intermediates/`, nguồn rootca.gov.vn):

| File | Tên (CN) | Hiệu lực | Gốc cấp | Vân tay SHA-256 |
| --- | --- | --- | --- | --- |
| `intermediates/bkavca-het-han-2020.crt` | BkavCA | 2015-05-15 → 2020-05-15 | MIC National Root CA | `DDAB3AA11600215C08CA4CCBC18BE5204C171A48081A6CD73A95AA868E1258AF` |
| `intermediates/bkavca-2019-het-han-2024.crt` | BkavCA | 2019-05-10 → 2024-05-10 | MIC National Root CA | `AB7806EF11EE9DC76C9498A626EAC875384AE70866BEDBFF49F6830EEAB30E21` |
| `intermediates/bkavca-rs-het-han-2027.crt` | BkavCA RS | 2022-07-07 → 2027-07-07 | Vietnam National Root CA | `28EB55727B391958AB7060FEF404D283D7EC444534E5E0F818345710D284A145` |
| `intermediates/bkavca-sha256-het-han-2029.crt` | BkavCA SHA256 | 2024-05-09 → 2029-05-09 | Vietnam National Root CA | `B30C57C89FADDEE48B3614AF59645BD6871CCA2DC6506243CAFAAFF44154A919` |
| `intermediates/fpt-ca-het-han-2020.crt` | FPT Certification Authority | 2015-10-21 → 2020-10-21 | MIC National Root CA | `406BA8BE66EAD6D01672F1E137CC35A778E2F289EDD3F9E7580964190B83C761` |
| `intermediates/fpt-ca-2019-het-han-2024.crt` | FPT Certification Authority | 2019-06-01 → 2024-06-01 | MIC National Root CA | `47A8679E03B9E7078539A06ED556CA0BACEF07426AF9834612009A76079BA263` |
| `intermediates/fpt-ca-sha256-het-han-2025.crt` | FPT Certification Authority SHA256 | 2020-04-17 → 2025-04-17 | Vietnam National Root CA | `617743E4F3D98F0B08EEB40BB77B29C7D04A23776F1044789598B32800C2C2B1` |
| `intermediates/fpt-certification-authority-rs-het-han-2027.crt` | FPT Certification Authority RS | 2022-01-25 → 2027-01-25 | Vietnam National Root CA | `CB60732F9C58044304B53AC90941C188CFB733EC5A507E5A2F057EC7F511D972` |
| `intermediates/fpt-certification-authority-timestamping-het-han-2028.crt` | FPT Certification Authority Timestamping *(TSA, không phải CA)* | 2023-06-07 → 2028-06-07 | Vietnam National Root CA | `17C81E9AB51D4450E684861213B6B57BE34B9AD27909D6D5E013D629001862D0` |
| `intermediates/fpt-sha256-2025-het-han-2030.crt` | FPT Certification Authority SHA256 | 2025-01-07 → 2030-01-07 | Vietnam National Root CA | `D36F1110D4BBF11BC80A312830FF4078509F55D9099A4E913D4743BE5B903B06` |
| `intermediates/misa-ca-het-han-2024.crt` | MISA-CA | 2019-11-20 → 2024-11-20 | Vietnam National Root CA | `C8B3186A611DD6A9445924CDC6A950D1592777935310983E6E56861AC8C92337` |
| `intermediates/misa-ca-rs-het-han-2026.crt` | MISA-CA RS | 2021-12-03 → 2026-12-03 | Vietnam National Root CA | `6F471D7820E7608AA7E83525617DC7C65932D9CC3D6E550383C8056764451B2C` |
| `intermediates/misa-ca-rs2026-het-han-2031.crt` | MISA-CA RS | 2026-05-29 → 2031-05-28 | VIETNAM NATIONAL ROOT CA - RS | `626BC107F65EB15BB1E456A1DB71853E0BB36CA754A3273E84276F1987AEB010` |
| `intermediates/misa-ca-sha256-2024-het-han-2029.crt` | MISA-CA SHA256 | 2024-05-14 → 2029-05-14 | Vietnam National Root CA | `8D37501361C79A128D43976114289D3493D99F0FA344382598560AA99A89FB9C` |
| `intermediates/vnpt-ca-2019-het-han-2024.crt` | VNPT Certification Authority | 2019-06-26 → 2024-06-26 | MIC National Root CA | `F20E908AA29477CE03F79B78A4E6646777BAE432739F6F0F95F8864F33134B46` |
| `intermediates/vnpt-ca-sha-256-het-han-2025.crt` | VNPT-CA SHA-256 | 2020-07-28 → 2025-07-28 | Vietnam National Root CA | `4D1FEF4555A888AF4D5B036A7450E32A7691235F0543F4B8584EDB918BDD1333` |
| `intermediates/vnpt-ca-sha2-het-han-2029.crt` | VNPT-CA SHA2 | 2024-08-30 → 2029-08-30 | Vietnam National Root CA | `7D6BA5245317F9ED5D8BC765A4634D26AC6340D36B9F584DF3B52D9C4A81A306` |
| `intermediates/vnptca-het-han-2019.crt` | VNPT Certification Authority | 2009-12-16 → 2019-12-16 | MIC National Root CA | `068927B4C1A38AE4DB1E8F59A71A8C643D9DFBB53A674862387BD5AA7386247B` |
| `intermediates/vnpt-certification-timestamping-authority-het-han-2028.crt` | VNPT Certification Timestamping Authority *(TSA, không phải CA)* | 2023-08-25 → 2028-08-25 | Vietnam National Root CA | `76413A7996A4ED77DC5406E98B4298A24EF8AECC929B554FB025552E41898EB1` |
| `intermediates/vnpt-smartca-rs-het-han-2026.crt` | VNPT SmartCA RS | 2021-11-18 → 2026-11-18 | Vietnam National Root CA | `95CF8F36C986E0C0F7E03761B17D7804072CB644B235A8F1C62107F8804A4889` |
| `intermediates/vnpt-smartca-rs2026-het-han-2031.crt` | VNPT SmartCA RS 2026 | 2026-04-29 → 2031-04-28 | VIETNAM NATIONAL ROOT CA - RS | `6987DCEAD87FEB48E18CC332D0C8D0855179AA5976F4A5AEADBA479F9252B5FB` |
| `intermediates/viettel-ca-2019-het-han-2024.crt` | Viettel-CA | 2019-05-13 → 2024-05-13 | MIC National Root CA | `CAA2B4D762B8ED894B3CBAD76E531834EEE78BBBFE13D157BF27B64AA56975F1` |
| `intermediates/viettel-ca-rs-het-han-2027.crt` | Viettel-CA RS | 2022-09-26 → 2027-09-26 | Vietnam National Root CA | `860BCBE22FDC6757FE03B4597F7C61CA7F36E13CEB74A78CBEFC9C5B267B8662` |
| `intermediates/viettel-ca-rs-2026-het-han-2031.crt` | Viettel-CA RS 2026 | 2026-03-30 → 2031-03-29 | VIETNAM NATIONAL ROOT CA - RS | `2D729CB257CC1F61B79C8FEEF7DA5063766DDEA6E5AF16ED7480BBB15342A6FF` |
| `intermediates/viettel-ca-sha-256-het-han-2025.crt` | Viettel-CA SHA-256 | 2020-09-24 → 2025-09-24 | Vietnam National Root CA | `555F4423A0290F0A5D8F94B4F8AD82F5281158E3D8C7C1CB2113A62BFA4CB4C9` |
| `intermediates/viettel-ca-sha2-2024-het-han-2029.crt` | Viettel-CA SHA2 | 2024-04-17 → 2029-04-17 | Vietnam National Root CA | `DCC79CACD7C7D639ED7E253E1EE780C90CCACD4CFC8CA57954D54C624A7F72E4` |
| `intermediates/viettel-ca-timestamping-het-han-2029.crt` | Viettel-CA Timestamping *(TSA, không phải CA)* | 2024-05-23 → 2029-05-23 | Vietnam National Root CA | `7E4AA634318D0C2DAF0182B94B6B75D26CEC7DAB821CE3502BDB66745858E424` |
| `intermediates/viettel-ca-het-han-2020.crt` | Viettel-CA | 2015-10-02 → 2020-10-02 | MIC National Root CA | `684CAF190176D13158808EF193B2D20575399A87FD9E8C5BEDC09065A184841A` |

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
| `BKAVCA.p7b` | `5912563e8ab2536f824bc48b43e1f4d7c8c92180d8d72805e7d7af7ac04daaf2` |
| `BkavCA_2019.p7b` | `14e2f0af25b475ff285e7b2ccf8738eae60a32fd275c8a145bb00c425c148462` |
| `BkavCA_RS.p7b` | `9f6f8ee65ed16b9aafc4b08418286bc0897ddca8af37ed852c7b5ed952d016e7` |
| `BkavCA_SHA256.p7b` | `861c620f5f320621e9476b174a3c41ad5f9a549c3f3e686a47b5d886df508f02` |
| `FPT-CA.p7b` | `654a7ee51aa511d2090b88a201021c284590727a2f94c970c24d6c55ceaa493c` |
| `FPT-CA_2019.p7b` | `54ad504179a14a055393d28fe7178362c12dedee1818ddcef8729bd431e7cd74` |
| `FPT-CA_SHA256.p7b` | `6c662ca5cb4bffb93d633330f9c78b3038e1a43078c74aa6b89379062f9920f4` |
| `FPT_Certification_Authority_RS.p7b` | `b099434c4e9ff27eed8f8c901bf6c4edfafa63b8433c57b6f837dee1443d0e09` |
| `FPT_Certification_Authority_Timestamping.p7b` | `5d0af0139023643ca1ccc3fb7fed56ae677697e6b7f008c633a26fe5e24c9f56` |
| `FPT_SHA256_2025.p7b` | `c5fbbed6ffe71be952078ada26a4b66626e65a8330408536b754d9f1d46be508` |
| `MISA-CA.p7b` | `d0f8ba6886cb98dfd4fb22ea3440f863205e99151cbef7b682631140c8c0d6a4` |
| `MISA-CA_RS.p7b` | `53d8b7ea8adbb8fa107efd29556af6ecc0178605b40b340c92330c08b8a0f952` |
| `MISA-CA_RS2026.p7b` | `b46a00a4d6ff867c5b076062aab9728f72ea0439189797a54c435969974ef835` |
| `MISA-CA_SHA256_2024.p7b` | `569bbacd53e8c7f3a74ae6dce58632dcfc6a66bdd951082a086ca2ca02a189d1` |
| `VNPT-CA_2019.p7b` | `18dbc21555cfdb3ede3daa67eee42f5e76749fefb637c55c6132a27c18ac33a6` |
| `VNPT-CA_SHA-256.p7b` | `5f1fb19e3575f57bf335ec5d87db46a011d87acffa3866d703ad2ab978790a3d` |
| `VNPT-CA_SHA2.p7b` | `61d9242ab77f048bf53412a5361168f9069653fb717470efb63662a35766d90d` |
| `VNPTCA.p7b` | `2a02a484e7e41a335db7c8f363862dd6a5b6a8c04ece703d7acfc31f9b55e08e` |
| `VNPT_Certification_Timestamping_Authority.p7b` | `12361d152e40e1d7a70b82a1b08ee2f1fc247fc7a6da086a18c1bbc42fe3f736` |
| `VNPT_SmartCA_RS.p7b` | `123560d7ebad4e953275a0d04178eb8b6b33646e9804658395c0fda13b28ff80` |
| `VNPT_SmartCA_RS2026.p7b` | `f3940a74868539db0f58c4425287b9609b1134ab5b716649c55db4a20aeed5c7` |
| `Viettel-CA_2019.p7b` | `39d4d5ae145b8f390f6eba6f00a568b32c119cbc4fb6f0e0a7994a6cce595892` |
| `Viettel-CA_RS.p7b` | `2095dcc415ca3ef8a5648468846f497ca6798322fe2212f07597e47fe2240192` |
| `Viettel-CA_RS_2026.p7b` | `d0c5f8128c7c55dd1235063bc2ed300520956fdba67b63332a714286ad85c18e` |
| `Viettel-CA_SHA-256.p7b` | `b9953af8467c7865c90ebf21b042e0b14354a90fc53a071a362346a4cc34c37a` |
| `Viettel-CA_SHA2_2024.p7b` | `3d68ec40aa0c9a94eead541732a12ae103d5e59037b8246ff6d4d4ccbe6ad36d` |
| `Viettel-CA_Timestamping.p7b` | `0ef9785a1fb95999fe041de1e2478144531c7f9d30392fcf5cdf458f990e9aac` |
| `viettel-ca.p7b` | `d2eced54ea9e398ef83700387c11eb9c25918f0fded36c06112dd2dd31c5577d` |

## Thêm / thay chứng thư

1. Chỉ tải từ trang chính thức ở trên; đối chiếu vân tay với trang (nếu trang có công bố).
2. Lưu dạng PEM, một chứng thư mỗi file, đuôi `.crt`, vào `roots/` (tự ký) hoặc `intermediates/`.
3. Cập nhật bảng trên. Test `test/training/pdfSignature.test.js` kiểm mọi file trong thư mục này
   đều có trong bảng với đúng vân tay, và mọi gốc đều tự ký.

Lưu ý: *RootCA* thế hệ cũ của Ban Cơ yếu và 3 Sub CA của nó hết hạn tháng 3/2030. Chữ ký có dấu
thời gian trước ngày đó vẫn kiểm được (hiệu lực xét tại thời điểm ký).
