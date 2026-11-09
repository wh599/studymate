// ===== 统计计算 + 图表渲染 + PNG 导出（第 10.7 章） =====
// ECharts 5.x（第 7 章锁定技术栈），custom 系列画时间轴色块，pie 画占比，line 画趋势。
// 导出 PNG 用 ECharts getDataURL，不引入新依赖。

import * as echarts from 'echarts';

// ---- 状态颜色与名称（规约：专注=主绿/分心=#F5A623/疲劳=#E05B5B/离座=#9AA5A0） ----
const STATE_COLORS = {
  FOCUS: '#3FA37C',
  DISTRACTED: '#F5A623',
  FATIGUED: '#E05B5B',
  ABSENT: '#9AA5A0',
};

const STATE_NAMES = {
  FOCUS: '专注',
  DISTRACTED: '分心',
  FATIGUED: '疲劳',
  ABSENT: '离座',
};

// ---- 活跃图表实例（供 resize 统一处理） ----
const activeCharts = new Set();
let trendChartInstance = null;

/** 格式化秒数为可读时长（X时X分 / X分X秒 / X秒） */
function formatSec(sec) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}时${m % 60}分`;
  }
  if (m > 0) return `${m}分${s % 60}秒`;
  return `${s}秒`;
}

/** 格式化日期为文件名安全格式 YYYYMMDD_HHmm */
function formatFileNameDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 格式化为 YYYY-MM-DD HH:mm */
function formatDateTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 从会话事件构建状态时间段（相对秒数）
 * 会话起始状态为 FOCUS（状态机在 session.start 时重置）
 * @returns {Array<{start:number, end:number, state:string}>}
 */
function buildSegments(session) {
  const { startedAt, endedAt, events } = session;
  if (!startedAt || !endedAt) return [];

  const endSec = (endedAt - startedAt) / 1000;
  if (!events || events.length === 0) {
    return [{ start: 0, end: Math.max(endSec, 0.1), state: 'FOCUS' }];
  }

  const segments = [];
  let prevSec = 0;
  let prevState = 'FOCUS';

  for (const evt of events) {
    const evtSec = Math.max((evt.ts - startedAt) / 1000, 0);
    if (evtSec > prevSec) {
      segments.push({ start: prevSec, end: evtSec, state: prevState });
    }
    prevSec = evtSec;
    prevState = evt.state;
  }
  if (endSec > prevSec) {
    segments.push({ start: prevSec, end: endSec, state: prevState });
  }

  return segments.filter((s) => s.end > s.start);
}

/**
 * 计算会话统计（第 9.2 章 stats 字段）
 * @param {Object} session 会话对象
 * @returns {Object} stats
 */
export function computeStats(session) {
  const { stateDurations, totalMs, events } = session;
  const safeTotal = totalMs || 1;

  const stats = {
    focusRatio: (stateDurations.FOCUS || 0) / safeTotal,
    distractedRatio: (stateDurations.DISTRACTED || 0) / safeTotal,
    fatiguedRatio: (stateDurations.FATIGUED || 0) / safeTotal,
    absentRatio: (stateDurations.ABSENT || 0) / safeTotal,
    maxFocusStreakSec: 0,
    fatigueCount: 0,
    absenceCount: 0,
    headDownCount: 0,
    phoneUseCount: 0,
    avgEar: 0,
  };

  let earSum = 0;
  let earCount = 0;
  for (const evt of events || []) {
    if (evt.state === 'FATIGUED') stats.fatigueCount++;
    if (evt.state === 'ABSENT') stats.absenceCount++;
    if (evt.reason === 'head_down') stats.headDownCount++;
    if (evt.reason === 'phone_use') stats.phoneUseCount++;
    if (evt.metrics && typeof evt.metrics.ear === 'number' && evt.metrics.ear > 0) {
      earSum += evt.metrics.ear;
      earCount++;
    }
  }
  stats.avgEar = earCount > 0 ? earSum / earCount : 0;

  // 最长连续专注：从时间段中找最长的 FOCUS 段
  for (const seg of buildSegments(session)) {
    if (seg.state === 'FOCUS') {
      const dur = seg.end - seg.start;
      if (dur > stats.maxFocusStreakSec) stats.maxFocusStreakSec = dur;
    }
  }

  return stats;
}

/**
 * 根据规则模板生成文字结论（3~5 条，不依赖大模型，第 10.7 章）
 * @param {Object} stats 会话统计
 * @returns {string[]}
 */
export function generateAdvice(stats) {
  const advice = [];
  const focusMin = Math.round(stats.maxFocusStreakSec / 60);

  // 规则 1：最长连续专注过短（第 10.7 章模板）
  if (stats.maxFocusStreakSec > 0 && stats.maxFocusStreakSec < 900) {
    advice.push(`最长连续专注仅 ${focusMin} 分钟，建议把学习段拆成 25 分钟一段，每段之间休息 5 分钟。`);
  }

  // 规则 2：疲劳次数多（第 10.7 章模板）
  if (stats.fatigueCount >= 3) {
    advice.push(`本次出现 ${stats.fatigueCount} 次疲劳，建议每 45 分钟主动休息 10 分钟，起身活动或远眺。`);
  }

  // 规则 3：离座占比高（第 10.7 章模板）
  if (stats.absentRatio > 0.15) {
    advice.push(`离座时间占比 ${Math.round(stats.absentRatio * 100)}%，建议学习前先处理好喝水、上厕所等杂事。`);
  }

  // 规则 4：分心占比高
  if (stats.distractedRatio > 0.25) {
    advice.push(`分心时间占比 ${Math.round(stats.distractedRatio * 100)}%，建议将手机移出视线范围，桌面只留当前任务所需物品。`);
  }

  // 规则 5：玩手机次数多
  if (stats.phoneUseCount >= 2) {
    advice.push(`检测到 ${stats.phoneUseCount} 次玩手机，建议学习时将手机调至静音并放在另一个房间。`);
  }

  // 默认：状态良好
  if (advice.length === 0) {
    advice.push('本次学习专注占比良好，保持当前节奏。如果感到疲劳，记得主动休息。');
  }

  return advice.slice(0, 5);
}

/**
 * 往期记录 → 会话对象（供 buildSegments/computeStats 复用报告渲染）
 * @param {Object} record 存档记录 {id, date, durationSec, focusSec, ...}
 * @returns {Object} 会话对象（第 9.2 章 schema）
 */
export function recordToSession(record) {
  const startedAt = new Date(record.date).getTime();
  const durationSec = record.durationSec || 0;
  return {
    sessionId: record.id,
    startedAt,
    endedAt: startedAt + durationSec * 1000,
    totalMs: durationSec * 1000,
    stateDurations: {
      FOCUS: (record.focusSec || 0) * 1000,
      DISTRACTED: (record.distractSec || 0) * 1000,
      FATIGUED: (record.fatigueSec || 0) * 1000,
      ABSENT: (record.absentSec || 0) * 1000,
    },
    events: record.events || [],
  };
}

// ---- 图表渲染 ----

/**
 * 渲染状态时间轴（ECharts custom 系列，四色色块，第 10.7 章）
 * @param {HTMLElement} targetEl 图表容器
 * @returns {Object|null} ECharts 实例
 */
function renderTimeline(targetEl, segments, totalSec) {
  if (!targetEl) return null;
  const chart = echarts.init(targetEl);
  activeCharts.add(chart);

  const data = segments.map((seg) => ({
    value: [seg.start, seg.end, seg.state],
    itemStyle: { color: STATE_COLORS[seg.state] || '#9AA5A0' },
  }));

  chart.setOption({
    tooltip: {
      formatter: (params) => {
        const [start, end, state] = params.value;
        const name = STATE_NAMES[state] || state;
        return `${name}：${formatSec(start)} ~ ${formatSec(end)}（${formatSec(end - start)}）`;
      },
    },
    grid: { top: 10, bottom: 30, left: 8, right: 12 },
    xAxis: {
      type: 'value',
      min: 0,
      max: Math.max(totalSec, 1),
      axisLabel: { formatter: (val) => formatSec(val), fontSize: 11, color: '#64748B' },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: '#E2E8F0' } },
    },
    yAxis: {
      type: 'category',
      data: [''],
      axisLabel: { show: false },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: 'custom',
        renderItem: (params, api) => {
          const start = api.coord([api.value(0), 0]);
          const end = api.coord([api.value(1), 0]);
          const barHeight = Math.min(params.coordSys.height * 0.5, 36);
          return {
            type: 'rect',
            shape: {
              x: start[0],
              y: params.coordSys.y + (params.coordSys.height - barHeight) / 2,
              width: Math.max(end[0] - start[0], 2),
              height: barHeight,
              r: 3,
            },
            style: api.style(),
          };
        },
        encode: { x: [0, 1], y: 2 },
        data,
      },
    ],
  });

  return chart;
}

/**
 * 渲染状态占比环形图（ECharts pie，第 10.7 章）
 * @param {HTMLElement} targetEl 图表容器
 * @returns {Object|null} ECharts 实例
 */
function renderPie(targetEl, stateDurations, totalMs) {
  if (!targetEl) return null;
  const chart = echarts.init(targetEl);
  activeCharts.add(chart);

  const safeTotal = totalMs || 1;
  const data = Object.entries(STATE_NAMES)
    .map(([key, name]) => ({
      name,
      value: Math.round(((stateDurations[key] || 0) / safeTotal) * 1000) / 10,
      itemStyle: { color: STATE_COLORS[key] },
    }))
    .filter((d) => d.value > 0);

  chart.setOption({
    tooltip: { formatter: '{b}：{c}%' },
    legend: {
      bottom: 0,
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { fontSize: 12, color: '#64748B' },
    },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        label: {
          show: true,
          formatter: '{b}\n{c}%',
          fontSize: 11,
          color: '#64748B',
        },
        emphasis: { label: { show: true, fontWeight: 'bold' } },
        data,
      },
    ],
  });

  return chart;
}

/**
 * 渲染专注占比趋势折线图（#/history 顶部，7/30 天切换）
 * 横轴日期，纵轴专注占比 %；同一天多条记录取加权平均；无记录天断点。
 * @param {HTMLElement} targetEl 图表容器
 * @param {Array<Object>} records 往期记录列表
 * @param {number} days 最近 N 天（7 或 30）
 */
export function renderTrendChart(targetEl, records, days) {
  if (!targetEl) return;
  if (trendChartInstance) {
    activeCharts.delete(trendChartInstance);
    try { trendChartInstance.dispose(); } catch { /* 已销毁 */ }
  }
  trendChartInstance = echarts.init(targetEl);
  activeCharts.add(trendChartInstance);

  // 按天聚合：focusSec 总和 / durationSec 总和 = 当天平均专注占比
  const dayMap = {};
  const p = (n) => String(n).padStart(2, '0');
  for (const r of records) {
    const d = new Date(r.date);
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    if (!dayMap[key]) dayMap[key] = { focusSum: 0, durationSum: 0 };
    dayMap[key].focusSum += r.focusSec || 0;
    dayMap[key].durationSum += r.durationSec || 0;
  }

  const xData = [];
  const yData = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    xData.push(`${d.getMonth() + 1}/${d.getDate()}`);
    const agg = dayMap[key];
    yData.push(agg && agg.durationSum > 0
      ? Math.round((agg.focusSum / agg.durationSum) * 1000) / 10
      : null);
  }

  trendChartInstance.setOption({
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const v = params[0].value;
        return v == null
          ? `${params[0].axisValue}<br/>专注占比：无记录`
          : `${params[0].axisValue}<br/>专注占比：${v}%`;
      },
    },
    grid: { top: 20, bottom: 30, left: 42, right: 16 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData,
      axisLabel: { fontSize: 11, color: '#64748B' },
      axisLine: { lineStyle: { color: '#E2E8F0' } },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      axisLabel: { formatter: '{value}%', fontSize: 11, color: '#64748B' },
      splitLine: { lineStyle: { color: '#E2E8F0' } },
    },
    series: [
      {
        type: 'line',
        data: yData,
        smooth: true,
        connectNulls: false,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: { color: '#3FA37C' },
        lineStyle: { color: '#3FA37C', width: 2 },
        areaStyle: { color: 'rgba(63, 163, 124, 0.12)' },
      },
    ],
  });
}

// ---- 报告渲染 ----

/**
 * 在指定容器内渲染完整学习报告（#/study 结束覆盖层 / #/history 列表展开）
 * @param {HTMLElement} container 报告容器（内容会被替换）
 * @param {Object} record 存档记录
 * @returns {{ dispose: Function, exportPNG: Function, dateText: string }}
 */
export function renderReportInto(container, record) {
  if (!container || !record) return null;

  const session = recordToSession(record);
  const stats = computeStats(session);
  const totalSec = (session.endedAt - session.startedAt) / 1000;
  const segments = buildSegments(session);
  const dateText = formatDateTime(new Date(record.date));

  // 优先用存档时的结论，无则现场生成
  const adviceList = (record.conclusion && record.conclusion.length)
    ? record.conclusion
    : generateAdvice(stats);

  container.innerHTML = `
    <div class="report-meta">
      <span class="report-meta-date">${dateText}</span>
    </div>
    <div class="metric-cards">
      <div class="metric-card">
        <span class="metric-card-value">${formatSec(session.totalMs / 1000)}</span>
        <span class="metric-card-label">总时长</span>
      </div>
      <div class="metric-card">
        <span class="metric-card-value">${formatSec(stats.maxFocusStreakSec)}</span>
        <span class="metric-card-label">最长连续专注</span>
      </div>
      <div class="metric-card">
        <span class="metric-card-value">${stats.fatigueCount}</span>
        <span class="metric-card-label">疲劳次数</span>
      </div>
      <div class="metric-card">
        <span class="metric-card-value">${stats.absenceCount}</span>
        <span class="metric-card-label">离座次数</span>
      </div>
      <div class="metric-card">
        <span class="metric-card-value">${stats.headDownCount}</span>
        <span class="metric-card-label">低头次数</span>
      </div>
    </div>
    <div class="report-charts">
      <div class="chart-card chart-timeline">
        <h3 class="chart-title">状态时间轴</h3>
        <div class="chart-body r-timeline"></div>
      </div>
      <div class="chart-card chart-pie">
        <h3 class="chart-title">状态占比</h3>
        <div class="chart-body r-pie"></div>
      </div>
    </div>
    <div class="report-advice">
      <h3 class="chart-title">学习建议</h3>
      <ul class="advice-list">${adviceList.map((t) => `<li>${t}</li>`).join('')}</ul>
    </div>
  `;

  const tlChart = renderTimeline(container.querySelector('.r-timeline'), segments, totalSec);
  const pChart = renderPie(container.querySelector('.r-pie'), session.stateDurations, session.totalMs);
  const charts = [tlChart, pChart].filter(Boolean);

  return {
    dateText,
    dispose() {
      for (const c of charts) {
        activeCharts.delete(c);
        try { c.dispose(); } catch { /* 已销毁 */ }
      }
    },
    /** 导出本次报告 PNG（两张图表合成，文件名 report_YYYYMMDD_HHmm.png） */
    exportPNG() {
      const urls = [];
      if (tlChart) urls.push(tlChart.getDataURL({ pixelRatio: 2, backgroundColor: '#FFFFFF' }));
      if (pChart) urls.push(pChart.getDataURL({ pixelRatio: 2, backgroundColor: '#FFFFFF' }));
      if (urls.length === 0) return;

      const images = new Array(urls.length);
      let loaded = 0;

      const composeAndDownload = () => {
        const pad = 40;
        const titleH = 60;
        const gap = 24;
        const imgW = Math.max(...images.map((i) => i.width));
        const totalImgH = images.reduce((sum, i) => sum + i.height, 0) + gap * (images.length - 1);

        const canvas = document.createElement('canvas');
        canvas.width = imgW + pad * 2;
        canvas.height = pad + titleH + totalImgH + pad;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#1E293B';
        ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('StudyMate 学习报告', canvas.width / 2, pad + 24);

        ctx.fillStyle = '#64748B';
        ctx.font = '13px "Microsoft YaHei", sans-serif';
        ctx.fillText(dateText, canvas.width / 2, pad + 46);

        let y = pad + titleH;
        for (const img of images) {
          ctx.drawImage(img, pad, y);
          y += img.height + gap;
        }

        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `report_${formatFileNameDate(new Date())}.png`;
        a.click();
      };

      for (let i = 0; i < urls.length; i++) {
        const img = new Image();
        img.onload = () => {
          images[i] = img;
          loaded++;
          if (loaded === urls.length) composeAndDownload();
        };
        img.src = urls[i];
      }
    },
  };
}

/**
 * 窗口尺寸变化时重绘所有活跃图表（由 main.js 绑定 resize 调用）
 */
export function resizeCharts() {
  for (const c of activeCharts) {
    try { c.resize(); } catch { /* 实例可能已销毁 */ }
  }
}