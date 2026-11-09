// ===== 入口：路由、认证、主页、检测循环 =====

import { CONFIG, STORAGE_KEYS, BEHAVIOR_DEFINITIONS, THRESHOLD_DEFINITIONS } from './config.js';
import { startCamera, stopCamera } from './camera.js';
import { initVision, detectFrame, initHandVision, detectHands } from './vision.js';
import { calcEAR, calcHeadPose, calcHeadPoseFromMatrix, calcFaceRatio, calcFaceBoundingBox, EYE_LANDMARK_INDICES } from './metrics.js';
import {
  absenceDetector,
  eyeClosedDetector,
  perclosDetector,
  headDownDetector,
  headTurnDetector,
  tooCloseDetector,
  phoneDetector,
  touchFaceDetector,
  handNearMouthDetector,
  lookUpDetector,
  stareDetector,
} from './detectors.js';
import { loadSettings, saveSettings, resetSettings, loadThresholds, saveThresholds, resetThresholds, exportMyData } from './settings.js';
import { updateStateMachine, STATES, resetStateMachine, getState } from './stateMachine.js';
import { createSession } from './session.js';
import { saveRecord, loadRecords, deleteRecord, clearAllData } from './storage.js';
import { getDemoSessions } from './demoData.js';
import { renderReportInto, renderTrendChart, resizeCharts, computeStats, generateAdvice } from './report.js';
import { initCoach, buildSessionSummary, clearChatHistory } from './coach.js';
import { register, login, guestDemo, logout, getCurrentUser, isLoggedIn } from './auth.js';
import { initRouter, navigate, getCurrentRoute } from './router.js';

// ---- DOM 引用：摄像头与检测 ----
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const privacyOverlay = document.getElementById('privacyOverlay');
const consentBtn = document.getElementById('consentBtn');
const startCameraBtn = document.getElementById('startCameraBtn');
const stopCameraBtn = document.getElementById('stopCameraBtn');
const retryBtn = document.getElementById('retryBtn');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const errorOverlay = document.getElementById('errorOverlay');
const errorText = document.getElementById('errorText');
const localIndicator = document.getElementById('localIndicator');
const fpsDisplay = document.getElementById('fpsDisplay');
const faceStatus = document.getElementById('faceStatus');
const landmarkToggle = document.getElementById('landmarkToggle');

// 指标面板元素
const earValue = document.getElementById('earValue');
const earBar = document.getElementById('earBar');
const earThresholdMark = document.getElementById('earThresholdMark');
const pitchValue = document.getElementById('pitchValue');
const pitchHint = document.getElementById('pitchHint');
const yawValue = document.getElementById('yawValue');
const yawHint = document.getElementById('yawHint');
const faceRatioValue = document.getElementById('faceRatioValue');
const faceRatioHint = document.getElementById('faceRatioHint');
const eyeStatus = document.getElementById('eyeStatus');
const calibStatus = document.getElementById('calibStatus');
const phoneStatus = document.getElementById('phoneStatus');

// 状态面板元素
const stateBadge = document.getElementById('stateBadge');
const stateIcon = document.getElementById('stateIcon');
const stateName = document.getElementById('stateName');
const stateReason = document.getElementById('stateReason');
const sessionStartBtn = document.getElementById('sessionStartBtn');
const sessionPauseBtn = document.getElementById('sessionPauseBtn');
const sessionStopBtn = document.getElementById('sessionStopBtn');
const elapsedTime = document.getElementById('elapsedTime');
const focusStreakTime = document.getElementById('focusStreakTime');
const durFocus = document.getElementById('durFocus');
const durFocusTime = document.getElementById('durFocusTime');
const durDistracted = document.getElementById('durDistracted');
const durDistractedTime = document.getElementById('durDistractedTime');
const durFatigued = document.getElementById('durFatigued');
const durFatiguedTime = document.getElementById('durFatiguedTime');
const durAbsent = document.getElementById('durAbsent');
const durAbsentTime = document.getElementById('durAbsentTime');
const fatigueTip = document.getElementById('fatigueTip');

// ---- DOM 引用：布局/导航/弹窗 ----
const appHeader = document.getElementById('appHeader');
const settingsBtn = document.getElementById('settingsBtn');
const settingsBackdrop = document.getElementById('settingsBackdrop');
const settingsDrawer = document.getElementById('settingsDrawer');
const settingsCloseBtn = document.getElementById('settingsCloseBtn');
const thresholdSliders = document.getElementById('thresholdSliders');
const resetThresholdsBtn = document.getElementById('resetThresholdsBtn');
const behaviorTableBody = document.getElementById('behaviorTableBody');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const exportDataBtn = document.getElementById('exportDataBtn');
const clearDataBtn = document.getElementById('clearDataBtn');
const logoutBtn = document.getElementById('logoutBtn');
  // ---- DOM 引用：学习页顶栏与报告覆盖层 ----
  const studyBackBtn = document.getElementById('studyBackBtn');
  const studyReportOverlay = document.getElementById('studyReportOverlay');
  const studyReportBody = document.getElementById('studyReportBody');
  const saveRecordBtn = document.getElementById('saveRecordBtn');
  const discardRecordBtn = document.getElementById('discardRecordBtn');

  // ---- DOM 引用：历史页统计卡与趋势图 ----
  const statTotalDays = document.getElementById('statTotalDays');
  const statTotalDuration = document.getElementById('statTotalDuration');
  const statAvgFocus = document.getElementById('statAvgFocus');
  const trendChart = document.getElementById('trendChart');

const historyList = document.getElementById('historyList');
const reportEmpty = document.getElementById('reportEmpty');
const emptyStartBtn = document.getElementById('emptyStartBtn');
const demoDataBtn = document.getElementById('demoDataBtn');

// ---- DOM 引用：登录页 ----
const authForm = document.getElementById('authForm');
const authUsername = document.getElementById('authUsername');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const switchAuthMode = document.getElementById('switchAuthMode');
const guestDemoBtn = document.getElementById('guestDemoBtn');
let isRegisterMode = false;

// ---- DOM 引用：主页 ----
const homeGreeting = document.getElementById('homeGreeting');
const homeDate = document.getElementById('homeDate');
const homeMotto = document.getElementById('homeMotto');
const startLearningBtn = document.getElementById('startLearningBtn');
const actionHistory = document.getElementById('actionHistory');

// ---- 运行状态 ----
let mediaStream = null;
let landmarker = null;
let handLandmarker = null;  // 手部模型（玩手机检测，初始化失败时为 null）
let isDetecting = false;
let showLandmarks = true;
let consented = localStorage.getItem(STORAGE_KEYS.CONSENT) === '1';

// 用户行为判定设置（每次进入设置页时刷新，检测循环中读取）
let behaviorSettings = loadSettings();

// 检测阈值（滑块覆盖 config 默认值，即时生效）
let thresholds = loadThresholds();
perclosDetector.threshold = thresholds.PERCLOS_THRESHOLD;

// 帧率控制
let lastDetectTime = 0;

// FPS 统计
let frameCount = 0;
let fpsLastTime = 0;

