// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

/**
 * 统一错误处理中间件
 */

// 自定义错误类
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message) {
    super(message, 400);
  }
}

class NotFoundError extends AppError {
  constructor(message = '资源不存在') {
    super(message, 404);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = '未授权访问') {
    super(message, 401);
  }
}

class ForbiddenError extends AppError {
  constructor(message = '禁止访问') {
    super(message, 403);
  }
}

class ConflictError extends AppError {
  constructor(message = '资源冲突') {
    super(message, 409);
  }
}

// 错误处理中间件
function errorHandler(err, req, res, next) {
  let error = { ...err, message: err.message };

  // 记录错误日志
  if (err.statusCode !== 400 && err.statusCode !== 401 && err.statusCode !== 404) {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  }

  // Sequelize 验证错误
  if (err.name === 'SequelizeValidationError') {
    const messages = err.errors.map(e => e.message);
    error = new ValidationError(messages.join('; '));
  }

  // SQLite 唯一约束错误
  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    const match = err.message.match(/UNIQUE constraint failed: (.+)/);
    if (match) {
      const field = match[1].split('.').pop();
      const fieldNames = {
        username: '用户名',
        phone: '手机号',
        email: '邮箱'
      };
      const fieldName = fieldNames[field] || field;
      error = new ConflictError(`${fieldName}已存在`);
    }
  }

  // 默认错误
  const statusCode = error.statusCode || 500;
  const message = error.isOperational ? error.message : '服务器内部错误';

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack
    })
  });
}

// 404 处理
function notFoundHandler(req, res, next) {
  next(new NotFoundError(`路径 ${req.originalUrl} 不存在`));
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  errorHandler,
  notFoundHandler
};
