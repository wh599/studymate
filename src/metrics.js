// ===== 指标计算：EAR / 姿态角 / faceRatio / PERCLOS（第 10.3 章） =====

// ---- MediaPipe Face Landmarker 眼部六点索引 ----
// 左眼：p1=33(内角) p2=160(上) p3=158(上) p4=133(外角) p5=153(下) p6=144(下)
const LEFT_EYE = [33, 160, 158, 133, 153, 144];
// 右眼：p1=362(内角) p2=385(上) p3=387(上) p4=263(外角) p5=373(下) p6=380(下)
const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

// 所有眼部关键点索引（供绘制高亮用）
export const EYE_LANDMARK_INDICES = [...LEFT_EYE, ...RIGHT_EYE];

/**
 * 计算单眼 EAR
 * 公式：EAR = (|p2−p6| + |p3−p5|) / (2 × |p1−p4|)
 * @param {Array<{x,y,z}>} sixPoints 六个关键点 [p1..p6]
 * @returns {number}
 */
function singleEAR(sixPoints) {
  const [p1, p2, p3, p4, p5, p6] = sixPoints;
  // 两段垂直距离（2D 投影即可，归一化坐标）
  const v1 = Math.hypot(p2.x - p6.x, p2.y - p6.y); // |p2 - p6|
  const v2 = Math.hypot(p3.x - p5.x, p3.y - p5.y); // |p3 - p5|
  // 水平距离
  const h = Math.hypot(p1.x - p4.x, p1.y - p4.y);   // |p1 - p4|
  if (h < 1e-6) return 0; // 防除零
  return (v1 + v2) / (2 * h);
}

/**
 * 计算双眼平均 EAR（眼睛纵横比）
 * @param {Array<{x,y,z}>} landmarks 478 个归一化关键点
 * @returns {number} EAR 值，睁眼约 0.25~0.35，闭眼约 <0.1
 */
export function calcEAR(landmarks) {
  const left = singleEAR(LEFT_EYE.map((i) => landmarks[i]));
  const right = singleEAR(RIGHT_EYE.map((i) => landmarks[i]));
  return (left + right) / 2;
}

/**
 * 从 3D 关键点解算头部姿态欧拉角（面部法向量法）
 *
 * 原理：用右眼外角→左眼外角向量（rightAxis）与下巴→额头向量（upAxis）
 * 的叉积求面部法向量（forward），再从法向量分解出 pitch / yaw。
 *
 * MediaPipe 归一化坐标：x 向右，y 向下，z 负值朝摄像头
 * - 正视摄像头时 forward ≈ (0, 0, -1)
 * - 低头时法向量 y 分量变正 → pitch 正值 = 低头
 * - 头向图像右侧转时法向量 x 分量变正 → yaw 正值 = 人物左转
 *
 * 相比变换矩阵法（asin(-m[9])），此方法不依赖矩阵主序假设，
 * 数值直接来自关键点 3D 坐标，量级可靠。
 *
 * @param {Array<{x:number,y:number,z:number}>} landmarks 478 个归一化关键点
 * @returns {{pitch: number, yaw: number}} 角度（度）
 */