// 基线校准（第 11 章：前 3 秒采集静息 EAR）
let calibrationSamples = [];
let calibrationStartTime = 0;
let isCalibrating = false;
let baselineEar = null;
let effectiveEarThreshold = CONFIG.EAR_THRESHOLD; // 校准后自适应阈值

// 最新指标值（供控制台输出）
let latestMetrics = { ear: 0, pitch: 0, yaw: 0, faceRatio: 0 };

// M2：检测器触发状态（用于去重打印与画面提示）
const triggerState = {
  absence: false,
  eyeClosed: false,
  perclos: false,
  phoneUse: false,
  touchFace: false,
  handNearMouth: false,
  headDown: false,
  headTurn: false,
  tooClose: false,
  lookUp: false,
  stareScreen: false,
};

// M2：当前画面上显示的提示文字列表
let activeAlerts = [];

// M3：学习会话实例 + 疲劳持续追踪
const session = createSession();
let fatigueSince = null;      // FATIGUED 持续起点（30 秒温和提示用）
let fatigueTipShown = false;  // 本次疲劳周期是否已弹过提示
let lastSessionResult = null; // 最近一次会话结果（供教练引用）
let pendingRecord = null;       // 结束会话后待保存的记录（报告覆盖层展示中）
let pendingReportHandle = null; // 覆盖层报告实例（用于 dispose 释放图表）
let currentTrendDays = 7;       // 趋势图当前展示天数（7 / 30）

// ---- 独立计时器：与视觉检测帧解耦，保证视觉异常时计时依然正常 ----
let sessionTimerId = null;      // setInterval 句柄
let detectTimestamp = 0;        // MediaPipe VIDEO 模式要求时间戳严格递增
let detectErrorCount = 0;       // 连续检测异常次数
let lastDetectError = null;     // 最近一次检测异常信息（用于面板提示）
let visionHealthy = true;       // 视觉检测是否健康

// ---- M3：状态显示配置（第 13.2 节：颜色 + 图标 + 文字） ----
const STATE_DISPLAY = {
  FOCUS:      { cls: 'state-focus',      icon: '🎯', name: '专注中' },
  DISTRACTED: { cls: 'state-distracted', icon: '⚠️', name: '分心中' },
  FATIGUED:   { cls: 'state-fatigued',   icon: '😴', name: '疲劳中' },
  ABSENT:     { cls: 'state-absent',     icon: '🚶', name: '已离座' },
};

const REASON_TEXT = {
  default:        '正常学习',
  no_face:        '未检测到人脸',
  eye_closed:     '检测到闭眼',
  perclos:        '闭眼占比过高',
  stare_screen:   '长时间盯屏',
  phone_use:      '玩手机中',
  touch_face:     '触碰面部',
  hand_near_mouth:'手靠近嘴部',
  head_down:      '低头时间过长',
  head_turn:      '头部偏向一侧',
  too_close:      '距离屏幕过近',
  look_up:        '抬头仰视',
};

/** 格式化时长：不足 1 小时显示 MM:SS，超过显示 H:MM:SS */
function formatElapsed(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${String(m).padStart(2, '0')}:${ss}`;
}

/** 格式化时长为紧凑 M:SS（用于各状态累计时长） */
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 生成 UUID v4（第 9.2 章 schema 要求，兼容旧浏览器降级） */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---- 初始化 ----
function init() {
  bindEvents();
  // 初始化教练浮窗（回调提供当前会话摘要）
  initCoach(() => buildSessionSummary(lastSessionResult));
  // 初始化 hash 路由（含登录守卫）
  initRouter(handleRouteChange);
  console.log('[StudyMate] 应用已就绪');
}

// ---- 路由变化处理 ----
function handleRouteChange(route) {
  // 登录页：隐藏顶栏；其他页：显示
  const isLogin = route === '#/login';
  appHeader.classList.toggle('hidden', isLogin);
  if (isLogin) {
    closeSettings(); // 关闭设置侧滑
  }

  // 进入学习页：检查隐私同意
  if (route === '#/study' && !consented) {
    privacyOverlay.classList.remove('hidden');
  }

  // 进入主页：渲染问候语与激励语
  if (route === '#/home') {
    renderHomePage();
  }

  // 进入历史页：渲染历史列表与报告
  if (route === '#/history') {
    renderHistoryPage();
  }
}

// ---- 主页渲染 ----

/** 8 条激励语，随机一条 */
const MOTTOES = [
  '专注 25 分钟，休息 5 分钟，就是一次胜利',
  '每一次专注，都在靠近更好的自己',
  '不贪多，今天比昨天多专注 10 分钟就好',
  '学习不是冲刺，是节奏稳定的马拉松',
  '放下手机的那一刻，你就赢了一半',
  '疲劳不是软弱，是身体在提醒你休息',
  '把大目标拆小，小到不可能失败',
  '今天的学习，是明天的底气',
];

/** 获取时段问候语 */
function getGreeting() {
  const h = new Date().getHours();
  const user = getCurrentUser() || '同学';
  if (h >= 6 && h < 12) return `早上好，${user} 🌱`;
  if (h >= 12 && h < 18) return `下午好，${user} 🌱`;
  if (h >= 18 && h < 24) return `晚上好，${user} 🌱`;
  return `夜深了，${user} 🌱`;
}

/**
 * 通用打字机逐字显示
 * @param {HTMLElement} el 目标元素
 * @param {string} text 完整文本
 * @param {number} speed 每字间隔 ms
 * @param {Function} onComplete 完成回调
 */
function typewriter(el, text, speed, onComplete) {
  el.textContent = '';
  el.classList.add('typewriter-cursor');
  const chars = Array.from(text);
  let i = 0;
  const timer = setInterval(() => {
    i++;
    el.textContent = chars.slice(0, i).join('');
    if (i >= chars.length) {
      clearInterval(timer);
      // 光标闪烁 2 秒后移除
      setTimeout(() => el.classList.remove('typewriter-cursor'), 2000);
      if (onComplete) onComplete();
    }
  }, speed);
}

/** 渲染主页：问候语打字机 + 日期星期 + 激励语打字机（接力） */
function renderHomePage() {
  // 今日日期 + 星期（立即显示，无需打字机）
  const now = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  homeDate.textContent = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${weekDays[now.getDay()]}`;

  // 问候语打字机 → 完成后接力显示激励语打字机
  const motto = MOTTOES[Math.floor(Math.random() * MOTTOES.length)];
  typewriter(homeGreeting, getGreeting(), 80, () => {
    typewriter(homeMotto, motto, 50);
  });
}

// ---- 历史页渲染 ----

// 演示数据注入标记（内存态，不写入 localStorage，避免污染真实会话数据）
let demoInjected = false;

/**
 * 注入演示数据（FR-10）：内存合并 3 组演示会话，重新渲染历史页
 * 演示会话不落盘，刷新后消失；再次点击可重复注入
 */
function injectDemoData() {
  demoInjected = true;
  console.log('[StudyMate] 已注入 3 组演示会话（专注型 / 疲劳型 / 分心型）');
  renderHistoryPage();
}

