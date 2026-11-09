// ===== 用户行为判定设置 + 检测阈值 + 数据导出（localStorage 读写） =====
// 用户可自定义每种行为归类为"分心"、"疲劳"还是"不检测"。
// 检测阈值可通过滑块覆盖 config 默认值。

import { STORAGE_KEYS, BEHAVIOR_DEFINITIONS, THRESHOLD_DEFINITIONS, CONFIG } from './config.js';

/**
 * 获取默认设置（从 BEHAVIOR_DEFINITIONS 生成）
 * @returns {Object} { behaviorKey: 'distracted' | 'fatigued' | 'none' }
 */
export function getDefaultSettings() {
  const defaults = {};
  for (const def of BEHAVIOR_DEFINITIONS) {
    defaults[def.key] = def.defaultCategory;
  }
  return defaults;
}

/**
 * 从 localStorage 读取用户设置，缺失的键用默认值补齐
 * @returns {Object} { behaviorKey: category }
 */
export function loadSettings() {
  const defaults = getDefaultSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    // 合并：以默认值为基底，覆盖已保存的键（兼容新增行为）
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

/**
 * 保存用户设置到 localStorage
 * @param {Object} settings { behaviorKey: category }
 */
export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  } catch {
    // 存储失败静默处理（隐私模式等场景）
  }
}

/**
 * 重置为默认设置并保存
 * @returns {Object} 默认设置
 */
export function resetSettings() {
  const defaults = getDefaultSettings();
  saveSettings(defaults);
  return defaults;
}

// ===== 检测阈值（滑块设置，覆盖 CONFIG 默认值） =====

/**
 * 获取默认阈值（从 CONFIG 读取）
 * @returns {Object} { EAR_THRESHOLD, PITCH_THRESHOLD, PERCLOS_THRESHOLD }
 */
export function getDefaultThresholds() {
  const defaults = {};
  for (const def of THRESHOLD_DEFINITIONS) {
    defaults[def.key] = CONFIG[def.key];
  }
  return defaults;
}

/**
 * 从 localStorage 读取阈值覆盖，缺失的键用 CONFIG 默认值补齐
 * @returns {Object} { EAR_THRESHOLD, PITCH_THRESHOLD, PERCLOS_THRESHOLD }
 */
export function loadThresholds() {
  const defaults = getDefaultThresholds();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.THRESHOLDS);
    if (!raw) return defaults;
    const saved = JSON.parse(raw);
    const merged = { ...defaults, ...saved };
    // 确保数值类型合法
    for (const def of THRESHOLD_DEFINITIONS) {
      const v = Number(merged[def.key]);
      if (Number.isNaN(v) || v < def.min || v > def.max) {
        merged[def.key] = defaults[def.key];
      } else {
        merged[def.key] = v;
      }
    }
    return merged;
  } catch {
    return defaults;
  }
}

/**
 * 保存阈值到 localStorage
 * @param {Object} thresholds { EAR_THRESHOLD, PITCH_THRESHOLD, PERCLOS_THRESHOLD }
 */
export function saveThresholds(thresholds) {
  try {
    localStorage.setItem(STORAGE_KEYS.THRESHOLDS, JSON.stringify(thresholds));
  } catch {
    // 存储失败静默处理
  }
}

/**
 * 重置阈值为默认值并保存
 * @returns {Object} 默认阈值
 */
export function resetThresholds() {
  const defaults = getDefaultThresholds();
  saveThresholds(defaults);
  return defaults;
}

// ===== 数据导出 =====

/**
 * 导出我的数据为 JSON 文件下载
 * 包含：学习会话、行为设置、检测阈值
 */
export function exportMyData() {
  const data = {
    exportedAt: new Date().toISOString(),
    app: 'StudyMate',
    version: 1,
    sessions: JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSIONS) || '[]'),
    behaviorSettings: loadSettings(),
    thresholds: loadThresholds(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  a.href = url;
  a.download = `studymate-data-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}