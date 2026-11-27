// ===== 近 30 天历史数据种子（演示 / 答辩展示用） =====
//
// 目标：往期数据页一打开就有"用了一段时间"的样子。
//   · 18 天有学习记录，累计 1921 分钟，平均专注占比 78%
//   · 18 天散布在最近 30 天里，中间夹着休息日（学两天、停一两天），
//     所以 30 天趋势曲线是断断续续的，而不是连续 18 天的一条直线。
//
// 数据与真实记录同构（时长 / 状态占比 / 状态切换事件），因此
// 记录列表可展开完整报告、可删除、可被"清空数据"一并清掉。
//
// 时间口径（重要）：所有日期都以"打开页面的当天"为锚点往前推，
//   · 最早一条在 27 天前，最新一条在今天，全部落在最近 30 天窗口内；
//   · 落库前会检查未来日期：一旦本地存在"未来"的记录（时钟被回拨过、
//     或残留了别的演示数据），整份清掉按今天重建，保证曲线不出现未来的学习；
//   · 演示数据换一天打开会自动按新日期重排，曲线始终以"今天"结尾。

import { loadRecords, saveRecord } from './storage.js';
import { recordsKey } from './config.js';

/** 已注入标记的键前缀（按用户名区分，换账号会重新注入），值为生成日期 YYYY-MM-DD */
const SEED_FLAG_PREFIX = 'studymate_seeded_';