/** 渲染历史页：统计卡 + 趋势图 + 记录列表 */
function renderHistoryPage() {
  const records = getAllRecords();
  renderStatCards(records);
  renderTrendChart(trendChart, records, currentTrendDays);
  historyList.innerHTML = '';
  if (records.length === 0) {
    reportEmpty.classList.remove('hidden');
    return;
  }
  reportEmpty.classList.add('hidden');
  const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
  sorted.forEach((record) => historyList.appendChild(createHistoryItem(record)));
}

/** 渲染顶部三张统计卡（累计天数 / 累计时长 / 平均专注占比） */
function renderStatCards(records) {
  const totalDays = new Set(records.map((r) => r.date.slice(0, 10))).size;
  const totalDuration = records.reduce((s, r) => s + r.durationSec, 0);
  const focusSum = records.reduce((s, r) => s + r.focusSec, 0);
  const avgFocus = totalDuration > 0 ? focusSum / totalDuration : 0;
  statTotalDays.textContent = String(totalDays);
  statTotalDuration.textContent = formatStatDuration(totalDuration);
  statAvgFocus.textContent = Math.round(avgFocus * 100) + '%';
}

/** 秒数 → 中文时长（如 "2 小时 15 分"） */
function formatStatDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h > 0) return m > 0 ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
  return m + ' 分钟';
}

/** 创建历史记录列表项（懒加载报告 + 两步删除确认） */
function createHistoryItem(record) {
  const item = document.createElement('div');
  item.className = 'history-item';
  const d = new Date(record.date);
  const dateText = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const timeText = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  const min = Math.max(1, Math.round(record.durationSec / 60));
  const focusPct = record.durationSec > 0 ? Math.round((record.focusSec / record.durationSec) * 100) : 0;
  const fatigueTxt = record.fatigueCount > 0 ? '疲劳 ' + record.fatigueCount + ' 次' : '无疲劳预警';
  item.innerHTML =
    '<div class="history-item-summary">' +
    '<span class="history-item-date">' + dateText + ' ' + timeText + '</span>' +
    '<span class="history-item-duration">' + min + ' 分</span>' +
    '<div class="history-item-focus">' +
    '<div class="history-focus-bar"><div class="history-focus-fill" style="width:' + focusPct + '%"></div></div>' +
    '<span class="history-focus-pct">' + focusPct + '%</span>' +
    '</div>' +
    '<span class="history-item-meta">' + fatigueTxt + '</span>' +
    '<span class="history-item-toggle">▶</span>' +
    '<button class="history-item-delete" title="删除记录">×</button>' +
    '</div>' +
    '<div class="history-item-expand hidden"></div>';
  const summary = item.querySelector('.history-item-summary');
  const expand = item.querySelector('.history-item-expand');
  const deleteBtn = item.querySelector('.history-item-delete');
  let reportHandle = null;
  let confirmTimer = null;
  // 点击摘要行展开/收起（懒加载：首次展开才渲染报告图表）
  summary.addEventListener('click', (e) => {
    if (e.target === deleteBtn || deleteBtn.contains(e.target)) return;
    if (!expand.classList.contains('hidden')) {
      expand.classList.add('hidden');
      item.classList.remove('expanded');
    } else {
      if (!reportHandle) reportHandle = renderReportInto(expand, record);
      expand.classList.remove('hidden');
      item.classList.add('expanded');
    }
  });
  // 删除按钮：两步确认（3 秒超时自动取消）
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!deleteBtn.classList.contains('confirming')) {
      deleteBtn.classList.add('confirming');
      deleteBtn.textContent = '确认删除？';
      confirmTimer = setTimeout(() => {
        deleteBtn.classList.remove('confirming');
        deleteBtn.textContent = '×';
      }, 3000);
      return;
    }
    clearTimeout(confirmTimer);
    if (reportHandle && reportHandle.dispose) reportHandle.dispose();
    deleteRecord(getCurrentUser(), record.id);
    renderHistoryPage();
  });
  return item;
}

// ---- 设置侧滑面板 ----
function openSettings() {
  renderSettingsPage();
  renderThresholdSliders();
  settingsBackdrop.classList.remove('hidden');
  settingsDrawer.classList.remove('hidden');
}
function closeSettings() {
  settingsBackdrop.classList.add('hidden');
  settingsDrawer.classList.add('hidden');
}

// ---- 设置页渲染与事件 ----
const CATEGORY_LABELS = { distracted: '分心', fatigued: '疲劳', none: '不检测' };

/** 渲染行为表格 */
function renderSettingsPage() {
  if (!behaviorTableBody) return;
  behaviorTableBody.innerHTML = '';
  for (const def of BEHAVIOR_DEFINITIONS) {
    const category = behaviorSettings[def.key] || def.defaultCategory;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${def.label}</td>
      <td class="detect-method">${def.detect}</td>
      <td>
        <select class="behavior-select" data-key="${def.key}">
          <option value="distracted" ${category === 'distracted' ? 'selected' : ''}>分心</option>
          <option value="fatigued" ${category === 'fatigued' ? 'selected' : ''}>疲劳</option>
          <option value="none" ${category === 'none' ? 'selected' : ''}>不检测</option>
        </select>
      </td>
    `;
    behaviorTableBody.appendChild(tr);
  }
  // 绑定 select 变更事件
  behaviorTableBody.querySelectorAll('.behavior-select').forEach((sel) => {
    sel.addEventListener('change', (e) => {
      const key = e.target.dataset.key;
      behaviorSettings[key] = e.target.value;
      saveSettings(behaviorSettings);
      console.log(`[StudyMate] 行为设置已更新：${key} → ${CATEGORY_LABELS[e.target.value]}`);
    });
  });
}

/** 渲染阈值滑块 */
function renderThresholdSliders() {
  if (!thresholdSliders) return;
  const thresholds = loadThresholds();
  thresholdSliders.innerHTML = '';
  for (const def of THRESHOLD_DEFINITIONS) {
    const wrap = document.createElement('div');
    wrap.className = 'threshold-slider';
    wrap.innerHTML = `
      <div class="threshold-slider-header">
        <span class="threshold-slider-label">${def.label}</span>
        <span class="threshold-slider-value" id="tsv-${def.key}">${def.format(thresholds[def.key])}</span>
      </div>
      <p class="threshold-slider-desc">${def.desc}</p>
      <input type="range" id="ts-${def.key}" min="${def.min}" max="${def.max}" step="${def.step}" value="${thresholds[def.key]}" />
    `;
    thresholdSliders.appendChild(wrap);
    const input = wrap.querySelector('input');
    const valueEl = wrap.querySelector(`#tsv-${def.key}`);
    input.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      valueEl.textContent = def.format(v);
      thresholds[def.key] = v;
      saveThresholds(thresholds);
      applyThresholds(thresholds);
    });
  }
}