export function calcHeadPose(landmarks) {
  if (!landmarks || landmarks.length < 468) return { pitch: 0, yaw: 0 };

  // 关键点索引（MediaPipe Face Mesh）
  const rightEye = landmarks[33];   // 右眼外角（图像左侧）
  const leftEye  = landmarks[263];  // 左眼外角（图像右侧）
  const chin     = landmarks[152];  // 下巴
  const forehead = landmarks[10];   // 额头顶部

  // 面部局部坐标系
  const rx = leftEye.x - rightEye.x;
  const ry = leftEye.y - rightEye.y;
  const rz = leftEye.z - rightEye.z;
  const ux = forehead.x - chin.x;
  const uy = forehead.y - chin.y;
  const uz = forehead.z - chin.z;

  // 面部法向量 forward = rightAxis × upAxis
  const fx = ry * uz - rz * uy;
  const fy = rz * ux - rx * uz;
  const fz = rx * uy - ry * ux;

  const len = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (len < 1e-8) return { pitch: 0, yaw: 0 };

  const nx = fx / len;
  const ny = fy / len;
  const nz = fz / len;

  // pitch：法向量 y 分量，低头为正（MediaPipe y 轴向下）
  const pitchRad = Math.asin(Math.max(-1, Math.min(1, ny)));
  // yaw：法向量在 x-z 平面的方位角（正视时 nz≈-1，取 -nz 使正视时 yaw=0）
  const yawRad = Math.atan2(nx, -nz);

  const RAD2DEG = 180 / Math.PI;
  return {
    pitch: pitchRad * RAD2DEG,
    yaw: yawRad * RAD2DEG,
  };
}

/**
 * 从面部变换矩阵解算头部姿态欧拉角（第 10.3 章推荐方法）
 *
 * MediaPipe facialTransformationMatrixes 返回列主序 4x4 矩阵（data: Float32Array(16)）。
 * 旋转部分按 ZYX 分解：
 *   pitch = asin(-m[9])          // 上下点头，低头为正
 *   yaw   = atan2(m[8], m[10])   // 左右转头
 *
 * 相比关键点法向量法，矩阵法由 MediaPipe 内部求解，不依赖归一化 z 值，
 * 精度更高、波动更小（项目书允许误差 ±3°）。
 *
 * @param {Float32Array|null} matrix 列主序 4x4 变换矩阵
 * @returns {{pitch: number, yaw: number}|null} 角度（度），矩阵无效时返回 null
 */
export function calcHeadPoseFromMatrix(matrix) {
  if (!matrix || matrix.length < 16) return null;
  const pitchRad = Math.asin(Math.max(-1, Math.min(1, -matrix[9])));
  const yawRad = Math.atan2(matrix[8], matrix[10]);
  const RAD2DEG = 180 / Math.PI;
  return {
    pitch: pitchRad * RAD2DEG,
    yaw: yawRad * RAD2DEG,
  };
}

/**
 * 计算人脸框高度占画面高度的比例
 * @param {Array<{x,y,z}>} landmarks 478 个归一化关键点（y ∈ [0,1]）
 * @returns {number} 0~1，越大表示脸离摄像头越近
 */
export function calcFaceRatio(landmarks) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const pt of landmarks) {
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return maxY - minY;
}

/**
 * 计算人脸包围盒（归一化坐标，供手部触碰判定用）
 * @param {Array<{x,y,z}>} landmarks 478 个归一化关键点
 * @returns {{minX:number, minY:number, maxX:number, maxY:number}}
 */
export function calcFaceBoundingBox(landmarks) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const pt of landmarks) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 创建 PERCLOS 滑动窗口追踪器
 * 维护 windowSec 秒的布尔队列（每帧是否闭眼），perclos = 闭眼帧数 / 总帧数
 * @param {number} windowSec 窗口时长（秒），默认 60
 * @returns {{update(closed:boolean, nowMs:number):void, getPerclos():number, reset():void}}
 */
export function createPerclosTracker(windowSec = 60) {
  const windowMs = windowSec * 1000;
  const queue = []; // { ts, closed }

  return {
    /** 追加一帧的闭眼判定，并淘汰窗口外的旧数据 */
    update(closed, nowMs) {
      queue.push({ ts: nowMs, closed });
      while (queue.length > 0 && nowMs - queue[0].ts > windowMs) {
        queue.shift();
      }
    },
    /** 获取当前 PERCLOS 值（0~1） */
    getPerclos() {
      if (queue.length === 0) return 0;
      let closedCount = 0;
      for (const e of queue) {
        if (e.closed) closedCount++;
      }
      return closedCount / queue.length;
    },
    /** 重置窗口 */
    reset() {
      queue.length = 0;
    },
  };
}