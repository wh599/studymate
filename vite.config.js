import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// ---- 本地 dev 中间件：将 /api/chat 转发给 serverless handler ----
// 生产环境（Vercel）由平台自动路由 /api/*，此插件仅用于本地开发。
function apiServerPlugin() {
  return {
    name: 'studymate-api-dev',
    configureServer(server) {
      // 加载 api/.env（本地开发用，生产环境由平台注入）
      const envPath = path.resolve(__dirname, 'api/.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf-8');
        for (const line of envContent.split('\n')) {
          const trimmed = line.trim();
          // 跳过空行和注释行
          if (!trimmed || trimmed.startsWith('#')) continue;
          // 变量名允许字母/数字/下划线（如 API_KEY_V2）
          const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/);
          if (match && !process.env[match[1]]) {
            let value = match[2];
            // 剥离成对引号（单引号或双引号）
            if (
              (value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))
            ) {
              value = value.slice(1, -1);
            }
            process.env[match[1]] = value;
          }
        }
      }

      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求' }));
          return;
        }

        // 读取请求体
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const bodyStr = Buffer.concat(chunks).toString('utf-8');

        // 通过 Vite SSR 模块加载器导入 handler（支持文件变更后热更新，无需重启 dev server）
        const mod = await server.ssrLoadModule('/api/chat.js');
        const handler = mod.default;

        // 适配 Vite middleware 到 serverless handler 签名
        const fakeReq = {
          method: 'POST',
          headers: req.headers,
          body: bodyStr,
          socket: req.socket,
        };
        const fakeRes = {
          _status: 200,
          _body: null,
          statusCode: 200,
          status(code) { this.statusCode = code; this._status = code; return this; },
          setHeader(k, v) { res.setHeader(k, v); return this; },
          json(obj) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = this._status;
            res.end(JSON.stringify(obj));
          },
        };

        try {
          // handler 内部用 JSON.parse 解析 bodyStr
          fakeReq.body = bodyStr;
          await handler(fakeReq, fakeRes);
        } catch (err) {
          console.error('[StudyMate] dev /api/chat 异常:', err);
          res.statusCode = 503;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'COACH_UNAVAILABLE', message: '教练暂时不可用，请稍后再试。' }));
        }
      });
    },
  };
}

// Vite 配置：原生 ES Module 项目，无框架
export default defineConfig({
  plugins: [apiServerPlugin()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    open: false,
    headers: {
      // 跨域隔离：启用 SharedArrayBuffer（多线程 WASM 需要）。
      // 注意：require-corp 要求所有跨域资源必须携带 CORP 头（如 Access-Control-Allow-Origin），
      // 否则会被浏览器拦截。当前依赖的跨域资源：
      //   - index.html 中的 marked.min.js（jsdelivr CDN，需加 crossorigin="anonymous"）
      //   - vision.js 中的 MediaPipe 模型文件（Google GCS，已带 CORP 头）
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  // 说明：MediaPipe WASM 通过 vision.js 中的 HTTP 路径加载（FilesetResolver），
  // 不走 import 语句，因此无需配置 resolve.alias。
});