/** 应用阈值到运行时变量（即时生效） */
function applyThresholds(thresholds) {
  if (thresholds.EAR_THRESHOLD !== undefined) {
    effectiveEarThreshold = thresholds.EAR_THRESHOLD;
  }
  if (thresholds.PITCH_THRESHOLD !== undefined) {
    CONFIG.PITCH_THRESHOLD = thresholds.PITCH_THRESHOLD;
  }
  if (thresholds.PERCLOS_THRESHOLD !== undefined) {
    CONFIG.PERCLOS_THRESHOLD = thresholds.PERCLOS_THRESHOLD;
    // 更新 PERCLOS 检测器的内部阈值
    perclosDetector.threshold = thresholds.PERCLOS_THRESHOLD;
  }
}

function bindEvents() {
  consentBtn.addEventListener('click', handleConsent);
  startCameraBtn.addEventListener('click', handleStartCamera);
  stopCameraBtn.addEventListener('click', handleStopCamera);
  retryBtn.addEventListener('click', () => {
    errorOverlay.hidden = true;
    handleStartCamera();
  });
  landmarkToggle.addEventListener('change', (e) => {
    showLandmarks = e.target.checked;
    if (!showLandmarks) clearCanvas();
  });
  // 会话控制（FR-05）
  sessionStartBtn.addEventListener('click', handleSessionStart);
  sessionPauseBtn.addEventListener('click', handleSessionPause);
  sessionStopBtn.addEventListener('click', () => handleSessionStop());
  // 疲劳温和提示点击关闭
  fatigueTip.addEventListener('click', () => {
    fatigueTip.hidden = true;
  });

  // ---- 登录页事件 ----
  authForm.addEventListener('submit', handleAuthSubmit);
  switchAuthMode.addEventListener('click', toggleAuthMode);
  guestDemoBtn.addEventListener('click', handleGuestDemo);

  // ---- 设置侧滑面板事件 ----
  settingsBtn.addEventListener('click', openSettings);
  settingsCloseBtn.addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', closeSettings);
  resetSettingsBtn.addEventListener('click', () => {
    behaviorSettings = resetSettings();
    renderSettingsPage();
    console.log('[StudyMate] 行为设置已恢复默认');
  });
  resetThresholdsBtn.addEventListener('click', () => {
    const defaults = resetThresholds();
    applyThresholds(defaults);
    renderThresholdSliders();
    console.log('[StudyMate] 检测阈值已恢复默认');
  });
  exportDataBtn.addEventListener('click', () => {
    exportMyData();
    console.log('[StudyMate] 数据已导出');
  });
  // 清空数据：二次确认（两步点击式，3 秒内不确认则自动取消）
  let clearConfirmTimer = null;
  clearDataBtn.addEventListener('click', () => {
    if (clearDataBtn.dataset.confirming === '1') {
      // 第二次点击：确认清空
      clearTimeout(clearConfirmTimer);
      clearDataBtn.dataset.confirming = '';
      clearAllData(getCurrentUser());
      demoInjected = false;
      console.log('[StudyMate] 本地数据已清空');
      clearDataBtn.textContent = '已清空';
      clearDataBtn.disabled = true;
      setTimeout(() => { clearDataBtn.textContent = '清空数据'; clearDataBtn.disabled = false; }, 2000);
    } else {
      // 第一次点击：进入确认状态
      clearDataBtn.dataset.confirming = '1';
      clearDataBtn.textContent = '确认清空？';
      clearConfirmTimer = setTimeout(() => {
        clearDataBtn.dataset.confirming = '';
        clearDataBtn.textContent = '清空数据';
      }, 3000);
    }
  });
  logoutBtn.addEventListener('click', handleLogout);
  // ---- 学习页顶部返回 + 报告覆盖层动作 ----
  studyBackBtn.addEventListener('click', () => navigate('#/home'));
  saveRecordBtn.addEventListener('click', () => {
    if (pendingRecord) {
      saveRecord(getCurrentUser(), pendingRecord);
      console.log('[StudyMate] 报告已保存到往期记录');
    }
    hideStudyReportOverlay();
    navigate('#/history');
  });
  discardRecordBtn.addEventListener('click', () => {
    hideStudyReportOverlay();
  });
  // ---- 历史页趋势图 7/30 天切换 ----
  document.querySelectorAll('.trend-range-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTrendDays = Number(btn.dataset.days) || 7;
      document.querySelectorAll('.trend-range-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderTrendChart(trendChart, getAllRecords(), currentTrendDays);
    });
  });

  // ---- 主页事件 ----
  startLearningBtn.addEventListener('click', () => navigate('#/study'));
  actionHistory.addEventListener('click', () => navigate('#/history'));

  // ---- 历史页事件 ----
  emptyStartBtn.addEventListener('click', () => navigate('#/study'));
  demoDataBtn.addEventListener('click', injectDemoData);
  window.addEventListener('resize', resizeCharts);
}

// ---- 登录/注册/游客 ----

/** 登录/注册表单提交 */
async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = authUsername.value;
  const password = authPassword.value;
  authError.textContent = '';
  authSubmitBtn.disabled = true;
  authSubmitBtn.textContent = '请稍候...';

  const result = isRegisterMode
    ? await register(username, password)
    : await login(username, password);

  authSubmitBtn.disabled = false;
  authSubmitBtn.textContent = isRegisterMode ? '注册' : '登录';

  if (result.ok) {
    navigate('#/home');
  } else {
    authError.textContent = result.message;
  }
}

/** 切换登录/注册模式 */
function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  authSubmitBtn.textContent = isRegisterMode ? '注册' : '登录';
  // 直接更新文本节点，不替换 DOM 元素（保留 bindEvents 中的事件绑定）
  const switchLabel = document.querySelector('.login-switch');
  switchLabel.firstChild.textContent = isRegisterMode ? '已有账号？' : '没有账号？';
  switchAuthMode.textContent = isRegisterMode ? '登录' : '注册';
  authError.textContent = '';
}

/** 游客演示 */
async function handleGuestDemo() {
  guestDemoBtn.disabled = true;
  const result = await guestDemo();
  guestDemoBtn.disabled = false;
  if (result.ok) {
    navigate('#/home');
  }
}

/** 登出 */
function handleLogout() {
  // 结束进行中的会话与摄像头
  if (session.isRunning()) handleSessionStop(false);
  if (isDetecting) handleStopCamera();
  clearChatHistory();
  closeSettings();
  logout();
  navigate('#/login');
}

// ---- 隐私同意（FR-01：未同意时无法开启摄像头） ----
function handleConsent() {
  consented = true;
  localStorage.setItem(STORAGE_KEYS.CONSENT, '1');
  privacyOverlay.classList.add('hidden');
}

