/**
 * Netlify Functions：AI 教练代理（由 api/chat.js 适配）
 *
 * 访问路径：/api/chat（由 netlify.toml 的 redirect 转发到 /.netlify/functions/chat）
 * 运行时：Node.js 20，函数请求体上限 6MB
 *
 * 安全要点（与 api/chat.js 一致）：
 * - API Key 仅存在于 Netlify 环境变量，绝不下发前端
 * - 请求体大小限制：纯文本 4KB / 多模态 5MB
 * - 简单频率限制（每 IP 每分钟 10 次）
 * - 服务端不记录 prompt 与回复内容
 */

// ---- 第 12.1 章系统提示词（逐字使用） ----
const SYSTEM_PROMPT = `你是 StudyMate 的学习教练，服务对象是正在自主学习的学生。

【你的角色】
你不是监督者，而是教练。你不评判学生，只基于数据给出具体、可执行、温和的建议。
【你掌握的数据】
用户消息中会附带一段 JSON，包含本次学习的时长、各状态占比、疲劳次数、离座次数、最长连续专注时长、状态时间线，以及最近几次学习的摘要。
【回答规则】
1. 任何涉及用户状态的结论，必须引用 JSON 中的具体数字，禁止编造。
2. 不要输出"专注度分数"，也不要给学生贴标签（如"你注意力很差"）。
3. 建议必须具体到可执行：说"每 25 分钟休息 5 分钟"，不说"要注意休息"。
4. 单次回答控制在 200 字以内，除非用户要求详细展开。
5. 若数据不足以回答，直接说明缺什么，不要猜测。
6. 涉及学习方法时，优先引用提供的知识库片段，并说明依据。
7. 语气：平等、简洁、不夸张、不说教。不使用"加油""你真棒"这类空话。
【边界】
- 不提供医疗或心理诊断建议。若用户表达明显的身心困扰，建议其寻求专业帮助。
- 不讨论与学习状态、学习方法无关的话题，礼貌拉回。`;

// ---- 多模态系统提示词（图片识别场景） ----
const VLM_SYSTEM_PROMPT = `你是 StudyMate 的学习教练。用户发送了图片（可能是学习任务、题目、计划表、课程表等）。
【你的任务】
1. 识别图片中的学习任务/题目/计划表内容。
2. 给出结构化分析：任务拆解、优先级建议、时间安排。
3. 如果是题目，给出解题思路（不必直接给答案，引导思考）。
4. 如果是计划表，评估合理性并给出改进建议。
【格式要求】
- 涉及学习目标/任务时，输出分阶段列表（阶段目标、时长建议、休息安排），使用 Markdown 格式。
- 语气：平等、简洁、温和。
- 单次回答控制在 300 字以内。`;

// ---- 频率限制（每 IP 每分钟 10 次） ----
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);
  if (!record || now - record.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return false;
  }
  record.count++;
  return record.count > RATE_LIMIT_MAX;
}

// ---- 请求体大小限制 ----
const MAX_TEXT_BODY = 4 * 1024;
const MAX_MULTIMODAL_BODY = 5 * 1024 * 1024;

function json(payload, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  };
}

// ---- LLM 调用（OpenAI 兼容协议） ----
async function callLLM(messages, model, maxTokens = 500) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const useModel = model || process.env.LLM_MODEL || 'deepseek-chat';

  if (!apiKey) {
    throw Object.assign(new Error('缺少 LLM_API_KEY 环境变量'), { code: 'NO_API_KEY' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: useModel,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw Object.assign(new Error(`LLM API 返回 ${resp.status}`), { code: 'LLM_ERROR', status: resp.status, detail: text });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      throw Object.assign(new Error('LLM 返回内容为空'), { code: 'LLM_EMPTY' });
    }
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

// ---- 函数入口（Netlify 事件格式） ----
export const handler = async (event) => {
  const method = event.httpMethod;

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: {}, body: '' };
  }

  if (method !== 'POST') {
    return json({ error: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' }, 405);
  }

  const ip = event.headers['x-nf-client-connection-ip']
    || event.headers['client-ip']
    || 'unknown';
  if (isRateLimited(ip)) {
    return json({ error: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' }, 429);
  }

  const isMultimodalReq = event.headers['x-multimodal'] === '1';
  const bodySize = Number(event.headers['content-length'] || 0);
  const maxBodySize = isMultimodalReq ? MAX_MULTIMODAL_BODY : MAX_TEXT_BODY;
  if (bodySize > maxBodySize) {
    return json({ error: 'PAYLOAD_TOO_LARGE', message: '请求体过大' }, 413);
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json({ error: 'BAD_REQUEST', message: '请求体不是合法 JSON' }, 400);
  }

  const { messages, userMessage, multimodalContent, username } = body || {};

  let systemPrompt = SYSTEM_PROMPT;
  if (username) {
    systemPrompt += `\n\n【当前用户】${username}`;
  }

  // 多模态请求：带图片 → VLM 模型（glm-4v-flash）
  if (multimodalContent && Array.isArray(multimodalContent) && multimodalContent.length > 0) {
    const vlmModel = process.env.VLM_MODEL || 'glm-4v-flash';
    const llmMessages = [
      { role: 'system', content: VLM_SYSTEM_PROMPT },
      ...(Array.isArray(messages) ? messages.slice(-10) : []),
      { role: 'user', content: multimodalContent },
    ];

    try {
      const reply = await callLLM(llmMessages, vlmModel, 800);
      return json({ reply });
    } catch (err) {
      console.error(`[StudyMate] /api/chat 多模态错误 [${err.code || 'UNKNOWN'}]:`, err.status || '', err.message);
      const friendlyMessage = err.code === 'NO_API_KEY'
        ? '教练服务未配置，请联系管理员。'
        : err.name === 'AbortError'
          ? '图片分析超时，请稍后再试。'
          : '图片分析暂时不可用，请稍后再试。';
      return json({ error: 'COACH_UNAVAILABLE', message: friendlyMessage }, 503);
    }
  }

  if (!userMessage || typeof userMessage !== 'string') {
    return json({ error: 'BAD_REQUEST', message: '缺少 userMessage 字段' }, 400);
  }

  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(messages) ? messages.slice(-10) : []),
    { role: 'user', content: userMessage },
  ];

  try {
    const reply = await callLLM(llmMessages, null);
    return json({ reply });
  } catch (err) {
    console.error(`[StudyMate] /api/chat 错误 [${err.code || 'UNKNOWN'}]:`, err.status || '', err.message);
    const friendlyMessage = err.code === 'NO_API_KEY'
      ? '教练服务未配置，请联系管理员。'
      : err.name === 'AbortError'
        ? '教练回复超时，请稍后再试。'
        : '教练暂时不可用，请稍后再试。';
    return json({ error: 'COACH_UNAVAILABLE', message: friendlyMessage }, 503);
  }
};
