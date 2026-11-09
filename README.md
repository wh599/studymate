# StudyMate — 桌前学习状态守护

基于浏览器的端侧学习状态监测工具：摄像头画面仅在本地处理，实时计算 EAR（眼睛纵横比）、头部姿态角、人脸占比等指标，检测疲劳/分心/离席状态并生成会话报告与 AI 建议。

## 技术栈

- Vite 5 + 原生 JavaScript（ES Module，无框架）
- MediaPipe Face Landmarker（@mediapipe/tasks-vision 0.10.x，WASM 端侧推理）
- Node.js 20（Serverless 代理，M5 实现）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev

# 3. 浏览器访问
http://localhost:5173
```

构建生产版本：

```bash
npm run build
npm run preview
```

## 环境变量

复制 `.env.example` 为 `.env` 并填写：

| 变量 | 说明 |
|------|------|
| LLM_API_KEY | 大模型 API Key（仅服务端使用） |
| LLM_BASE_URL | 大模型 API 地址 |
| LLM_MODEL | 模型名称 |

> AI 教练功能（M5）才需要这些变量，M1 阶段无需配置。

## 运行验证（M1）

1. 打开页面，阅读隐私说明卡片
2. 点击「同意并开始」
3. 点击「开启摄像头」，允许浏览器摄像头权限
4. 正对摄像头，观察：
   - 视频画面上叠加 478 个绿色面部关键点、12 个蓝色眼部关键点
   - 右侧指标面板实时显示 EAR / pitch / yaw / faceRatio
   - 前 3 秒完成基线校准，控制台输出 `baselineEar` 与自适应阈值
5. 打开浏览器控制台（F12），每秒可见：
   `[StudyMate] EAR: x | pitch: x° | yaw: x° | faceRatio: x | fps: x`
6. 闭眼测试：闭眼 2 秒以上，EAR 下降，闭眼判定显示「是」
7. 转头测试：左右转头，yaw 角变化明显；低头抬头，pitch 角变化明显
8. FPS 应稳定在 12-15 之间

## 隐私声明

- 视频帧仅在浏览器内存中处理，绝不上传、绝不落盘
- 仅结构化事件摘要（时间戳、状态、指标）存于 localStorage
- 可随时在设置中清除全部本地数据

## 项目结构

```
src/
├── camera.js        摄像头采集
├── vision.js        MediaPipe 面部关键点检测
├── metrics.js       EAR/姿态角/faceRatio/PERCLOS 计算
├── detectors.js     持续条件检测器
├── stateMachine.js  状态机
├── session.js       会话管理
├── report.js        报告生成
├── coach.js         AI 教练
├── storage.js       本地存储
├── demoData.js      演示数据
├── config.js        全局配置（唯一阈值来源）
├── main.js          入口与检测循环
└── knowledge/       学习科学知识库
api/chat.js          Serverless 代理（M5）
```

## 里程碑

- [x] M1 脚手架 + 摄像头 + 关键点 + 实时指标
- [ ] M2 状态检测与状态机
- [ ] M3 会话与存储
- [ ] M4 报告生成（ECharts）
- [ ] M5 AI 教练
- [ ] M6 演示模式
- [ ] M7 打磨与测试
- [ ] M8 交付