// ---- 开启摄像头 ----
async function handleStartCamera() {
  if (!consented) {
    showError('请先阅读并同意隐私说明，然后再次点击"开启摄像头"。');
    return;
  }

  try {
    // 隐藏错误、显示加载
    errorOverlay.hidden = true;
    setLoading(true, '正在开启摄像头...');

    // 1. 先初始化视觉模型（仅首次加载），避免摄像头已开但模型未好
    if (!landmarker) {
      setLoading(true, '正在加载视觉模型，首次加载约需数秒...');
      try {
        landmarker = await initVision();
      } catch (err) {
        setLoading(false);
        // 提取尽可能详细的错误信息（ErrorEvent / Error / 字符串 / 其他对象）
        let detail = '';
        try {
          detail = JSON.stringify(err, Object.getOwnPropertyNames(err));
        } catch {
          detail = String(err);
        }
        console.error('[StudyMate] initVision 异常详情:', err);
        showError('视觉模型加载失败：' + detail + '。请检查网络连接（需访问 jsdelivr CDN 与 Google Storage），或刷新页面重试。');
        return;
      }
    }

    // 1.5 初始化手部模型（玩手机检测，失败不阻塞主流程）
    if (!handLandmarker) {
      try {
        handLandmarker = await initHandVision();
      } catch {
        handLandmarker = null;
      }
    }

    // 2. 开启摄像头
    try {
      mediaStream = await startCamera(video);
    } catch (err) {
      setLoading(false);
      const msg = err?.message || '摄像头开启失败，请检查设备与权限。';
      showError(msg);
      return;
    }

    // 3. 设置画布与视频同分辨率
    canvas.width = CONFIG.VIDEO_WIDTH;
    canvas.height = CONFIG.VIDEO_HEIGHT;

    // 4. 启动基线校准
    startCalibration();

    // 5. 更新 UI
    setLoading(false);
    videoPlaceholder.classList.add('hidden');
    localIndicator.classList.add('active');
    startCameraBtn.disabled = true;
    stopCameraBtn.disabled = false;
    sessionStartBtn.disabled = false; // M3：摄像头就绪后方可开始学习

    // 6. 启动检测循环
    isDetecting = true;
    fpsLastTime = performance.now();
    detectTimestamp = 0;
    detectErrorCount = 0;
    lastDetectError = null;
    visionHealthy = true;
    startSessionTimer();
    requestAnimationFrame(detectLoop);
  } catch (err) {
    setLoading(false);
    const msg = err?.message || '摄像头开启失败，请检查设备与权限。';
    showError(msg);
  }
}

// ---- 关闭摄像头 ----
function handleStopCamera() {
  // M3：关闭摄像头时自动结束进行中的会话（无摄像头则无法监测状态）
  if (session.isRunning()) {
    handleSessionStop();
  }
  isDetecting = false;
  stopSessionTimer();
  if (mediaStream) {
    stopCamera(mediaStream);
    mediaStream = null;
  }
  video.srcObject = null;
  clearCanvas();
  videoPlaceholder.classList.remove('hidden');
  localIndicator.classList.remove('active');
  startCameraBtn.disabled = false;
  stopCameraBtn.disabled = true;
  sessionStartBtn.disabled = true;
  resetDisplay();
}

// ---- M3：会话控制（FR-05） ----
function handleSessionStart() {
  if (!isDetecting) {
    showError('请先开启摄像头，再开始学习计时。');
    return;
  }
  session.start();
  resetStateMachine();
  fatigueSince = null;
  fatigueTipShown = false;
  fatigueTip.hidden = true;
  sessionStartBtn.disabled = true;
  sessionPauseBtn.disabled = false;
  sessionStopBtn.disabled = false;
  sessionPauseBtn.textContent = '暂停';
  console.log('[StudyMate] 学习会话已开始');
}

function handleSessionPause() {
  if (!session.isRunning()) return;
  if (session.isPaused()) {
    session.resume();
    sessionPauseBtn.textContent = '暂停';
    console.log('[StudyMate] 会话已恢复');
  } else {
    session.pause();
    sessionPauseBtn.textContent = '继续';
    console.log('[StudyMate] 会话已暂停（检测继续，时长不计入）');
  }
}

/** 结束学习会话：停止检测 → 重置面板 → 展示报告覆盖层 */
/** 显示学习报告覆盖层：结束后先展示，由用户决定保存与否 */
function showStudyReportOverlay(sessionResult) {
  pendingRecord = sessionToRecord(sessionResult);
  pendingReportHandle = renderReportInto(studyReportBody, pendingRecord);
  studyReportOverlay.classList.remove('hidden');
}

/** 关闭报告覆盖层并释放图表实例 */
function hideStudyReportOverlay() {
  studyReportOverlay.classList.add('hidden');
  if (pendingReportHandle && pendingReportHandle.dispose) {
    pendingReportHandle.dispose();
  }
  pendingReportHandle = null;
  studyReportBody.innerHTML = '';
  pendingRecord = null;
}

function handleSessionStop(showReport = true) {
  if (!session.isRunning()) return;
  const result = session.stop();
  resetStateMachine();
  fatigueSince = null;
  fatigueTipShown = false;
  fatigueTip.hidden = true;
  sessionStartBtn.disabled = false;
  sessionPauseBtn.disabled = true;
  sessionStopBtn.disabled = true;
  sessionPauseBtn.textContent = '暂停';
  resetSessionDisplay();
  if (result) {
    lastSessionResult = result; // 供教练引用最新会话数据
    console.log(
      '[StudyMate] 学习会话已结束：时长 ' + formatElapsed(result.totalMs) +
      '，事件 ' + result.events.length + ' 条'
    );
    if (showReport) showStudyReportOverlay(result);
  }
}

// ---- M3：状态徽章 + 计时面板更新 ----
function updateStateBadge(smResult) {
  const disp = STATE_DISPLAY[smResult.state] || STATE_DISPLAY.FOCUS;
  stateBadge.className = `state-badge ${disp.cls}`;
  stateIcon.textContent = disp.icon;
  stateName.textContent = disp.name;
  stateReason.textContent = REASON_TEXT[smResult.reason] || smResult.reason;

  // 状态切换 200ms 动画（第 13.3 节）
  if (smResult.changed) {
    stateBadge.classList.remove('badge-changed');
    void stateBadge.offsetWidth; // 触发重绘以重启动画
    stateBadge.classList.add('badge-changed');
  }
}

function updateSessionTimers() {
  if (!session.isRunning()) return;
  elapsedTime.textContent = formatElapsed(session.getElapsedMs());
  focusStreakTime.textContent = formatElapsed(session.getFocusStreakMs());

  // 各状态累计时长 + 占比条
  const durations = session.getStateDurations();
  const total = Object.values(durations).reduce((a, b) => a + b, 0) || 1;
  const entries = [
    { bar: durFocus,      time: durFocusTime,      ms: durations.FOCUS },
    { bar: durDistracted, time: durDistractedTime, ms: durations.DISTRACTED },
    { bar: durFatigued,   time: durFatiguedTime,   ms: durations.FATIGUED },
    { bar: durAbsent,     time: durAbsentTime,     ms: durations.ABSENT },
  ];
  for (const e of entries) {
    e.bar.style.width = `${Math.round((e.ms / total) * 100)}%`;
    e.time.textContent = formatDuration(e.ms);
  }
}

/**
 * 启动独立计时器（每 250ms 刷新一次）
 * 与视觉检测帧完全解耦：即使视觉模型出错，学习计时也不会停。
 */
