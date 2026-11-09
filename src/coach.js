// ===== AI 教练对话框（主页内嵌，第 10.8 章） =====
// 消息流 + 附件（图片/文件）+ 多模态 + Markdown 渲染 + 快捷术语。
// 纯文本走 /api/chat（glm-4-flash）；带图片走多模态（glm-4v-flash）。

import { searchKnowledge } from './knowledge/index.js';
import { loadRecords } from './storage.js';
import { recordToSession } from './report.js';
import { getCurrentUser } from './auth.js';

// ---- DOM 引用 ----
let dom = {};

function cacheDom() {
  if (dom.chatMessages) return;
  dom = {
    chatMessages: document.getElementById('chatMessages'),
    coachWelcome: document.getElementById('coachWelcome'),
    chatInput: document.getElementById('chatInput'),
    chatSendBtn: document.getElementById('chatSendBtn'),
    chatAttachBtn: document.getElementById('chatAttachBtn'),
    chatFileInput: document.getElementById('chatFileInput'),
    attachPreview: document.getElementById('attachPreview'),
    chatStatus: document.getElementById('chatStatus'),
    quickChips: document.getElementById('quickChips'),
  };
}

// ---- 状态 ----
let chatHistory = [];       // 对话历史（最近 10 轮发给服务端）
let attachedImages = [];    // { file, dataUrl }
let attachedFiles = [];     // { file, text }
let getSummaryCallback = null;
let coachInitialized = false;

// ---- 指标卡中文映射 ----
const STATE_LABELS = { FOCUS: '专注', DISTRACTED: '分心', FATIGUED: '疲劳', ABSENT: '离座' };

/**
 * 构建第 9.3 章会话摘要（发给大模型，不含任何图像）
 */
export function buildSessionSummary(latestSession) {
  const sessions = loadRecords(getCurrentUser()).map(recordToSession);
  const target = latestSession || sessions[sessions.length - 1] || null;

  if (!target) {
    return { durationMin: 0, hasData: false, recentSessions: [] };
  }

  const durationMin = Math.round((target.totalMs || 0) / 60000);
  const totalMs = target.totalMs || 1;
  const stateDurations = target.stateDurations || {};
  const focusRatio = Math.round(((stateDurations.FOCUS || 0) / totalMs) * 100) / 100;

  let fatigueCount = 0;
  let absenceCount = 0;
  let headDownCount = 0;
  const events = target.events || [];
  for (const evt of events) {
    if (evt.state === 'FATIGUED') fatigueCount++;
    if (evt.state === 'ABSENT') absenceCount++;
    if (evt.reason === 'head_down') headDownCount++;
  }

  // 最长连续专注
  let maxFocusStreakSec = 0;
  if (target.startedAt && target.endedAt) {
    let prevSec = 0;
    let prevState = 'FOCUS';
    for (const evt of events) {
      const evtSec = (evt.ts - target.startedAt) / 1000;
      if (prevState === 'FOCUS' && evtSec > prevSec) {
        maxFocusStreakSec = Math.max(maxFocusStreakSec, evtSec - prevSec);
      }
      prevSec = evtSec;
      prevState = evt.state;
    }
    const endSec = (target.endedAt - target.startedAt) / 1000;
    if (prevState === 'FOCUS' && endSec > prevSec) {
      maxFocusStreakSec = Math.max(maxFocusStreakSec, endSec - prevSec);
    }
  }

  // 状态时间线
  const timelineParts = [];
  if (target.startedAt && events.length > 0) {
    let prevSec = 0;
    let prevState = 'FOCUS';
    for (const evt of events) {
      const evtSec = (evt.ts - target.startedAt) / 1000;
      if (evtSec > prevSec) {
        timelineParts.push(`${Math.floor(prevSec / 60)}-${Math.floor(evtSec / 60)}分${STATE_LABELS[prevState] || prevState}`);
      }
      prevSec = evtSec;
      prevState = evt.state;
    }
    const endSec = (target.endedAt - target.startedAt) / 1000;
    if (endSec > prevSec) {
      timelineParts.push(`${Math.floor(prevSec / 60)}-${Math.floor(endSec / 60)}分${STATE_LABELS[prevState] || prevState}`);
    }
  }

  const recentSessions = sessions
    .slice(-6, -1)
    .reverse()
    .map((s) => ({
      date: new Date(s.startedAt).toISOString().slice(0, 10),
      durationMin: Math.round((s.totalMs || 0) / 60000),
      focusRatio: Math.round((((s.stateDurations?.FOCUS || 0) / (s.totalMs || 1))) * 100) / 100,
      fatigueCount: (s.events || []).filter((e) => e.state === 'FATIGUED').length,
    }));

  return {
    hasData: true,
    durationMin,
    focusRatio,
    fatigueCount,
    absenceCount,
    headDownCount,
    maxFocusStreakMin: Math.round(maxFocusStreakSec / 60),
    stateTimeline: timelineParts.join(',') || '全程专注',
    recentSessions,
  };
}

