# StudyMate 项目移交清单（给移交方）

目标：把 GitHub 仓库、Netlify 站点、代码全部转到朋友名下，自己彻底脱手。

---

## 1. 转移 GitHub 仓库

1. 打开 `https://github.com/yyzaily/studymate`
2. **Settings** → 页面拉到最底 **Danger Zone**
3. 点 **Transfer ownership**
4. 填朋友的 GitHub 用户名 + 仓库名 `studymate` → 确认
5. **朋友必须在他的邮件里接受**，仓库才真正转过去

转移后：你的仓库列表里不再有它；旧地址 `github.com/yyzaily/studymate` 会自动跳转到新地址。

---

## 2. 转移 Netlify 站点

1. 进入站点 `studymate-2026` → **Project configuration** → **General**
2. 拉到最底 **Danger zone** → **Transfer site**
3. 填朋友的 Netlify 账号邮箱 → 发送
4. **朋友接受后完成**

转移后：你名下不再有该站点；网址 `studymate-2026.netlify.app` 不变，环境变量和部署历史一起转走。

---

## 3. 清理你名下的残留

- [ ] **腾讯云 EdgeOne**：删除你账号下的 `studymate` 项目（那个站点的实名是你，不要留）
- [ ] **GitHub 授权**：打开 https://github.com/settings/installations 卸载 EO Makers、Netlify 等不再需要的 App
- [ ] **智谱**：把之前试过的 Key 在控制台删除/作废
- [ ] **本地文件夹**：`C:\Users\联想\Desktop\王浩` 可删可留，删除不影响线上；`api/.env` 里的 Key 本来就无效

---

## 4. 移交完成确认

全部打勾即代表彻底脱手：

- [ ] GitHub 上你的仓库列表里已看不到 `studymate`
- [ ] Netlify 你的站点列表里已看不到 `studymate-2026`
- [ ] 朋友打开 `https://studymate-2026.netlify.app` 正常
- [ ] 朋友那边 AI 教练能正常回复
- [ ] 腾讯云 EdgeOne 你账号下的项目已删除
- [ ] 旧 API Key 已作废

---

## 5. 注意事项

- 转移后若还需要帮朋友维护，让他把你加为 GitHub Collaborator 或 Netlify Team 成员；不加就是彻底无关
- 对话中出现过的 API Key 已泄露，务必让朋友作废并重新生成
- 本地 `.git` 历史里包含项目书 PDF，仓库是私有的，不存在公开泄露
- 转完不需要再改本地 `git remote`，因为你不再参与维护
