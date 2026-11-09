// ===== 本地账号系统（演示级，不建后端） =====
// localStorage 键：
//   studymateusers    → [{ username, passHash }]（密码用 Web Crypto API 做 SHA-256）
//   studymatesession  → 当前登录用户名
// 安全说明：演示级方案，SHA-256 无盐仅防明文直读，不防彩虹表/暴力破解。

const KEY_USERS = 'studymateusers';
const KEY_SESSION = 'studymatesession';

/**
 * SHA-256 哈希（Web Crypto API）
 * @param {string} text 明文
 * @returns {Promise<string>} 十六进制哈希值
 */
async function sha256(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 读取用户列表 */
function loadUsers() {
  try {
    const raw = localStorage.getItem(KEY_USERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 保存用户列表 */
function saveUsers(users) {
  localStorage.setItem(KEY_USERS, JSON.stringify(users));
}

/**
 * 注册新用户
 * @param {string} username 用户名（1-20 字符）
 * @param {string} password 密码（≥ 4 字符）
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function register(username, password) {
  const name = (username || '').trim();
  if (!name || name.length > 20) {
    return { ok: false, message: '用户名需为 1-20 个字符' };
  }
  if (!password || password.length < 4) {
    return { ok: false, message: '密码至少 4 个字符' };
  }

  const users = loadUsers();
  if (users.some((u) => u.username === name)) {
    return { ok: false, message: '该用户名已被注册' };
  }

  const passHash = await sha256(name + ':' + password); // 用户名做简单盐
  users.push({ username: name, passHash });
  saveUsers(users);

  // 注册成功即登录
  setCurrentUser(name);
  return { ok: true, message: '注册成功' };
}

/**
 * 登录
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function login(username, password) {
  const name = (username || '').trim();
  if (!name || !password) {
    return { ok: false, message: '请输入用户名和密码' };
  }

  const users = loadUsers();
  const passHash = await sha256(name + ':' + password);
  const user = users.find((u) => u.username === name && u.passHash === passHash);

  if (!user) {
    return { ok: false, message: '用户名或密码错误' };
  }

  setCurrentUser(name);
  return { ok: true, message: '登录成功' };
}

/**
 * 游客演示：一键以 demo 用户进入（自动创建）
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function guestDemo() {
  const users = loadUsers();
  if (!users.some((u) => u.username === 'demo')) {
    const passHash = await sha256('demo:demo1234');
    users.push({ username: 'demo', passHash });
    saveUsers(users);
  }
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