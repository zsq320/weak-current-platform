// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OR ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

/**
 * 实名认证相关工具函数
 */

import { ElMessageBox, ElMessage } from 'element-plus'

/**
 * 检查用户是否已完成实名认证
 * @param {Object} user - 用户对象
 * @returns {boolean}
 */
export function isVerified(user) {
  return !!user?.real_name_verified
}

/**
 * 检查用户是否需要实名认证才能发布项目
 * @param {Object} user - 用户对象
 * @returns {{ canOperate: boolean, missingFields: string[] }}
 */
export function canPublish(user) {
  const missingFields = []

  if (!user?.real_name) missingFields.push('真实姓名')
  if (!user?.phone) missingFields.push('手机号')
  if (!user?.email) missingFields.push('邮箱')
  if (!user?.real_name_verified) missingFields.push('实名认证')

  return {
    canOperate: missingFields.length === 0,
    missingFields
  }
}

/**
 * 检查用户是否需要实名认证才能投标
 * @param {Object} user - 用户对象
 * @returns {{ canOperate: boolean, missingFields: string[] }}
 */
export function canBid(user) {
  const missingFields = []

  if (!user?.real_name) missingFields.push('真实姓名')
  if (!user?.phone) missingFields.push('手机号')
  if (!user?.email) missingFields.push('邮箱')
  if (!user?.real_name_verified) missingFields.push('实名认证')

  return {
    canOperate: missingFields.length === 0,
    missingFields
  }
}

/**
 * 检查并提示实名认证
 * @param {Object} user - 用户对象
 * @param {Object} router - Vue Router 实例
 * @param {Object} options - 配置选项
 * @param {string} options.action - 操作名称（如 '发布项目'、'参与投标'）
 * @returns {Promise<boolean>} - 返回 true 表示可以继续操作
 */
export async function checkVerificationWithPrompt(user, router, options = {}) {
  const { action = '进行此操作' } = options

  const { canOperate, missingFields } = canPublish(user)

  if (canOperate) {
    return true
  }

  // 显示提示对话框
  try {
    await ElMessageBox.confirm(
      `您需要先完成以下信息才能${action}：\n${missingFields.join('、')}\n\n是否前往个人中心进行认证？`,
      '需要实名认证',
      {
        confirmButtonText: '前往认证',
        cancelButtonText: '取消',
        type: 'warning',
        dangerouslyUseHTMLString: false
      }
    )

    // 用户点击"前往认证"，跳转到个人中心
    router.push('/profile')
    return false
  } catch {
    // 用户取消
    return false
  }
}

/**
 * 检查实名认证状态（静默模式，不弹窗）
 * @param {Object} user - 用户对象
 * @returns {{ verified: boolean, message: string }}
 */
export function checkVerificationSilent(user) {
  const { canOperate, missingFields } = canPublish(user)

  if (canOperate) {
    return { verified: true, message: '' }
  }

  return {
    verified: false,
    message: `请先完成以下认证：${missingFields.join('、')}`
  }
}

export default {
  isVerified,
  canPublish,
  canBid,
  checkVerificationWithPrompt,
  checkVerificationSilent
}
