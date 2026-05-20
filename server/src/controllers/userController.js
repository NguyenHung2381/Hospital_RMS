const userService = require('../services/userService');
const { success, created, notFound } = require('../utils/response');
const { createCrudController } = require('./crudController');

const base = createCrudController(userService);

const resetPassword = async (req, res, next) => {
  try {
    await userService.resetPassword(req.params.id, req.body.new_password, req.user.id);
    return success(res, null, 'Reset mật khẩu thành công');
  } catch (err) { next(err); }
};

const getMe = async (req, res, next) => {
  try {
    const user = await userService.getById(req.user.id);
    if (!user) return notFound(res);
    return success(res, user);
  } catch (err) { next(err); }
};

const searchMembers = async (req, res, next) => {
  try {
    const { q = '', department_id, limit = 10 } = req.query;
    const result = await userService.searchForMember({ q, department_id, limit });
    return success(res, result);
  } catch (err) { next(err); }
};

module.exports = { ...base, resetPassword, getMe, searchMembers };
