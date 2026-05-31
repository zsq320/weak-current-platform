// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

import axios from 'axios'
import { ElMessage } from 'element-plus'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000
})

// 是否正在刷新令牌
let isRefreshing = false
// 等待刷新的请求队列
let refreshSubscribers = []

// 将请求加入队列
function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb)
}

// 令牌刷新完成后，执行队列中的请求
function onTokenRefreshed(newToken) {
  refreshSubscribers.forEach(cb => cb(newToken))
  refreshSubscribers = []
}

// 请求拦截器
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器
api.interceptors.response.use(
  response => response.data,
  async error => {
    const originalRequest = error.config
    const msg = error.response?.data?.error || '请求失败'

    // 处理 401 错误 - 尝试刷新令牌
    if (error.response?.status === 401 && !originalRequest._retry) {
      // 如果是刷新令牌接口本身失败，直接登出
      if (originalRequest.url.includes('/auth/refresh')) {
        clearAuth()
        return Promise.reject(error)
      }

      // 如果正在刷新，将请求加入队列
      if (isRefreshing) {
        return new Promise((resolve) => {
          subscribeTokenRefresh((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`
            resolve(api(originalRequest))
          })
        })
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) {
          throw new Error('No refresh token')
        }

        const res = await axios.post('/api/auth/refresh', { refreshToken })

        // 保存新令牌
        localStorage.setItem('accessToken', res.data.accessToken)
        localStorage.setItem('refreshToken', res.data.refreshToken)

        // 重试原请求
        originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`
        onTokenRefreshed(res.data.accessToken)

        return api(originalRequest)
      } catch (refreshError) {
        // 刷新失败，清除本地存储并跳转登录
        clearAuth()
        ElMessage.warning('登录已过期，请重新登录')
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    // 其他错误处理
    if (error.response?.status === 401) {
      clearAuth()
    } else {
      ElMessage.error(msg)
    }

    return Promise.reject(error)
  }
)

// 清除认证信息
function clearAuth() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
  // 延迟跳转，避免在请求处理中立即跳转
  setTimeout(() => {
    if (window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  }, 100)
}

export default api
