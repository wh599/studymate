// ===== 状态融合 + 滞回 + 事件记录（第 10.5 章） =====
// 输入六个检测器布尔值，按优先级判定目标状态；
// 候选状态需连续保持 STATE_HOLD_SEC 秒才提交（滞回防抖）。

import { CONFIG } from './config.js';

// 四档状态（第 FR-04 章）
export const STATES = {
  FOCUS: 'FOCUS',           // 专注（绿）
  DISTRACTED: 'DISTRACTED', // 分心（黄）
  FATIGUED: 'FATIGUED',     // 疲劳（红）
  ABSENT: 'ABSENT',         // 离座（灰）
};

// ---- 内部状态 ----
let currentState = STATES.FOCUS;
let currentReason = 'default';
let candidateState = STATES.FOCUS;
let candidateReason = 'default';
let candidateSince = 0;

// 状态优先级权重：ABSENT > FATIGUED > DISTRACTED > FOCUS
const STATE_WEIGHT = {
  [STATES.ABSENT]: 4,
  [STATES.FATIGUED]: 3,
  [STATES.DISTRACTED]: 2,
  [STATES.FOCUS]: 1,
};

/**
 * 根据检测器输出 + 用户行为设置，按优先级判定目标状态与原因
 *
 * 用户设置（behaviorSettings）将每种行为映射到：
 *   'fatigued'   → 触发时判为 FATIGUED
 *   'distracted' → 触发时判为 DISTRACTED
 *   'none'       → 不参与判定（用户关闭了该行为检测）
 *
 * 优先级规则：ABSENT 固定最高；多种行为同时触发时，FATIGUED 优先于 DISTRACTED。
 *
 * @param {Object} flags 检测器输出（键名 = 行为 key）
 * @param {Object} behaviorSettings 用户行为设置 { behaviorKey: category }
 * @returns {{state: string, reason: string}}
 */
function judge(flags, behaviorSettings) {
  // 离座固定为 ABSENT，不受用户设置影响
  if (flags.absence) return { state: STATES.ABSENT, reason: 'no_face' };

  let best = { state: STATES.FOCUS, reason: 'default', weight: STATE_WEIGHT[STATES.FOCUS] };

  for (const [key, triggered] of Object.entries(flags)) {
    if (key === 'absence' || !triggered) continue;
    const category = behaviorSettings[key] || 'none';
    if (category === 'none') continue;

    const state = category === 'fatigued' ? STATES.FATIGUED : STATES.DISTRACTED;
    const weight = STATE_WEIGHT[state];
    if (weight > best.weight) {
      best = { state, reason: key, weight };
    }
  }

  return { state: best.state, reason: best.reason };
}

/**
 * 状态机：输入六个布尔值，输出融合状态（含滞回）
 *
 * 滞回机制：候选状态（含 reason）需连续保持 STATE_HOLD_SEC 秒才提交。
 * 若候选在保持期内发生变化，计时器重置。
 *
 * @param {Object} flags 检测器输出（键名 = 行为 key，如 head_down/phone_use 等）
 * @param {number} nowMs 当前时间戳（performance.now()）
 * @param {Object} behaviorSettings 用户行为设置 { behaviorKey: category }
 * @returns {{state: string, reason: string, changed: boolean}}
 *   changed=true 表示本次发生了状态/原因提交，应记录事件
 */
export function updateStateMachine(flags, nowMs, behaviorSettings) {
  const target = judge(flags, behaviorSettings || {});

  // 候选发生变化 → 重置计时器
  if (target.state !== candidateState || target.reason !== candidateReason) {
    candidateState = target.state;
    candidateReason = target.reason;
    candidateSince = nowMs;
  }

  // 滞回期满且候选与当前不同 → 提交
  let changed = false;
  const held = nowMs - candidateSince >= CONFIG.STATE_HOLD_SEC * 1000;
  if (held && (candidateState !== currentState || candidateReason !== currentReason)) {
    currentState = candidateState;
    currentReason = candidateReason;
    changed = true;
  }

  return { state: currentState, reason: currentReason, changed };
}

/**
 * 获取当前状态（不触发判定）
 * @returns {{state: string, reason: string}}
 */
export function getState() {
  return { state: currentState, reason: currentReason };
}

/**
 * 重置状态机到初始 FOCUS 状态（关闭摄像头/新会话时调用）
 */
export function resetStateMachine() {
  currentState = STATES.FOCUS;
  currentReason = 'default';
  candidateState = STATES.FOCUS;
  candidateReason = 'default';
  candidateSince = 0;
}