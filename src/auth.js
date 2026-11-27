// ===== 登录（演示版：假登录，只记住"当前是谁"，不存任何账号密码） =====
//
// 用途：给评委演示完整的"登录 → 主页 → 学习 → 往期数据"流程。
// 规则：用户名 + 密码任意填写都能进入（空着也行，默认以"同学"进入）。
// 安全：本地没有任何后端，也刻意不保存密码；localStorage 里只有一个当前用户名。
//       旧版本残留的 studymateusers（哈希表）会在登录时顺手清掉。

const KEY_SESSION = 'studymatesession';
const LEGACY_KEY_USERS = 'studymateusers';
const DEFAULT_NAME = '同学';

/** 模拟一次网络请求的等待，让登录过程看起来更真实 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 登录：任意用户名 / 密码都通过，用户名会作为"当前用户"记在本机
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function login(username, password) {
  const name = (username || '').trim() || DEFAULT_NAME;
  await delay(420);
  // 演示版不校验密码，也不记录密码；旧版哈希表一并清理
  localStorage.removeItem(LEGACY_KEY_USERS);
  setCurrentUser(name);
  void password;
  return { ok: true, message: '登录成功' };
}

/**
 * 注册：同样不做任何校验，注册即登录（演示版没有账号体系）
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function register(username, password) {
  const name = (username || '').trim() || DEFAULT_NAME;
  await delay(420);
  localStorage.removeItem(LEGACY_KEY_USERS);
  setCurrentUser(name);
  void password;
  return { ok: true, message: '注册成功' };
}

/**
 * 游客演示：一键以 demo 用户进入
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function guestDemo() {
  await delay(260);
  setCurrentUser('demo');
  return { ok: true, message: '已进入演示模式' };
}

/** 登出 */
export function logout() {
  localStorage.removeItem(KEY_SESSION);
}

/** 获取当前登录用户名（未登录返回 null） */
export function getCurrentUser() {
  return localStorage.getItem(KEY_SESSION);
}

/** 是否已登录 */
export function isLoggedIn() {
  return !!localStorage.getItem(KEY_SESSION);
}

/** 设置当前登录用户 */
function setCurrentUser(username) {
  localStorage.setItem(KEY_SESSION, username);
}