function startSessionTimer() {
  if (sessionTimerId !== null) return;
  sessionTimerId = setInterval(() => {
    try {
      if (!session.isRunning()) return;
      // 状态时长累计：使用状态机当前状态（视觉异常时保持上一次状态）
      if (!session.isPaused()) {
        session.tick(getState().state);
      }
      updateSessionTimers();
    } catch (err) {
      console.error('[StudyMate] 计时器异常：', err);
    }
  }, 250);
}

/** 停止独立计时器 */
function stopSessionTimer() {
  if (sessionTimerId !== null) {
    clearInterval(sessionTimerId);
    sessionTimerId = null;
  }
}

/** 疲劳持续 30 秒弹出一次温和提示（第 13.3 节，可关闭、不重复弹） */
function updateFatigueTip(state, now) {
  if (state === STATES.FATIGUED) {
    if (fatigueSince === null) {
      fatigueSince = now;
      fatigueTipShown = false;
    }
    if (!fatigueTipShown && now - fatigueSince >= 30000) {
      fatigueTip.hidden = false;
      fatigueTipShown = true;
      console.log('[StudyMate] 疲劳持续 30 秒，已弹出温和提示');
    }
  } else {
    // 离开疲劳状态：隐藏提示并重置，下次疲劳可再次提醒
    fatigueSince = null;
    fatigueTipShown = false;
    fatigueTip.hidden = true;
  }
}

function resetSessionDisplay() {
  elapsedTime.textContent = '00:00';
  focusStreakTime.textContent = '00:00';
  const resetEntries = [
    { bar: durFocus,      time: durFocusTime },
    { bar: durDistracted, time: durDistractedTime },
    { bar: durFatigued,   time: durFatiguedTime },
    { bar: durAbsent,     time: durAbsentTime },
  ];
  for (const e of resetEntries) {
    e.bar.style.width = '0%';
    e.time.textContent = '0:00';
  }
}

// ---- 基线校准 ----
function startCalibration() {
  isCalibrating = true;
  calibrationSamples = [];
  calibrationStartTime = performance.now();
  baselineEar = null;
  effectiveEarThreshold = CONFIG.EAR_THRESHOLD;
  calibStatus.textContent = '校准中...';
  calibStatus.className = 'metric-value metric-status';
}

function updateCalibration(ear, now) {
  if (!isCalibrating) return;
  calibrationSamples.push(ear);
  const elapsed = (now - calibrationStartTime) / 1000;
  if (elapsed >= CONFIG.CALIBRATION_SEC) {
    // 计算静息 EAR 均值，生成自适应阈值
    const sum = calibrationSamples.reduce((a, b) => a + b, 0);
    baselineEar = sum / calibrationSamples.length;
    effectiveEarThreshold = Math.max(0.15, baselineEar * CONFIG.EAR_BASELINE_RATIO);
    isCalibrating = false;
    calibStatus.textContent = '已完成';
    calibStatus.className = 'metric-value metric-status ok';
    console.log(
      `[StudyMate] 基线校准完成：baselineEar=${baselineEar.toFixed(3)}, ` +
      `自适应阈值=${effectiveEarThreshold.toFixed(3)}（默认 ${CONFIG.EAR_THRESHOLD}）`
    );
  }
}

// ---- 检测循环（帧率限制在 TARGET_FPS） ----
function detectLoop(now) {
  if (!isDetecting) return;

  const minInterval = 1000 / CONFIG.TARGET_FPS;
  if (now - lastDetectTime < minInterval) {
    requestAnimationFrame(detectLoop);
    return;
  }
  lastDetectTime = now;

  if (video.readyState >= 2 && landmarker) {
    try {
      // MediaPipe VIDEO 模式要求时间戳严格递增
      detectTimestamp = Math.max(detectTimestamp + 1, Math.round(now));
      const result = detectFrame(landmarker, video, detectTimestamp);

      // M2：六个检测器每帧调用
      updateDetectors(result, now);

      // 每帧清空画布，再按层级绘制（关键点 → 提示文字）
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (showLandmarks) {
        drawLandmarks(result.landmarks, result.faceDetected);
      }
      drawAlerts();

      // FPS 统计 & 控制台输出（每秒一次，M1 验收标志）
      frameCount++;
      if (now - fpsLastTime >= 1000) {
        const fps = frameCount;
        frameCount = 0;
        fpsLastTime = now;
        fpsDisplay.textContent = `FPS: ${fps}`;
        visionHealthy = true;

        if (result.faceDetected) {
          const m = latestMetrics;
          console.log(
            `[StudyMate] EAR: ${m.ear.toFixed(3)} | ` +
              `pitch: ${m.pitch.toFixed(1)}° | yaw: ${m.yaw.toFixed(1)}° | ` +
              `faceRatio: ${m.faceRatio.toFixed(3)} | fps: ${fps}`
          );
        }
      }
    } catch (err) {
      // 单帧异常不得中断整条 rAF 链，否则 FPS/绿点/状态会同时静止
      detectErrorCount++;
      lastDetectError = err;
      visionHealthy = false;
      console.error('[StudyMate] 检测循环异常：', err);
      fpsDisplay.textContent = `FPS: ERR(${detectErrorCount})`;
      // 仅首次弹出错误覆盖层，避免每帧重复遮挡界面
      if (detectErrorCount === 1) {
        showError(
          '视觉检测异常（已自动重试）：' +
            (err && err.message ? err.message : String(err))
        );
      }
    } finally {
      requestAnimationFrame(detectLoop);
    }
    return;
  }

  requestAnimationFrame(detectLoop);
}

