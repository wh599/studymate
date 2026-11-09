/**
 * Serverless 代理函数（第 7 章：Node.js 20，第 12 章 AI 教练设计）
 *
 * 安全要点：
 * - API Key 仅存在于服务端环境变量，绝不下发前端
 * - 请求体大小限制 4KB
 * - 简单频率限制（每 IP 每分钟 10 次）
 * - 服务端不记录 prompt 与回复内容（第 15 章隐私约束）
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

// ---- LLM 调用（OpenAI 兼容协议） ----
async function callLLM(messages, model, maxTokens = 500) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const useModel = model || process.env.LLM_MODEL || 'deepseek-chat';

  if (!apiKey) {
    throw Object.assign(new Error('缺少 LLM_API_KEY 环境变量'), { code: 'NO_API_KEY' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000); // 30 秒超时（多模态需更长时间）

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

export default async function handler(req, res) {
  // 仅接受 POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' });
    return;
  }

  // 频率限制
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' });
    return;
  }

  // 请求体大小限制：多模态 10MB，纯文本 4KB
  const isMultimodalReq = req.headers['x-multimodal'] === '1';
  const bodySize = req.headers['content-length'] ? parseInt(req.headers['content-length'], 10) : 0;
  const maxBodySize = isMultimodalReq ? 10 * 1024 * 1024 : 4096;
  if (bodySize > maxBodySize) {
    res.status(413).json({ error: 'PAYLOAD_TOO_LARGE', message: '请求体过大' });
    return;
  }

  // 解析请求体
  let body;
  try {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    body = raw;
  } catch {
    res.status(400).json({ error: 'BAD_REQUEST', message: '请求体不是合法 JSON' });
    return;
  }

  const { messages, userMessage, multimodalContent, username } = body || {};

  // 系统提示词追加用户名
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
      res.status(200).json({ reply });
    } catch (err) {
      console.error(`[StudyMate] /api/chat 多模态错误 [${err.code || 'UNKNOWN'}]:`, err.status || '', err.message);
      const friendlyMessage = err.code === 'NO_API_KEY'
        ? '教练服务未配置，请联系管理员。'
        : err.name === 'AbortError'
          ? '图片分析超时，请稍后再试。'
          : '图片分析暂时不可用，请稍后再试。';
      res.status(503).json({ error: 'COACH_UNAVAILABLE', message: friendlyMessage });
    }
    return;
  }

  // 纯文本请求
  if (!userMessage || typeof userMessage !== 'string') {
    res.status(400).json({ error: 'BAD_REQUEST', message: '缺少 userMessage 字段' });
    return;
  }

  // 组装 LLM messages：系统提示词 + 历史对话 + 用户消息（含数据模板）
  const llmMessages = [
    { role: 'system', content: systemPrompt },
    ...(Array.isArray(messages) ? messages.slice(-10) : []), // 保留最近 10 轮历史
    { role: 'user', content: userMessage },
  ];

  try {
    const reply = await callLLM(llmMessages);
    res.status(200).json({ reply });
  } catch (err) {
    console.error(`[StudyMate] /api/chat 错误 [${err.code || 'UNKNOWN'}]:`, err.status || '', err.message);
    // 不向客户端暴露内部错误细节
    const friendlyMessage = err.code === 'NO_API_KEY'
      ? '教练服务未配置，请联系管理员。'
      : err.name === 'AbortError'
        ? '教练回复超时，请稍后再试。'
        : '教练暂时不可用，请稍后再试。';
    res.status(503).json({ error: 'COACH_UNAVAILABLE', message: friendlyMessage });
  }
}