/**
 * 按第 12.2 章模板组装用户消息
 */
function buildUserMessage(question, summary) {
  const matched = searchKnowledge(question);
  const knowledgeText = matched.map((k) => `[${k.id}] ${k.title}：${k.content}`).join('\n');

  return `[本次学习数据]\n${JSON.stringify({
    durationMin: summary.durationMin,
    focusRatio: summary.focusRatio,
    fatigueCount: summary.fatigueCount,
    absenceCount: summary.absenceCount,
    headDownCount: summary.headDownCount,
    maxFocusStreakMin: summary.maxFocusStreakMin,
    stateTimeline: summary.stateTimeline,
  }, null, 2)}\n[最近记录]\n${JSON.stringify(summary.recentSessions, null, 2)}\n[知识库片段]\n${knowledgeText}\n[学生提问]\n${question}`;
}

// ---- Markdown 渲染 ----

/** 安全渲染 Markdown（marked.js CDN 引入，不可用时降级为纯文本） */
function renderMarkdown(text) {
  if (window.marked) {
    try {
      return window.marked.parse(text);
    } catch { return text; }
  }
  return text;
}

// ---- 附件处理 ----

/** 文件选择回调：图片≤3MB 转 base64，txt/md≤10MB 读全文截取 3000 字 */
function handleFileSelect() {
  const files = Array.from(dom.chatFileInput.files);
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      if (file.size > 3 * 1024 * 1024) {
        appendMessage('assistant', `图片「${file.name}」超过 3MB 限制，已跳过。`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        attachedImages.push({ file, dataUrl: e.target.result });
        renderAttachPreview();
      };
      reader.readAsDataURL(file);
    } else if (/\.(txt|md)$/i.test(file.name)) {
      if (file.size > 10 * 1024 * 1024) {
        appendMessage('assistant', `文件「${file.name}」超过 10MB 限制，已跳过。`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        attachedFiles.push({ file, text: String(e.target.result).slice(0, 3000) });
        renderAttachPreview();
      };
      reader.readAsText(file);
    } else {
      appendMessage('assistant', `暂支持 txt/md 与图片格式，已跳过「${file.name}」。`);
    }
  }
  dom.chatFileInput.value = ''; // 重置以允许重复选择同一文件
}

