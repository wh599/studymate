// ===== 极简 hash 路由（SPA，不引入路由库） =====
// 四个视图：#/login、#/home、#/study、#/history
// 未登录访问任何页面一律跳转 #/login；已登录访问 #/login 跳转 #/home。

import { isLoggedIn } from './auth.js';

const ROUTES = ['#/login', '#/home', '#/study', '#/history'];
const DEFAULT_ROUTE = '#/home';

/** 视图容器 ID 映射 */
const VIEW_IDS = {
  '#/login': 'view-login',
  '#/home': 'view-home',
  '#/study': 'view-study',
  '#/history': 'view-history',
};

let onRouteChangeCallback = null;

/**
 * 初始化路由：监听 hashchange，处理首次进入
 * @param {Function} onRouteChange 路由变化回调 (route) => void
 */
export function initRouter(onRouteChange) {
  onRouteChangeCallback = onRouteChange;
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

/** 解析当前 hash，执行守卫与视图切换 */
function handleRoute() {
  let hash = window.location.hash || DEFAULT_ROUTE;

  // 未知路由 → 默认
  if (!ROUTES.includes(hash)) {
    window.location.hash = DEFAULT_ROUTE;
    return;
  }

  // 登录守卫：未登录访问非 login 页 → 跳转 login
  if (hash !== '#/login' && !isLoggedIn()) {
    window.location.hash = '#/login';
    return;
  }

  // 已登录访问 login → 跳转 home
  if (hash === '#/login' && isLoggedIn()) {
    window.location.hash = DEFAULT_ROUTE;
    return;
  }

  // 切换视图容器
  for (const [route, viewId] of Object.entries(VIEW_IDS)) {
    const el = document.getElementById(viewId);
    if (!el) continue;
    if (route === hash) {
      showView(el);
    } else {
      hideView(el);
    }
  }

  // 更新导航高亮
  updateNavActive(hash);

  // 触发回调（页面级逻辑：渲染报告、启动动画等）
  if (onRouteChangeCallback) {
    onRouteChangeCallback(hash);
  }
}

/** 显示视图：先移除 hidden，再触发淡入上移动效 */
function showView(el) {
  el.classList.remove('hidden');
  // 重置动画
  el.classList.remove('view-enter');
  void el.offsetWidth; // 强制重绘
  el.classList.add('view-enter');
}

/** 隐藏视图 */
function hideView(el) {
  el.classList.add('hidden');
  el.classList.remove('view-enter');
}

/** 更新顶部导航 active 状态 */
function updateNavActive(hash) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.getAttribute('href') === hash);
  });
}

/** 编程式导航 */
export function navigate(route) {
  if (ROUTES.includes(route)) {
    window.location.hash = route;
  }
}

/** 获取当前路由 */
export function getCurrentRoute() {
  return window.location.hash || DEFAULT_ROUTE;
}