/** 时间戳 → 本地日期 YYYY-MM-DD */
function ymd(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ---- 18 天课表 ----
// daysAgo：距今天数（0 = 今天）；hour/minute：开始时间；
// minutes：本次学习总时长；focusMinutes：其中专注时长。
// 合计：时长 1921 分钟，专注 1506 分钟 → 1506 / 1921 ≈ 78.4%，四舍五入显示 78%。
const PLAN = [
  { daysAgo: 27, hour: 19, minute: 20, minutes: 95,  focusMinutes: 77 },
  { daysAgo: 25, hour: 15, minute: 20, minutes: 145, focusMinutes: 110 },
  { daysAgo: 23, hour: 20, minute: 40, minutes: 70,  focusMinutes: 53 },
  { daysAgo: 21, hour: 10, minute: 30, minutes: 130, focusMinutes: 100 },
  { daysAgo: 20, hour: 19, minute: 55, minutes: 65,  focusMinutes: 52 },
  { daysAgo: 18, hour: 14, minute: 30, minutes: 155, focusMinutes: 122 },
  { daysAgo: 16, hour: 20, minute: 15, minutes: 80,  focusMinutes: 62 },
  { daysAgo: 15, hour: 9,  minute: 40, minutes: 123, focusMinutes: 92 },
  { daysAgo: 13, hour: 19, minute: 10, minutes: 105, focusMinutes: 83 },
  { daysAgo: 12, hour: 15, minute: 0,  minutes: 90,  focusMinutes: 68 },
  { daysAgo: 10, hour: 20, minute: 30, minutes: 75,  focusMinutes: 59 },
  { daysAgo: 8,  hour: 10, minute: 0,  minutes: 117, focusMinutes: 96 },
  { daysAgo: 7,  hour: 19, minute: 45, minutes: 60,  focusMinutes: 47 },
  { daysAgo: 6,  hour: 14, minute: 10, minutes: 150, focusMinutes: 122 },
  { daysAgo: 4,  hour: 20, minute: 5,  minutes: 85,  focusMinutes: 71 },
  { daysAgo: 3,  hour: 9,  minute: 20, minutes: 125, focusMinutes: 100 },
  { daysAgo: 1,  hour: 19, minute: 30, minutes: 143, focusMinutes: 112 },
  { daysAgo: 0,  hour: 16, minute: 40, minutes: 108, focusMinutes: 80 },
];

// ---- 各类状态的典型指标（贴近真实检测输出，用于报告里的明细与平均 EAR） ----
const METRIC_SAMPLES = {
  default:      { ear: 0.30, pitch: 5,  yaw: 3,  faceRatio: 0.35 },
  head_turn:    { ear: 0.29, pitch: 8,  yaw: 27, faceRatio: 0.33 },
  head_down:    { ear: 0.28, pitch: 24, yaw: 5,  faceRatio: 0.32 },
  phone_use:    { ear: 0.29, pitch: 13, yaw: 14, faceRatio: 0.30 },
  eye_closed:   { ear: 0.12, pitch: 9,  yaw: 2,  faceRatio: 0.35 },
  perclos:      { ear: 0.16, pitch: 11, yaw: 3,  faceRatio: 0.34 },
  stare_screen: { ear: 0.32, pitch: 6,  yaw: 2,  faceRatio: 0.36 },
  no_face:      { ear: 0,    pitch: 0,  yaw: 0,  faceRatio: 0 },
};

// ---- 打断专注的事件类型（权重 = 出现概率） ----
const EVENT_TYPES = [
  { state: 'DISTRACTED', reason: 'head_turn',    weight: 3 },
  { state: 'DISTRACTED', reason: 'head_down',    weight: 3 },
  { state: 'DISTRACTED', reason: 'phone_use',    weight: 2 },
  { state: 'FATIGUED',   reason: 'stare_screen', weight: 1.5 },
  { state: 'FATIGUED',   reason: 'perclos',      weight: 1.5 },
  { state: 'FATIGUED',   reason: 'eye_closed',   weight: 1 },
  { state: 'ABSENT',     reason: 'no_face',      weight: 1 },
];

/** 稳定伪随机数（同一种子每次生成同样的数据，刷新后不会跳变） */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 把 total 拆成 count 个整数（和恰好为 total），并在段间随机挪动少量分钟，
 * 让专注段长短参差，避免每段都是平均数。
 * @returns {number[]}
 */
function splitEven(rnd, total, count, minEach) {
  const base = Math.floor(total / count);
  const out = new Array(count).fill(base);
  let rest = total - base * count;
  while (rest > 0) {
    out[Math.floor(rnd() * count)] += 1;
    rest -= 1;
  }
  // 段间搬运：制造 25 分钟 / 38 分钟这样的自然差异
  for (let i = 0; i < count * 3; i++) {
    const a = Math.floor(rnd() * count);
    const b = Math.floor(rnd() * count);
    if (a === b) continue;
    const move = 1 + Math.floor(rnd() * 3);
    if (out[a] - move >= minEach) {
      out[a] -= move;
      out[b] += move;
    }
  }
  return out;
}

/** 抽签决定本次会话里打断专注的事件类型（同类型不连续、离座最多一次） */
function drawEventTypes(rnd, count) {
  const picked = [];
  let lastReason = '';
  let absentUsed = false;
  for (let i = 0; i < count; i++) {
    const candidates = EVENT_TYPES.filter(
      (t) => t.reason !== lastReason && !(t.reason === 'no_face' && absentUsed)
    );
    const totalWeight = candidates.reduce((s, t) => s + t.weight, 0);
    let r = rnd() * totalWeight;
    let chosen = candidates[candidates.length - 1];
    for (const t of candidates) {
      r -= t.weight;
      if (r <= 0) { chosen = t; break; }
    }
    if (chosen.reason === 'no_face') absentUsed = true;
    lastReason = chosen.reason;
    picked.push({ state: chosen.state, reason: chosen.reason });
  }
  return picked;
}

/** 指标加一点抖动，避免每次事件数值完全一样 */
function jitterMetrics(sample, rnd) {
  const around = (v, range) => (v > 0 ? Math.round(v * (1 + (rnd() - 0.5) * range) * 1000) / 1000 : 0);
  return {
    ear: around(sample.ear, 0.14),
    pitch: around(sample.pitch, 0.3),
    yaw: around(sample.yaw, 0.3),
    faceRatio: around(sample.faceRatio, 0.12),
  };
}

/**
 * 生成一次会话的剧本段：首段与末段都是专注，中间插入若干次分心 / 疲劳 / 离座。
 * 段分钟数之和 = totalMin，专注段之和 = focusMin。
 * 专注段故意做成"一大段 + 若干中段"（真人是一次主攻 25~45 分钟，
 * 而不是每 8 分钟就断一次），这样报告里的"最长连续专注"才像真的。
 * @returns {Array<{state:string, reason:string, minutes:number, metrics:Object}>}
 */
function buildScript(totalMin, focusMin, rnd) {
  const nonFocusMin = totalMin - focusMin;
  // 每次打断平均 5 分钟左右：2 分钟走神、6 分钟刷手机都算合理
  const eventCount = Math.max(3, Math.min(7, Math.round(nonFocusMin / 5.5)));

  // 专注段：先留出一段"主攻段"（占总专注 40%~55%，上限 45 分钟），其余均分
  const minOthers = 6 * eventCount;
  const mainTarget = Math.min(45, Math.round(focusMin * (0.4 + rnd() * 0.15)));
  const main = Math.max(Math.round(focusMin / (eventCount + 1)), Math.min(mainTarget, focusMin - minOthers));
  const others = splitEven(rnd, focusMin - main, eventCount, 6);
  const mainIndex = Math.floor(rnd() * (eventCount + 1));

  const focusChunks = [];
  let oi = 0;
  for (let i = 0; i <= eventCount; i++) {
    focusChunks.push(i === mainIndex ? main : others[oi++]);
  }
  const eventChunks = splitEven(rnd, nonFocusMin, eventCount, 1);
  const types = drawEventTypes(rnd, eventCount);

  const script = [];
  for (let i = 0; i < eventCount; i++) {
    script.push({ state: 'FOCUS', reason: 'default', minutes: focusChunks[i], metrics: METRIC_SAMPLES.default });
    script.push({
      state: types[i].state,
      reason: types[i].reason,
      minutes: eventChunks[i],
      metrics: METRIC_SAMPLES[types[i].reason] || METRIC_SAMPLES.default,
    });
  }
  script.push({ state: 'FOCUS', reason: 'default', minutes: focusChunks[eventCount], metrics: METRIC_SAMPLES.default });
  return script;
}

/**
 * 计算记录的开始时间；"今天"这条必须已经结束，否则挪到 29 天前的同一时段，
 * 以免凌晨打开时出现"未来才开始的学习"。
 */
function resolveStart(entry, now, minutes) {
  const planned = new Date(now);
  planned.setHours(entry.hour, entry.minute, 0, 0);
  planned.setDate(planned.getDate() - entry.daysAgo);
  if (entry.daysAgo > 0) return planned.getTime();

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const latestEnd = now - 2 * 60 * 1000;
  if (planned.getTime() + minutes * 60 * 1000 <= latestEnd) return planned.getTime();

  const shifted = latestEnd - minutes * 60 * 1000;
  if (shifted >= startOfToday.getTime()) return shifted;

  const alt = new Date(now);
  alt.setHours(19, 30, 0, 0);
  alt.setDate(alt.getDate() - 29);
  return alt.getTime();
}

/** 由课表条目生成一条完整记录（与 storage.js 的 record 结构一致） */
function buildRecord(entry, index, now) {
  const rnd = mulberry32(20261127 + index * 7919 + entry.minutes);
  const startedAt = resolveStart(entry, now, entry.minutes);
  const script = buildScript(entry.minutes, entry.focusMinutes, rnd);

  const stateDurations = { FOCUS: 0, DISTRACTED: 0, FATIGUED: 0, ABSENT: 0 };
  const events = [];
  let cursor = startedAt;
  let prevState = 'FOCUS';

  for (const seg of script) {
    const segMs = seg.minutes * 60 * 1000;
    stateDurations[seg.state] += segMs;
    if (seg.state !== prevState) {
      events.push({
        ts: cursor,
        state: seg.state,
        reason: seg.reason,
        metrics: jitterMetrics(seg.metrics, rnd),
      });
      prevState = seg.state;
    }
    cursor += segMs;
  }

  const toSec = (ms) => Math.round(ms / 1000);
  return {
    id: 'record_' + startedAt + '_' + index,
    date: new Date(startedAt).toISOString(),
    durationSec: toSec(stateDurations.FOCUS + stateDurations.DISTRACTED + stateDurations.FATIGUED + stateDurations.ABSENT),
    focusSec: toSec(stateDurations.FOCUS),
    distractSec: toSec(stateDurations.DISTRACTED),
    fatigueSec: toSec(stateDurations.FATIGUED),
    absentSec: toSec(stateDurations.ABSENT),
    events,
    conclusion: null, // 留空：报告打开时按规则模板现场生成建议
    seeded: true,     // 标记为演示数据：换一天打开时会按当天重排，真实记录不会被误删
  };
}

/**
 * 生成 18 条近 30 天的学习记录（按时间正序）
 * @param {number} [now] 参考时间戳（默认当前时间，便于测试）
 * @returns {Array<Object>}
 */
export function buildSeedRecords(now = Date.now()) {
  return PLAN
    .map((entry, index) => buildRecord(entry, index, now))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/** 清掉当前用户的全部记录，按"现在"重新写入 18 天演示数据 */
function rebuild(username, now, flagKey, today) {
  localStorage.removeItem(recordsKey(username));
  const records = buildSeedRecords(now);
  for (const record of records) saveRecord(username, record);
  localStorage.setItem(flagKey, today);
  return records.length;
}

/**
 * 进入往期数据页时补齐演示数据
 *
 * 处理顺序：
 *   1. 本地存在"未来日期"的记录（时钟被回拨、或别处残留的演示数据）→ 整份重建；
 *   2. 本地没有记录 → 首次进入时注入 18 天；用户主动"清空数据"过则不再自动注入；
 *   3. 本地全是演示数据、但不是在今天生成的 → 按今天重排，保证曲线以今天收尾；
 *   4. 本地有真实记录 → 保持不动，不污染用户自己的数据。
 *
 * @param {string} username 当前登录用户名
 * @returns {number} 本次写入的记录条数（0 表示未改动）
 */
export function ensureSeedData(username) {
  if (!username) return 0;
  const flagKey = SEED_FLAG_PREFIX + username;
  const now = Date.now();
  const today = ymd(now);
  try {
    const existing = loadRecords(username);
    const future = existing.filter((r) => new Date(r.date).getTime() > now + 60 * 1000);

    // 1) 未来日期的记录不可信：整份重建，避免趋势图出现"未来的学习"
    if (future.length > 0) {
      const n = rebuild(username, now, flagKey, today);
      console.warn(`[StudyMate] 发现 ${future.length} 条未来日期的记录，已按今天重建 ${n} 天演示数据`);
      return n;
    }

    // 2) 没有记录
    if (existing.length === 0) {
      if (localStorage.getItem(flagKey)) return 0; // 用户清空过数据，不再自动注入
      const n = rebuild(username, now, flagKey, today);
      console.log(`[StudyMate] 已注入 ${n} 天演示学习记录（1921 分钟 / 78%）`);
      return n;
    }

    // 3) 全是演示数据但生成日期不是今天：按今天重排，曲线始终以今天结尾
    const allSeeded = existing.every((r) => r.seeded === true);
    if (allSeeded && localStorage.getItem(flagKey) !== today) {
      const n = rebuild(username, now, flagKey, today);
      console.log(`[StudyMate] 演示数据已按今天(${today})重排，共 ${n} 天`);
      return n;
    }

    // 4) 有真实记录：保持不动，只记录标记
    if (!localStorage.getItem(flagKey)) localStorage.setItem(flagKey, today);
    return 0;
  } catch (err) {
    console.warn('[StudyMate] 演示数据写入失败：', err);
    return 0;
  }
}

/**
 * 手动重置演示数据：清空当前用户记录并重新生成 18 天
 * @param {string} username
 * @returns {number} 写入条数
 */
export function resetSeedData(username) {
  if (!username) return 0;
  const now = Date.now();
  return rebuild(username, now, SEED_FLAG_PREFIX + username, ymd(now));
}
