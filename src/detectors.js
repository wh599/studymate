// ===== 六个检测器（第 10.4 章） =====
// 每个检测器持有自己的计时器状态，main.js 每帧调用。

import { CONFIG } from './config.js';

/**
 * 持续条件检测器：条件需连续保持 thresholdSec 秒才触发
 */
export class SustainedDetector {
  /**
   * @param {number} thresholdSec 触发所需的持续秒数
   */
  constructor(thresholdSec) {
    this.thresholdSec = thresholdSec;
    this.since = null; // 条件开始满足的时间戳（ms），null 表示当前不满足
  }

  /**
   * 每帧调用
   * @param {boolean} condition 本帧条件是否满足
   * @param {number} nowMs 当前时间戳
   * @returns {boolean} 是否已持续满足达到阈值
   */
  update(condition, nowMs) {
    if (!condition) {
      this.since = null;
      return false;
    }
    if (this.since === null) this.since = nowMs;
    return nowMs - this.since >= this.thresholdSec * 1000;
  }

  /** 重置计时器 */
  reset() {
    this.since = null;
  }
}

/**
 * PERCLOS 比率检测器：滑动窗口内闭眼占比超阈值即触发
 */
export class PerclosDetector {
  /**
   * @param {number} threshold PERCLOS 占比阈值（0~1）
   * @param {number} windowSec 滑动窗口时长（秒）
   */
  constructor(threshold, windowSec) {
    this.threshold = threshold;
    this.windowMs = windowSec * 1000;
    this.queue = []; // { ts, closed }
  }

  /**
   * 每帧调用
   * @param {boolean} eyeClosed 本帧是否闭眼
   * @param {number} nowMs 当前时间戳
   * @returns {boolean} PERCLOS 是否超过阈值
   */
  update(eyeClosed, nowMs) {
    this.queue.push({ ts: nowMs, closed: eyeClosed });
    while (this.queue.length > 0 && nowMs - this.queue[0].ts > this.windowMs) {
      this.queue.shift();
    }
    if (this.queue.length === 0) return false;
    let closedCount = 0;
    for (const e of this.queue) {
      if (e.closed) closedCount++;
    }
    return closedCount / this.queue.length >= this.threshold;
  }

  /** 重置窗口 */
  reset() {
    this.queue.length = 0;
  }
}

// ---- 六个检测器实例（阈值全部来自 config.js 第 11 章） ----

/** 离座检测：连续无人脸达到 ABSENCE_SEC 秒 */
export const absenceDetector = new SustainedDetector(CONFIG.ABSENCE_SEC);

/** 闭眼检测：连续闭眼达到 EYE_CLOSE_SEC 秒 */
export const eyeClosedDetector = new SustainedDetector(CONFIG.EYE_CLOSE_SEC);

/** PERCLOS 检测：60 秒窗口内闭眼占比超 PERCLOS_THRESHOLD */
export const perclosDetector = new PerclosDetector(
  CONFIG.PERCLOS_THRESHOLD,
  CONFIG.PERCLOS_WINDOW_SEC
);

/** 低头检测：连续低头达到 HEAD_DOWN_SEC 秒 */
export const headDownDetector = new SustainedDetector(CONFIG.HEAD_DOWN_SEC);

/** 转头检测：连续转头达到 HEAD_TURN_SEC 秒 */
export const headTurnDetector = new SustainedDetector(CONFIG.HEAD_TURN_SEC);

/** 距离过近检测：连续 faceRatio 超限达到 CLOSE_SEC 秒 */
export const tooCloseDetector = new SustainedDetector(CONFIG.CLOSE_SEC);

/** 玩手机检测：手在面部下方持续达到 PHONE_SEC 秒 */
export const phoneDetector = new SustainedDetector(CONFIG.PHONE_SEC);

/** 触碰面部检测：手部关键点在面部包围盒内持续达到 TOUCH_FACE_SEC 秒 */
export const touchFaceDetector = new SustainedDetector(CONFIG.TOUCH_FACE_SEC);

/** 手靠近嘴部检测：指尖到嘴部距离小于阈值持续达到 HAND_MOUTH_SEC 秒 */
export const handNearMouthDetector = new SustainedDetector(CONFIG.HAND_MOUTH_SEC);

/** 抬头检测：俯仰角低于 LOOK_UP_THRESHOLD 持续达到 LOOK_UP_SEC 秒 */
export const lookUpDetector = new SustainedDetector(CONFIG.LOOK_UP_SEC);

/** 长时间盯屏检测：无眨眼（眼睛持续睁开）达到 STARE_SEC 秒 */
export const stareDetector = new SustainedDetector(CONFIG.STARE_SEC);