// ---- 关键点绘制：478 绿点 + 眼部蓝色高亮 ----
// 注意：画布清空由 detectLoop 每帧统一负责，此处只负责绘制
function drawLandmarks(landmarks, faceDetected) {
  if (!faceDetected || !landmarks) return;

  // 全部关键点：绿色小圆点
  ctx.fillStyle = '#22C55E';
  for (const pt of landmarks) {
    const x = pt.x * canvas.width;
    const y = pt.y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // 眼部六点×2：蓝色大圆点，便于观察 EAR 变化
  ctx.fillStyle = '#60A5FA';
  for (const idx of EYE_LANDMARK_INDICES) {
    const pt = landmarks[idx];
    if (!pt) continue;
    const x = pt.x * canvas.width;
    const y = pt.y * canvas.height;
    ctx.beginPath();
    ctx.arc(x, y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// ---- M2：六个检测器每帧更新 ----
function updateDetectors(result, now) {
  const faceDetected = result.faceDetected;

  // 计算指标（有人脸时才计算，否则用默认值）
  let ear = 0, pitch = 0, yaw = 0, faceRatio = 0;
  let eyeClosed = false, headDown = false, headTurn = false, tooClose = false;
  let lookUp = false;

  if (faceDetected) {
    ear = calcEAR(result.landmarks);
    // 优先用变换矩阵法（第 10.3 章推荐，精度高），矩阵缺失时回退到关键点法向量法
    const poseFromMatrix = calcHeadPoseFromMatrix(result.transformMatrix);
    if (poseFromMatrix) {
      ({ pitch, yaw } = poseFromMatrix);
    } else {
      ({ pitch, yaw } = calcHeadPose(result.landmarks));
    }
    faceRatio = calcFaceRatio(result.landmarks);

    eyeClosed = ear < effectiveEarThreshold;
    headDown = pitch > CONFIG.PITCH_THRESHOLD;
    headTurn = Math.abs(yaw) > CONFIG.YAW_THRESHOLD;
    tooClose = faceRatio > CONFIG.FACE_RATIO_THRESHOLD;
    lookUp = pitch < CONFIG.LOOK_UP_THRESHOLD; // 抬头仰视（负 pitch）

    latestMetrics = { ear, pitch, yaw, faceRatio };

    // 基线校准采集
    updateCalibration(ear, now);

    // 更新界面
    updateMetricsDisplay(ear, pitch, yaw, faceRatio);
    faceStatus.textContent = '已检测到人脸';
    faceStatus.className = 'face-status detected';
  } else {
    faceStatus.textContent = '未检测到人脸';
    faceStatus.className = 'face-status not-detected';
  }

  // 手部检测：玩手机 / 触碰面部 / 手靠近嘴部
  let phoneUse = false, touchFace = false, handNearMouth = false;
  if (faceDetected && result.landmarks) {
    const hands = detectHands(handLandmarker, video, now);
    if (hands.length > 0) {
      const chinY = result.landmarks[152].y;   // 下巴 y
      const mouthPt = result.landmarks[13];     // 嘴部中心关键点
      const faceBox = calcFaceBoundingBox(result.landmarks);
      const m = CONFIG.TOUCH_FACE_MARGIN;
      // 手部关键索引：指尖（拇指4/食指8/中指12/无名指16/小指20）+ 手腕0
      const handKeyIndices = [0, 4, 8, 12, 16, 20];

      for (const hand of hands) {
        // 手掌中心 y（玩手机判定用）
        const palmIndices = [0, 5, 9, 13, 17];
        let palmY = 0;
        for (const i of palmIndices) palmY += hand[i].y;
        palmY /= palmIndices.length;
        if (palmY > chinY && palmY < CONFIG.PHONE_HAND_Y_MAX) {
          phoneUse = true;
        }
        // 触碰面部：指尖在面部包围盒（外扩 margin）内
        for (const i of handKeyIndices) {
          const pt = hand[i];
          if (pt.x > faceBox.minX - m && pt.x < faceBox.maxX + m &&
              pt.y > faceBox.minY - m && pt.y < faceBox.maxY + m) {
            touchFace = true;
            // 手靠近嘴部：指尖到嘴部距离小于阈值
            if (mouthPt) {
              const dist = Math.hypot(pt.x - mouthPt.x, pt.y - mouthPt.y);
              if (dist < CONFIG.MOUTH_DIST_THRESHOLD) {
                handNearMouth = true;
              }
            }
          }
        }
      }
    }
    // 调试面板：手部判定状态
    if (phoneStatus) {
      if (handNearMouth) {
        phoneStatus.textContent = '手靠近嘴部';
        phoneStatus.className = 'metric-value metric-status alert';
      } else if (touchFace) {
        phoneStatus.textContent = '触碰面部';
        phoneStatus.className = 'metric-value metric-status alert';
      } else if (phoneUse) {
        phoneStatus.textContent = '玩手机';
        phoneStatus.className = 'metric-value metric-status alert';
      } else if (hands.length > 0) {
        phoneStatus.textContent = '手部正常';
        phoneStatus.className = 'metric-value metric-status ok';
      } else {
        phoneStatus.textContent = '未检测到手';
        phoneStatus.className = 'metric-value metric-status';
      }
    }
  } else {
    if (phoneStatus) {
      phoneStatus.textContent = '--';
      phoneStatus.className = 'metric-value metric-status';
    }
  }

  // 更新全部检测器（键名与 BEHAVIOR_DEFINITIONS 的 key 一致）
  const absenceTriggered = absenceDetector.update(!faceDetected, now);
  const eyeClosedTriggered = eyeClosedDetector.update(eyeClosed, now);
  const perclosTriggered = perclosDetector.update(eyeClosed, now);
  const stareTriggered = stareDetector.update(faceDetected && !eyeClosed, now); // 持续睁眼无眨眼
  const phoneUseTriggered = phoneDetector.update(phoneUse, now);
  const touchFaceTriggered = touchFaceDetector.update(touchFace, now);
  const handNearMouthTriggered = handNearMouthDetector.update(handNearMouth, now);
  const headDownTriggered = headDownDetector.update(headDown, now);
  const headTurnTriggered = headTurnDetector.update(headTurn, now);
  const tooCloseTriggered = tooCloseDetector.update(tooClose, now);
  const lookUpTriggered = lookUpDetector.update(lookUp, now);

  // 收集当前所有触发的提示（仅显示用户启用的行为）
  activeAlerts = [];
  if (absenceTriggered) activeAlerts.push('离座');
  if (eyeClosedTriggered && behaviorSettings.eye_closed !== 'none') activeAlerts.push('闭眼');
  if (perclosTriggered && behaviorSettings.perclos !== 'none') activeAlerts.push('PERCLOS 疲劳');
  if (stareTriggered && behaviorSettings.stare_screen !== 'none') activeAlerts.push('长时间盯屏');
  if (phoneUseTriggered && behaviorSettings.phone_use !== 'none') activeAlerts.push('📱 玩手机');
  if (touchFaceTriggered && behaviorSettings.touch_face !== 'none') activeAlerts.push('✋ 触碰面部');
  if (handNearMouthTriggered && behaviorSettings.hand_near_mouth !== 'none') activeAlerts.push('🥤 手靠近嘴部');
  if (headDownTriggered && behaviorSettings.head_down !== 'none') activeAlerts.push('低头');
  if (headTurnTriggered && behaviorSettings.head_turn !== 'none') activeAlerts.push('转头');
  if (tooCloseTriggered && behaviorSettings.too_close !== 'none') activeAlerts.push('距离过近');
  if (lookUpTriggered && behaviorSettings.look_up !== 'none') activeAlerts.push('抬头仰视');

  // 去重打印：只在状态从 false → true 时输出控制台
  checkAndLogTrigger('absence', absenceTriggered, '离座');
  checkAndLogTrigger('eyeClosed', eyeClosedTriggered, '闭眼');
  checkAndLogTrigger('perclos', perclosTriggered, 'PERCLOS 疲劳');
  checkAndLogTrigger('stareScreen', stareTriggered, '长时间盯屏');
  checkAndLogTrigger('phoneUse', phoneUseTriggered, '📱 玩手机');
  checkAndLogTrigger('touchFace', touchFaceTriggered, '✋ 触碰面部');
  checkAndLogTrigger('handNearMouth', handNearMouthTriggered, '🥤 手靠近嘴部');
  checkAndLogTrigger('headDown', headDownTriggered, '低头');
  checkAndLogTrigger('headTurn', headTurnTriggered, '转头');
  checkAndLogTrigger('tooClose', tooCloseTriggered, '距离过近');
  checkAndLogTrigger('lookUp', lookUpTriggered, '抬头仰视');

  // 状态机融合：按用户行为设置动态归类 + 滞回
  const smResult = updateStateMachine({
    absence: absenceTriggered,
    eye_closed: eyeClosedTriggered,
    perclos: perclosTriggered,
    stare_screen: stareTriggered,
    phone_use: phoneUseTriggered,
    touch_face: touchFaceTriggered,
    hand_near_mouth: handNearMouthTriggered,
    head_down: headDownTriggered,
    head_turn: headTurnTriggered,
    too_close: tooCloseTriggered,
    look_up: lookUpTriggered,
  }, now, behaviorSettings);

  // 状态变化时记录事件（FR-04，暂停时不计入）
  if (smResult.changed) {
    console.log(`[StudyMate] 状态切换 → ${smResult.state}（原因：${smResult.reason}）`);
    if (session.isRunning() && !session.isPaused()) {
      session.addEvent({
        ts: Date.now(),
        state: smResult.state,
        reason: smResult.reason,
        metrics: { ...latestMetrics },
      });
    }
  }

  // 会话状态时长累计由独立计时器（startSessionTimer）负责，
  // 此处不再 tick，避免与定时器重复累计导致状态占比失真。

  // 更新状态徽章 + 疲劳提示 + 计时面板
  updateStateBadge(smResult);
  updateFatigueTip(smResult.state, now);
  updateSessionTimers();
}

/** 检测器触发去重日志 */
function checkAndLogTrigger(key, triggered, label) {
  if (triggered && !triggerState[key]) {
    console.log(`[StudyMate] 检测器触发：${label}`);
    triggerState[key] = true;
  } else if (!triggered && triggerState[key]) {
    console.log(`[StudyMate] 检测器恢复：${label}`);
    triggerState[key] = false;
  }
}

/** 在 canvas 上绘制当前触发的提示文字 */
function drawAlerts() {
  if (activeAlerts.length === 0) return;

  ctx.save();
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const cx = canvas.width / 2;
  const startY = canvas.height * 0.25;
  const lineHeight = 32;

  for (let i = 0; i < activeAlerts.length; i++) {
    const text = activeAlerts[i];
    const y = startY + i * lineHeight;

    // 文字阴影背景（半透明黑底）
    const metrics = ctx.measureText(text);
    const pad = 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(
      cx - metrics.width / 2 - pad,
      y - lineHeight / 2,
      metrics.width + pad * 2,
      lineHeight
    );

    // 文字（黄色醒目）
    ctx.fillStyle = '#FACC15';
    ctx.fillText(text, cx, y);
  }

  ctx.restore();
}

// ---- 指标面板更新 ----
function updateMetricsDisplay(ear, pitch, yaw, faceRatio) {
  // EAR
  earValue.textContent = ear.toFixed(3);
  const earPercent = Math.min(100, (ear / 0.4) * 100); // 0.4 为满刻度
  earBar.style.width = `${earPercent}%`;
  const closed = ear < effectiveEarThreshold;
  earBar.className = `metric-bar-fill${closed ? ' low' : ''}`;
  earValue.className = `metric-value${closed ? ' alert' : ' ok'}`;

  // 闭眼判定
  if (closed) {
    eyeStatus.textContent = '闭眼';
    eyeStatus.className = 'metric-value metric-status alert';
  } else {
    eyeStatus.textContent = '睁眼';
    eyeStatus.className = 'metric-value metric-status ok';
  }

  // Pitch
  pitchValue.textContent = pitch.toFixed(1);
  if (pitch > CONFIG.PITCH_THRESHOLD) {
    pitchValue.className = 'metric-value warn';
    pitchHint.textContent = `超过低头阈值 ${CONFIG.PITCH_THRESHOLD}°`;
    pitchHint.className = 'metric-hint warn';
  } else {
    pitchValue.className = 'metric-value';
    pitchHint.textContent = '正常范围';
    pitchHint.className = 'metric-hint';
  }

  // Yaw
  yawValue.textContent = yaw.toFixed(1);
  if (Math.abs(yaw) > CONFIG.YAW_THRESHOLD) {
    yawValue.className = 'metric-value warn';
    yawHint.textContent = `超过转头阈值 ±${CONFIG.YAW_THRESHOLD}°`;
    yawHint.className = 'metric-hint warn';
  } else {
    yawValue.className = 'metric-value';
    yawHint.textContent = '正常范围';
    yawHint.className = 'metric-hint';
  }

  // FaceRatio
  faceRatioValue.textContent = faceRatio.toFixed(3);
  if (faceRatio > CONFIG.FACE_RATIO_THRESHOLD) {
    faceRatioValue.className = 'metric-value warn';
    faceRatioHint.textContent = '距离过近，建议后退';
    faceRatioHint.className = 'metric-hint warn';
  } else {
    faceRatioValue.className = 'metric-value';
    faceRatioHint.textContent = '距离适中';
    faceRatioHint.className = 'metric-hint';
  }
}

// ---- UI 辅助 ----
function setLoading(visible, text) {
  loadingOverlay.hidden = !visible;
  if (text) loadingText.textContent = text;
}

function showError(msg) {
  errorText.textContent = msg;
  errorOverlay.hidden = false;
}

function resetDisplay() {
  fpsDisplay.textContent = 'FPS: --';
  faceStatus.textContent = '未启动';
  faceStatus.className = 'face-status';
  earValue.textContent = '--';
  earBar.style.width = '0%';
  pitchValue.textContent = '--';
  yawValue.textContent = '--';
  faceRatioValue.textContent = '--';
  eyeStatus.textContent = '--';
  calibStatus.textContent = '未开始';
  calibStatus.className = 'metric-value metric-status';
  if (phoneStatus) {
    phoneStatus.textContent = '--';
    phoneStatus.className = 'metric-value metric-status';
  }
  pitchHint.textContent = '正常范围';
  yawHint.textContent = '正常范围';
  faceRatioHint.textContent = '距离适中';
  latestMetrics = { ear: 0, pitch: 0, yaw: 0, faceRatio: 0 };

  // M2：重置检测器状态
  activeAlerts = [];
  for (const key of Object.keys(triggerState)) {
    triggerState[key] = false;
  }
  absenceDetector.reset();
  eyeClosedDetector.reset();
  perclosDetector.reset();
  phoneDetector.reset();
  touchFaceDetector.reset();
  handNearMouthDetector.reset();
  headDownDetector.reset();
  headTurnDetector.reset();
  tooCloseDetector.reset();
  lookUpDetector.reset();
  stareDetector.reset();

  // M3：重置状态徽章与会话面板
  resetStateMachine();
  stateBadge.className = 'state-badge state-focus';
  stateIcon.textContent = '🎯';
  stateName.textContent = '专注中';
  stateReason.textContent = '等待开始';
  resetSessionDisplay();
  fatigueSince = null;
  fatigueTipShown = false;
  fatigueTip.hidden = true;
}

// ---- 启动 ----
init();