// ===== 摄像头启停与视频流管理（第 10.1 章） =====

import { CONFIG } from './config.js';

/**
 * 开启前置摄像头并绑定到 video 元素
 * @param {HTMLVideoElement} videoEl
 * @returns {Promise<MediaStream>}
 * @throws {{code: string, message: string}} 带中文信息的错误对象
 */
export async function startCamera(videoEl) {
  const constraints = {
    video: {
      facingMode: 'user',
      width: { ideal: CONFIG.VIDEO_WIDTH },
      height: { ideal: CONFIG.VIDEO_HEIGHT },
    },
    audio: false,
  };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw normalizeCameraError(err);
  }

  videoEl.srcObject = stream;
  // 等待视频元数据就绪后再播放，确保帧可用
  await new Promise((resolve) => {
    if (videoEl.readyState >= 2) return resolve();
    videoEl.addEventListener('loadeddata', resolve, { once: true });
  });
  await videoEl.play().catch(() => {/* autoplay 已通过 muted 属性允许 */});

  return stream;
}

/**
 * 停止视频流，释放摄像头
 * @param {MediaStream} stream
 */
export function stopCamera(stream) {
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}

/**
 * 探测摄像头是否可用（不保持流）
 * @returns {Promise<boolean>}
 */
export async function isCameraAvailable() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

/**
 * 将浏览器原始错误归一化为带中文信息的错误对象
 */
function normalizeCameraError(err) {
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    return {
      code: 'PERMISSION_DENIED',
      message: '摄像头权限被拒绝。请在浏览器地址栏左侧的权限设置中允许访问摄像头，然后重试。',
    };
  }
  if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    return {
      code: 'NOT_FOUND',
      message: '未检测到摄像头设备。请确认设备已连接且未被禁用。',
    };
  }
  if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
    return {
      code: 'IN_USE',
      message: '摄像头被其他程序占用。请关闭正在使用摄像头的应用后重试。',
    };
  }
  return {
    code: 'UNKNOWN',
    message: `摄像头开启失败：${err.message || String(err)}`,
  };
}