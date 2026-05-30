import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', name: 'Home', component: () => import('../views/Home.vue') },
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue') },
  { path: '/register', name: 'Register', component: () => import('../views/Register.vue') },
  { path: '/project/:id', name: 'ProjectDetail', component: () => import('../views/ProjectDetail.vue') },
  { path: '/publish', name: 'Publish', component: () => import('../views/ProjectPublish.vue'), meta: { requiresAuth: true, role: ['user'] } },
  { path: '/my-projects', name: 'MyProjects', component: () => import('../views/MyProjects.vue'), meta: { requiresAuth: true, role: ['user'] } },
  { path: '/my-bids', name: 'MyBids', component: () => import('../views/MyBids.vue'), meta: { requiresAuth: true, role: ['engineer'] } },
  { path: '/contracts', name: 'Contracts', component: () => import('../views/Contracts.vue'), meta: { requiresAuth: true } },
  { path: '/messages', name: 'Messages', component: () => import('../views/Messages.vue'), meta: { requiresAuth: true } },
  { path: '/profile', name: 'Profile', component: () => import('../views/Profile.vue'), meta: { requiresAuth: true } },
  { path: '/dashboard', name: 'Dashboard', component: () => import('../views/Dashboard.vue'), meta: { requiresAuth: true } },
  { path: '/admin', name: 'Admin', component: () => import('../views/Admin.vue'), meta: { requiresAuth: true, role: ['admin'] } }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  const user = JSON.parse(localStorage.getItem('user') || 'null')

  if (to.meta.requiresAuth) {
    if (!token) {
      next('/login')
    } else if (to.meta.role && !to.meta.role.includes(user?.role)) {
      next('/')
    } else {
      next()
    }
  } else if (to.path === '/' && !token) {
    next('/login')
  } else {
    next()
  }
})

export default router
