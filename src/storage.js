// ===== localStorage 读写与清空（FR-09） =====
// 仅保存结构化学习记录摘要，不保存视频、不保存关键点。
// 规约：数据按用户名隔离，键 studymaterecords{username}，退出登录不清数据。

import { recordsKey } from './config.js';

const MAX_RECORDS = 500; // 安全上限（每条几 KB，localStorage 5MB 足够）

/**
 * 读取当前用户的全部往期记录
 * @param {string} username 当前登录用户名
 * @returns {Array<Object>} 记录数组（时间正序）
 */
export function loadRecords(username) {
  try {
    const raw = localStorage.getItem(recordsKey(username));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 保存一条往期记录（追加到末尾，保留最近 MAX_RECORDS 条）
 * @param {string} username 当前登录用户名
 * @param {Object} record 记录对象 {id, date, durationSec, focusSec, ...}
 */
export function saveRecord(username, record) {
  const records = loadRecords(username);
  records.push(record);
  while (records.length > MAX_RECORDS) {
    records.shift();
  }
  localStorage.setItem(recordsKey(username), JSON.stringify(records));
}

/**
 * 删除一条往期记录
 * @param {string} username 当前登录用户名
 * @param {string} id 记录 ID
 */
export function deleteRecord(username, id) {
  const records = loadRecords(username);
  const filtered = records.filter((r) => r.id !== id);
  localStorage.setItem(recordsKey(username), JSON.stringify(filtered));
}

/**
 * 清空当前用户的全部本地数据（"清空我的数据"按钮）
 * 只清当前用户的记录，不影响其他用户；不清隐私同意标记。
 * @param {string} username 当前登录用户名
 */
export function clearAllData(username) {
  localStorage.removeItem(recordsKey(username));
  // 清除旧版全局会话键（数据结构迁移遗留）
  localStorage.removeItem('studymate_sessions');
  // 注意：不清除隐私同意标记，避免重新弹窗困扰用户
}