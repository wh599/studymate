// ===== 3 组演示会话数据（FR-10） =====
// 内置专注型、疲劳型、分心型三组示例会话数据。
// 评委无需真坐 1 小时即可看到完整报告。
// 会话 schema 遵循第 9.2 章：{ sessionId, startedAt, endedAt, totalMs, stateDurations, events }

// ---- 各场景典型指标值（模拟真实检测输出） ----
const M = {
  focus:        { ear: 0.30, pitch: 5,   yaw: 3,  faceRatio: 0.35 },
  headTurn:     { ear: 0.29, pitch: 8,   yaw: 28, faceRatio: 0.33 },
  headDown:     { ear: 0.28, pitch: 25,  yaw: 5,  faceRatio: 0.32 },
  phoneUse:     { ear: 0.29, pitch: 12,  yaw: 15, faceRatio: 0.30 },
  eyeClosed:    { ear: 0.12, pitch: 8,   yaw: 2,  faceRatio: 0.35 },
  perclos:      { ear: 0.15, pitch: 10,  yaw: 3,  faceRatio: 0.34 },
  stareScreen:  { ear: 0.32, pitch: 5,   yaw: 2,  faceRatio: 0.36 },
  absent:       { ear: 0,    pitch: 0,   yaw: 0,  faceRatio: 0 },
};

/**
 * 生成安全的演示日期（若"今天"指定时间还未到，则退到昨天）
 * @param {number} daysAgo 几天前
 * @param {number} hour 小时
 * @param {number} [minute=0] 分钟
 * @returns {Date}
 */
function demoDate(daysAgo, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  if (daysAgo === 0 && d.getTime() > Date.now()) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/**
 * 从剧本段构建完整会话对象（第 9.2 章 schema）
 * 剧本第一段默认为 FOCUS（与状态机 session.start 重置一致），
 * 后续每段代表一次状态切换，仅在状态变化时记录事件。
 * @param {string} sessionId 会话 ID
 * @param {Date} startDate 开始时间
 * @param {Array<{state:string, reason:string, minutes:number, metrics:Object}>} script 剧本段
 * @returns {Object} 会话对象
 */
function buildSession(sessionId, startDate, script) {
  const startedAt = startDate.getTime();
  const events = [];
  const stateDurations = { FOCUS: 0, DISTRACTED: 0, FATIGUED: 0, ABSENT: 0 };

  let cursor = startedAt;
  let prevState = 'FOCUS'; // 会话起始状态为 FOCUS

  for (const seg of script) {
    const segMs = seg.minutes * 60 * 1000;
    stateDurations[seg.state] += segMs;

    // 状态变化时记录事件（与真实检测逻辑一致）
    if (seg.state !== prevState) {
      events.push({
        ts: cursor,
        state: seg.state,
        reason: seg.reason,
        metrics: { ...seg.metrics },
      });
      prevState = seg.state;
    }
    cursor += segMs;
  }

  const endedAt = cursor;
  return { sessionId, startedAt, endedAt, totalMs: endedAt - startedAt, stateDurations, events };
}

// ---- 专注型：60 分钟，专注占比 93%，仅短暂分心与离座 ----
const FOCUS_SCRIPT = [
  { state: 'FOCUS',      reason: 'default',    minutes: 25, metrics: M.focus },
  { state: 'DISTRACTED', reason: 'head_turn',  minutes: 2,  metrics: M.headTurn },
  { state: 'FOCUS',      reason: 'default',    minutes: 23, metrics: M.focus },
  { state: 'ABSENT',     reason: 'no_face',    minutes: 2,  metrics: M.absent },
  { state: 'FOCUS',      reason: 'default',    minutes: 8,  metrics: M.focus },
];

// ---- 疲劳型：60 分钟，疲劳占比 30%，4 次疲劳事件 ----
const FATIGUED_SCRIPT = [
  { state: 'FOCUS',    reason: 'default',      minutes: 15, metrics: M.focus },
  { state: 'FATIGUED', reason: 'eye_closed',   minutes: 3,  metrics: M.eyeClosed },
  { state: 'FOCUS',    reason: 'default',      minutes: 12, metrics: M.focus },
  { state: 'FATIGUED', reason: 'perclos',      minutes: 5,  metrics: M.perclos },
  { state: 'FOCUS',    reason: 'default',      minutes: 5,  metrics: M.focus },
  { state: 'FATIGUED', reason: 'stare_screen', minutes: 5,  metrics: M.stareScreen },
  { state: 'FOCUS',    reason: 'default',      minutes: 5,  metrics: M.focus },
  { state: 'FATIGUED', reason: 'eye_closed',   minutes: 5,  metrics: M.eyeClosed },
  { state: 'FOCUS',    reason: 'default',      minutes: 5,  metrics: M.focus },
];

// ---- 分心型：60 分钟，分心占比 30%，玩手机 2 次 + 低头 + 转头 ----
const DISTRACTED_SCRIPT = [
  { state: 'FOCUS',      reason: 'default',   minutes: 10, metrics: M.focus },
  { state: 'DISTRACTED', reason: 'phone_use', minutes: 4,  metrics: M.phoneUse },
  { state: 'FOCUS',      reason: 'default',   minutes: 6,  metrics: M.focus },
  { state: 'DISTRACTED', reason: 'head_down', minutes: 4,  metrics: M.headDown },
  { state: 'FOCUS',      reason: 'default',   minutes: 10, metrics: M.focus },
  { state: 'ABSENT',     reason: 'no_face',   minutes: 4,  metrics: M.absent },
  { state: 'FOCUS',      reason: 'default',   minutes: 6,  metrics: M.focus },
  { state: 'DISTRACTED', reason: 'phone_use', minutes: 4,  metrics: M.phoneUse },
  { state: 'FOCUS',      reason: 'default',   minutes: 6,  metrics: M.focus },
  { state: 'DISTRACTED', reason: 'head_turn', minutes: 6,  metrics: M.headTurn },
];

/**
 * 获取单组演示会话数据
 * @param {'focus'|'fatigued'|'distracted'} type 演示类型
 * @returns {Object|null} 会话对象（第 9.2 章 schema），类型无效返回 null
 */
export function getDemoSession(type) {
  switch (type) {
    case 'focus':
      return buildSession('demo-focus-0001', demoDate(0, 9), FOCUS_SCRIPT);
    case 'fatigued':
      return buildSession('demo-fatigued-0002', demoDate(1, 14), FATIGUED_SCRIPT);
    case 'distracted':
      return buildSession('demo-distracted-0003', demoDate(2, 20), DISTRACTED_SCRIPT);
    default:
      return null;
  }
}

/**
 * 获取全部 3 组演示会话（按时间正序：前天 → 昨天 → 今天）
 * 正序便于逐条 saveSession 注入后，历史列表倒序展示时最新的在前。
 * @returns {Array<Object>}
 */
export function getDemoSessions() {
  return [
    getDemoSession('distracted'),
    getDemoSession('fatigued'),
    getDemoSession('focus'),
  ];
}