/** 渲染附件预览区（缩略图 + 文件名 chip，可删除） */
function renderAttachPreview() {
  dom.attachPreview.innerHTML = '';
  attachedImages.forEach((img, idx) => {
    const div = document.createElement('div');
    div.className = 'attach-thumb';
    const imgEl = document.createElement('img');
    imgEl.src = img.dataUrl;
    imgEl.alt = '';
    const btn = document.createElement('button');
    btn.className = 'attach-remove';
    btn.textContent = '✕';
    btn.addEventListener('click', () => { attachedImages.splice(idx, 1); renderAttachPreview(); });
    div.appendChild(imgEl);
    div.appendChild(btn);
    dom.attachPreview.appendChild(div);
  });
  attachedFiles.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'attach-file-chip';
    const span = document.createElement('span');
    span.textContent = `📄 ${f.file.name}`;
    const btn = document.createElement('button');
    btn.className = 'attach-remove';
    btn.textContent = '✕';
    btn.addEventListener('click', () => { attachedFiles.splice(idx, 1); renderAttachPreview(); });
    div.appendChild(span);
    div.appendChild(btn);
    dom.attachPreview.appendChild(div);
  });
  const hasAttachments = attachedImages.length > 0 || attachedFiles.length > 0;
  dom.attachPreview.classList.toggle('hidden', !hasAttachments);
}

// ---- 消息渲染 ----

