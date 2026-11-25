# StudyMate 项目接手说明（给接手方）

最终线上地址：https://studymate-2026.netlify.app

架构：前端是 Vite 构建的静态页面；后端是 Netlify Function，路径 `/api/chat`，负责调用智谱大模型。代码在 GitHub，推送后 Netlify 自动重新部署。

---

## 0. 开始前准备三样东西

| 需要什么 | 用途 | 地址 |
|---|---|---|
| GitHub 账号 | 存放代码 | https://github.com |
| Netlify 账号 | 部署网站 | https://app.netlify.com（用 GitHub 登录最省事） |
| 智谱 API Key | AI 教练调用大模型 | https://open.bigmodel.cn（需实名，`glm-4-flash` 免费） |

---

## 1. 接受 GitHub 仓库转移

1. 你会收到一封 GitHub 邮件，标题包含 **transfer**
2. 点邮件里的链接，或打开 GitHub 通知页接受邀请
3. 页面会让你**输入仓库名 `studymate`** 确认，输入后点确认
4. 完成后仓库地址变成：`https://github.com/你的用户名/studymate`

---

## 2. 接受 Netlify 站点转移

1. 你会收到一封 Netlify 邮件，点 **Accept**
2. 或登录 Netlify 后在通知里接受
3. 完成后你的站点列表里出现 `studymate-2026`，网址不变

---

## 3. 重新关联仓库（关键，不做会断掉自动部署）

仓库换了所有者后，Netlify 原来的授权会失效，必须重连：

1. 进入站点 → **Project configuration**
2. 左侧 **Build & deploy** → **Link repository**
3. 选 **GitHub** → 授权 → 选择 `你的用户名/studymate`
4. 弹出 GitHub 授权页时，选 **Only select repositories** → 勾 `studymate` → Install

---

## 4. 换成你自己的 API Key

1. 打开 https://open.bigmodel.cn → 左侧 **API Keys** → **创建 API Key**
2. **在创建弹窗里立刻复制**（关掉后就看不清完整值了）
3. 回到 Netlify → **Project configuration** → **Environment variables**
4. 按下表修改或新增三条：

| 键 | 值 | 是否勾选「包含秘密值」 |
|---|---|---|
| `LLM_API_KEY` | 你刚复制的 Key | ✅ 勾选 |
| `LLM_BASE_URL` | `https://open.bigmodel.cn/api/paas/v4` | ❌ 不勾 |
| `LLM_MODEL` | `glm-4-flash` | ❌ 不勾 |

> `glm-4-flash` 第二个字符是**小写字母 l**，不是数字 1，也不是大写 I。

---

## 5. 部署并验证

1. 左侧 **Deploys** → 右上角 **Trigger deploy** → **Deploy project without cache**
2. 等状态变成 **Published**
3. 打开 `https://studymate-2026.netlify.app`，应看到登录页
4. 验证后端：浏览器访问 `https://studymate-2026.netlify.app/api/chat`
   正常返回：`{"error":"METHOD_NOT_ALLOWED","message":"仅支持 POST 请求"}`
5. 验证 AI：进站点 → 游客演示 → AI 教练 → 发一句话，能回复即正常

---

## 6. 以后怎么改代码

首次拉取（私有仓库，需先确认你已被加入）：

```powershell
git clone https://github.com/你的用户名/studymate.git
cd studymate
npm install
npm run dev
```

本地预览：http://127.0.0.1:5173

改完发布：

```powershell
git add .
git commit -m "改了什么"
git push
```

推送后 Netlify 自动重新构建，不需要手动操作。

---

## 7. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 部署失败，提示 `secrets detected` | 把 `LLM_MODEL` 或 `LLM_BASE_URL` 勾成了「包含秘密值」 | 取消这两个的勾选，只保留 `LLM_API_KEY` |
| 打开网站要求登录 Netlify | 站点被设成私有 | Project configuration → Access & security → 改为 Public |
| AI 回复「教练暂时不可用」 | Key 无效，或改了环境变量没重新部署 | 换有效 Key，然后 Trigger deploy |
| AI 报模型不存在 | `LLM_MODEL` 拼错 | 确认是 `glm-4-flash` |
| 摄像头开启后卡顿 | 浏览器未启用跨域隔离 | 项目已在 `netlify.toml` 配好响应头，正常不应出现 |

---

## 8. 关于腾讯云 EdgeOne

之前尝试过 EdgeOne Pages 部署。它的默认域名只有 3 小时预览，长期使用需要买域名并备案，所以最终改用 Netlify。你账号下的 EdgeOne 项目如果不需要，可以直接在控制台删除。

---

## 9. 需要注意

- 之前用过的 API Key 已泄露，务必作废并重新生成
- 仓库是私有的，`.gitignore` 已排除 `api/.env`、`node_modules`、`dist`，不会把密钥传上去
- 项目涉及摄像头与人脸检测，但视频帧只在浏览器本地处理，不上传、不落盘
