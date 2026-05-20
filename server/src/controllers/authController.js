const authService = require('../services/authService');
const { success, error } = require('../utils/response');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const data = await authService.login(username, password);
    return success(res, data, 'Đăng nhập thành công');
  } catch (err) {
    next(err);
  }
};

const refresh = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    const data = await authService.refreshAccessToken(refresh_token);
    return success(res, data, 'Làm mới token thành công');
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    await authService.logout(refresh_token);
    return success(res, null, 'Đăng xuất thành công');
  } catch (err) {
    next(err);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { old_password, new_password } = req.body;
    await authService.changePassword(req.user.id, old_password, new_password);
    return success(res, null, 'Đổi mật khẩu thành công');
  } catch (err) {
    next(err);
  }
};

module.exports = { login, refresh, logout, changePassword };
