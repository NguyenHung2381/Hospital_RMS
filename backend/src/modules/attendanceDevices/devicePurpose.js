// Mục đích máy chấm công (attendance_devices.purpose — 2027-01-20_muc_dich_may_cham_cong.sql).
//   training  chấm công học viên: nhận học viên + vân tay, lượt chấm ghép buổi học và ca
//   seminar   dành cho hội nghị: không nhận học viên, lượt chấm không tính vào buổi học / ca
//   both      cả hai
const PURPOSES = ['training', 'seminar', 'both'];
const TRAINING_PURPOSES = ['training', 'both'];

const isTrainingPurpose = (purpose) => TRAINING_PURPOSES.includes(purpose);

// Điều kiện SQL "máy dùng cho đào tạo" trên bí danh bảng attendance_devices
const trainingDeviceSql = (alias = 'd') => `${alias}.purpose IN ('training', 'both')`;

module.exports = { PURPOSES, TRAINING_PURPOSES, isTrainingPurpose, trainingDeviceSql };