/** 添加一条消息气泡（教练左侧白气泡+🌿头像，用户右侧绿气泡） */
function appendMessage(role, text) {
  cacheDom();
  const div = document.createElement('div');
  div.className = `chat-message chat-${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('span');
    avatar.className = 'chat-avatar';
    avatar.textContent = '🌿';
    div.appendChild(avatar);
  }

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  if (text) bubble.textContent = text;
  div.appendChild(bubble);

  dom.chatMessages.appendChild(div);
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
  return bubble;
}

/**
 * 流式打字机效果：逐字显示教练回复，完成后渲染 Markdown
 * @param {HTMLElement} bubble 消息气泡元素
 * @param {string} fullText 完整回复文本
 * @param {boolean} useMarkdown 是否渲染 Markdown
 */
function typewriterStream(bubble, fullText, useMarkdown) {
  bubble.classList.add('streaming');
  bubble.textContent = '';
  let i = 0;
  const chars = Array.from(fullText);
  const step = Math.max(1, Math.floor(chars.length / 80));
  const interval = setInterval(() => {
    i = Math.min(chars.length, i + step);
    const partial = chars.slice(0, i).join('');
    if (useMarkdown && window.marked) {
      bubble.innerHTML = renderMarkdown(partial);
    } else {
      bubble.textContent = partial;
    }
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
    if (i >= chars.length) {
      clearInterval(interval);
      bubble.classList.remove('streaming');
      if (useMarkdown) bubble.innerHTML = renderMarkdown(fullText);
    }
  }, 30);
}

// ---- 自适应文本框高度（最多 4 行） ----

function autoResizeTextarea() {
  const ta = dom.chatInput;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 96) + 'px';
}

// ---- 加载状态 ----

function setLoading(loading) {
  cacheDom();
  dom.chatSendBtn.disabled = loading;
  dom.chatInput.disabled = loading;
  dom.chatAttachBtn.disabled = loading;
  dom.chatStatus.classList.toggle('hidden', !loading);
}

// ---- 发送：纯文本 ----

async function sendToCoach(question, sessionSummary) {
  const userMessage = buildUserMessage(question, sessionSummary || { hasData: false, recentSessions: [] });
  const username = getCurrentUser() || '';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory.slice(-10),
        userMessage,
        username,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.message || `请求失败（${resp.status}）`);
    }

    const data = await resp.json();
    chatHistory.push({ role: 'user', content: question });
    chatHistory.push({ role: 'assistant', content: data.reply });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    return data.reply;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- 发送：多模态（带图片） ----

async function sendMultimodal(question, images, files, summary) {
  // 文本部分
  let textPart = question || '请识别图片中的学习任务/题目/计划表，并给出分析。';
  if (files.length > 0) {
    const fileText = files.map((f) => `[文件：${f.file.name}]\n${f.text}`).join('\n\n');
    textPart = fileText + '\n\n' + textPart;
  }
  if (summary && summary.hasData) {
    textPart += `\n\n[本次学习数据]\n${JSON.stringify({
      durationMin: summary.durationMin,
      focusRatio: summary.focusRatio,
      fatigueCount: summary.fatigueCount,
      absenceCount: summary.absenceCount,
    }, null, 2)}`;
  }

  // 多模态 content：text + image_url
  const content = [{ type: 'text', text: textPart }];
  for (const img of images) {
    content.push({ type: 'image_url', image_url: { url: img.dataUrl } });
  }

  const username = getCurrentUser() || '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000); // 多模态给更多时间

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Multimodal': '1' },
      body: JSON.stringify({
        messages: chatHistory.slice(-10),
        userMessage: textPart,
        multimodalContent: content,
        username,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.message || `请求失败（${resp.status}）`);
    }

    const data = await resp.json();
    chatHistory.push({ role: 'user', content: question || '[图片]' });
    chatHistory.push({ role: 'assistant', content: data.reply });
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

    return data.reply;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- 发送编排 ----

async function handleSend(presetQuestion) {
  const question = presetQuestion || dom.chatInput.value.trim();
  const hasImages = attachedImages.length > 0;
  const hasFiles = attachedFiles.length > 0;

  if (!question && !hasImages && !hasFiles) return;

  // 隐藏欢迎卡片
  if (dom.coachWelcome) dom.coachWelcome.classList.add('hidden');

  // 显示用户消息（附件以标记展示）
  let userDisplay = question;
  if (hasImages) userDisplay += (userDisplay ? '\n' : '') + `[📷 ${attachedImages.length}张图片]`;
  if (hasFiles) userDisplay += (userDisplay ? '\n' : '') + `[📄 ${attachedFiles.map((f) => f.file.name).join('、')}]`;
  appendMessage('user', userDisplay);

  // 清空输入与附件
  dom.chatInput.value = '';
  autoResizeTextarea();
  const images = [...attachedImages];
  const files = [...attachedFiles];
  attachedImages = [];
  attachedFiles = [];
  renderAttachPreview();

  setLoading(true);

  try {
    const summary = getSummaryCallback ? getSummaryCallback() : buildSessionSummary(null);
    let reply;

    if (hasImages) {
      // 带图片 → 多模态 glm-4v-flash
      reply = await sendMultimodal(question, images, files, summary);
    } else {
      // 纯文本/文件 → glm-4-flash
      let fullQuestion = question;
      if (hasFiles) {
        const fileText = files.map((f) => `[文件：${f.file.name}]\n${f.text}`).join('\n\n');
        fullQuestion = fileText + '\n\n' + question;
      }
      reply = await sendToCoach(fullQuestion, summary);
    }

    setLoading(false);
    const bubble = appendMessage('assistant', '');
    typewriterStream(bubble, reply, true);
  } catch (err) {
    setLoading(false);
    const msg = err.name === 'AbortError'
      ? '教练回复超时，请稍后再试。'
      : (err.message || '教练暂时不可用，请稍后再试。');
    appendMessage('assistant', msg);
  }
}

// ---- 初始化 ----

/**
 * 初始化教练对话框（主页内嵌）
 * @param {Function} getSummary 获取当前会话摘要的回调（由 main.js 提供）
 */
export function initCoach(getSummary) {
  cacheDom();
  getSummaryCallback = getSummary;

  if (coachInitialized) return; // 防止重复绑定
  coachInitialized = true;

  // 发送按钮
  dom.chatSendBtn.addEventListener('click', () => handleSend());

  // Enter 发送（Shift+Enter 换行）
  dom.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // 自适应高度
  dom.chatInput.addEventListener('input', autoResizeTextarea);

  // 附件
  dom.chatAttachBtn.addEventListener('click', () => dom.chatFileInput.click());
  dom.chatFileInput.addEventListener('change', handleFileSelect);

  // 快捷术语 chips：点击直接发送
  if (dom.quickChips) {
    dom.quickChips.querySelectorAll('.quick-chip').forEach((chip) => {
      chip.addEventListener('click', () => handleSend(chip.dataset.q));
    });
  }
}

/** 清空对话历史（登出时调用） */
export function clearChatHistory() {
  chatHistory = [];
  attachedImages = [];
  attachedFiles = [];
  coachInitialized = false;
}