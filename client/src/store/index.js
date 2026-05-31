// Copyright (c) 2026 ZSQ320
// weak-current-platform is licensed under Mulan PSL v2.
// You can use this software according to the terms and conditions of the Mulan PSL v2.
// You may obtain a copy of Mulan PSL v2 at:
//          http://license.coscl.org.cn/MulanPSL2
// THIS SOFTWARE IS PROVIDED ON AN "AS IS" BASIS, WITHOUT WARRANTIES OF ANY
// KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
// NON-INFRINGEMENT, MERCHANTABILITY OR FIT FOR A PARTICULAR PURPOSE.
// See the Mulan PSL v2 for more details.

import { defineStore } from 'pinia'
import api from '../api'

export const useUserStore = defineStore('user', {
  state: () => ({
    accessToken: localStorage.getItem('accessToken') || '',
    refreshToken: localStorage.getItem('refreshToken') || '',
    user: JSON.parse(localStorage.getItem('user') || 'null')
  }),
  getters: {
    isLoggedIn: (state) => !!state.accessToken,
    isClient: (state) => state.user?.role === 'user',
    isEngineer: (state) => state.user?.role === 'engineer',
    isAdmin: (state) => state.user?.role === 'admin'
  },
  actions: {
    // 保存令牌
    saveTokens(accessToken, refreshToken) {
      this.accessToken = accessToken
      this.refreshToken = refreshToken
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', refreshToken)
    },

    // 登录
    async login(username, password) {
      const res = await api.post('/auth/login', { username, password })
      this.saveTokens(res.accessToken, res.refreshToken)
      this.user = res.user
      localStorage.setItem('user', JSON.stringify(res.user))
      return res
    },

    // 注册
    async register(data) {
      const res = await api.post('/auth/register', data)
      this.saveTokens(res.accessToken, res.refreshToken)
      this.user = res.user
      localStorage.setItem('user', JSON.stringify(res.user))
      return res
    },

    // 刷新令牌
    async refreshTokens() {
      if (!this.refreshToken) {
        this.logout()
        return false
      }

      try {
        const res = await api.post('/auth/refresh', {
          refreshToken: this.refreshToken
        })
        this.saveTokens(res.accessToken, res.refreshToken)
        return true
      } catch (err) {
        this.logout()
        return false
      }
    },

    // 获取用户信息
    async fetchUser() {
      try {
        const res = await api.get('/auth/me')
        this.user = res
        localStorage.setItem('user', JSON.stringify(res))
      } catch (err) {
        // 如果是令牌过期，尝试刷新
        if (err.response?.status === 401) {
          const refreshed = await this.refreshTokens()
          if (refreshed) {
            return this.fetchUser()
          }
        }
        throw err
      }
    },

    // 登出
    async logout() {
      // 通知服务器使令牌失效
      try {
        await api.post('/auth/logout')
      } catch (err) {
        // 忽略错误
      }

      this.accessToken = ''
      this.refreshToken = ''
      this.user = null
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
    }
  }
})
