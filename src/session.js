// ===== 学习会话管理（第 10.6 章） =====
// 生命周期：start → (pause ↔ resume)* → stop
// 暂停时检测继续，但事件不计入、时长不累计。
// 每帧调用 tick(state) 累计各状态时长与连续专注时长。

export function createSession() {
  let startedAt = null;
  let stoppedAt = null;
  let events = [];
  let segments = [];              // 活跃时段 {start, end}
  let paused = false;
  let currentSegmentStart = null;

  // 各状态累计时长（毫秒）
  let stateDurations = { FOCUS: 0, DISTRACTED: 0, FATIGUED: 0, ABSENT: 0 };
  let lastTickAt = null;
  let lastTickState = null;

  // 连续专注时长起点
  let focusStreakStart = null;

  const now = () => Date.now();

  return {
    /** 开始会话：记录起点、重置数据 */
    start() {
      const t = now();
      startedAt = t;
      stoppedAt = null;
      events = [];
      segments = [];
      paused = false;
      currentSegmentStart = t;
      stateDurations = { FOCUS: 0, DISTRACTED: 0, FATIGUED: 0, ABSENT: 0 };
      lastTickAt = t;
      lastTickState = null;
      focusStreakStart = null;
    },

    /** 暂停：结束当前时段，停止计时（检测继续但事件不计入） */
    pause() {
      if (!paused && currentSegmentStart !== null) {
        segments.push({ start: currentSegmentStart, end: now() });
        currentSegmentStart = null;
        paused = true;
        lastTickAt = null;
        focusStreakStart = null; // 暂停中断连续专注
      }
    },

    /** 恢复：开启新时段 */
    resume() {
      if (paused) {
        const t = now();
        currentSegmentStart = t;
        paused = false;
        lastTickAt = t;
        // focusStreakStart 保持 null，下次 FOCUS 时重新起算
      }
    },

    /**
     * 结束会话：返回完整 session 对象（供存储）
     * @returns {{startedAt, endedAt, totalMs, stateDurations, events}|null}
     */
    stop() {
      if (startedAt === null) return null;
      if (currentSegmentStart !== null) {
        segments.push({ start: currentSegmentStart, end: now() });
        currentSegmentStart = null;
      }
      stoppedAt = now();
      const totalMs = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
      return {
        startedAt,
        endedAt: stoppedAt,
        totalMs,
        stateDurations: { ...stateDurations },
        events: [...events],
      };
    },

    /** 追加状态事件（暂停时不计入） */
    addEvent(evt) {
      if (!paused && startedAt !== null && stoppedAt === null) {
        events.push(evt);
      }
    },

    /** 每帧调用：累计各状态时长 + 追踪连续专注 */
    tick(state) {
      if (paused || startedAt === null || stoppedAt !== null) return;
      const t = now();
      if (lastTickAt !== null && lastTickState !== null) {
        const dt = t - lastTickAt;
        if (stateDurations[lastTickState] !== undefined) {
          stateDurations[lastTickState] += dt;
        }
      }
      // 连续专注：进入 FOCUS 时起算，离开即清零
      if (state === 'FOCUS') {
        if (focusStreakStart === null) focusStreakStart = t;
      } else {
        focusStreakStart = null;
      }
      lastTickAt = t;
      lastTickState = state;
    },

    // ---- 查询接口 ----
    isRunning() { return startedAt !== null && stoppedAt === null; },
    isPaused() { return paused; },
    getElapsedMs() {
      if (startedAt === null) return 0;
      let total = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
      if (currentSegmentStart !== null) total += now() - currentSegmentStart;
      return total;
    },
    getFocusStreakMs() {
      if (focusStreakStart === null) return 0;
      return now() - focusStreakStart;
    },
    getStateDurations() { return { ...stateDurations }; },
  };
}