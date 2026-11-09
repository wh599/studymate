// ===== 知识库条目与检索函数（FR-08，第 12.3 章） =====
// 内置 10 条学习科学知识条目，检索策略：标签+标题+正文关键词匹配。
// 命中则取前 3 条，未命中取 kb-01、kb-02、kb-06 作为默认。

/**
 * 知识库条目（第 12.3 章，与 entries.md 同步）
 */
export const KNOWLEDGE_ENTRIES = [
  { id: 'kb-01', title: '番茄工作法', tags: ['时间管理', '专注'], content: '25 分钟专注 + 5 分钟休息，4 个番茄后休息 15-30 分钟；适合易分心者。' },
  { id: 'kb-02', title: '认知负荷理论', tags: ['理论', '难度'], content: '内在/外在/相关负荷；降低外在负荷（整洁环境、单一任务）可释放工作记忆。' },
  { id: 'kb-03', title: '间隔重复', tags: ['记忆', '复习'], content: '遗忘曲线；复习间隔 1 天、3 天、7 天、15 天效果最佳。' },
  { id: 'kb-04', title: '日节律与认知高峰', tags: ['节律', '规划'], content: '多数人上午 9-11 点认知资源最充足，适合高难度任务。' },
  { id: 'kb-05', title: '自我决定理论', tags: ['动机', '理论'], content: '自主、胜任、归属三种基本需求；外部监控会削弱自主感与内在动机。' },
  { id: 'kb-06', title: '注意力恢复理论', tags: ['疲劳', '休息'], content: '持续定向注意会疲劳，接触自然或短暂放空可恢复。' },
  { id: 'kb-07', title: '任务拆解', tags: ['拖延', '执行'], content: '把任务拆到 15 分钟内可完成的粒度，降低启动阻力。' },
  { id: 'kb-08', title: '睡眠与学习巩固', tags: ['睡眠', '记忆'], content: '睡眠不足显著降低工作记忆与注意持续性；建议 7-9 小时。' },
  { id: 'kb-09', title: '手机与分心', tags: ['手机', '分心'], content: '手机移出视线范围可使分心次数下降约一半。' },
  { id: 'kb-10', title: '疲劳的早期信号', tags: ['疲劳', '信号'], content: '频繁眨眼、揉眼、低头、坐姿塌陷是疲劳的早期外显信号。' },
];

// 默认检索结果（第 12.3 章：未命中取 kb-01、kb-02、kb-06）
const DEFAULT_ENTRY_IDS = ['kb-01', 'kb-02', 'kb-06'];

/**
 * 按关键词检索知识条目（第 12.3 章检索规则）
 * 对用户问题做关键词匹配（标签+标题+正文包含），命中则取前 3 条，
 * 未命中取 kb-01、kb-02、kb-06 作为默认。
 * @param {string} query 用户问题
 * @returns {Array<Object>} 匹配的知识条目（最多 3 条）
 */
export function searchKnowledge(query) {
  if (!query || typeof query !== 'string') {
    return DEFAULT_ENTRY_IDS.map((id) => KNOWLEDGE_ENTRIES.find((e) => e.id === id));
  }

  const q = query.toLowerCase();

  // 从问题中提取关键词（按标点/空格切分，保留 2 字以上的片段）
  const keywords = q
    .split(/[，。？！、；：""''（）\s,.?!;:()]+/)
    .filter((k) => k.length >= 2);

  // 逐条匹配：标签命中权重 3，标题命中权重 2，正文命中权重 1
  const scored = [];
  for (const entry of KNOWLEDGE_ENTRIES) {
    let score = 0;
    const title = entry.title.toLowerCase();
    const content = entry.content.toLowerCase();

    // 标签匹配（双向包含：问题含标签，或标签含关键词）
    for (const tag of entry.tags) {
      const t = tag.toLowerCase();
      if (q.includes(t)) {
        score += 3;
      } else {
        for (const kw of keywords) {
          if (t.includes(kw) || kw.includes(t)) {
            score += 3;
            break;
          }
        }
      }
    }

    // 标题匹配（双向包含）
    if (q.includes(title)) {
      score += 2;
    } else {
      for (const kw of keywords) {
        if (title.includes(kw) || kw.includes(title)) {
          score += 2;
          break;
        }
      }
    }

    // 正文匹配（正文包含问题关键词）
    for (const kw of keywords) {
      if (content.includes(kw)) {
        score += 1;
      }
    }

    if (score > 0) scored.push({ entry, score });
  }

  if (scored.length === 0) {
    return DEFAULT_ENTRY_IDS.map((id) => KNOWLEDGE_ENTRIES.find((e) => e.id === id));
  }

  // 按得分降序，取前 3
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.entry);
}