// ===== MediaPipe Face Landmarker 封装（第 10.2 章） =====
// 职责：初始化视觉模型 + 逐帧推理，返回 478 关键点与变换矩阵

import { FaceLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// WASM 运行时文件已复制到 public/mediapipe-wasm/（静态目录同源加载，
// 避免 Vite dev server 对 /node_modules/ 路径的模块解析管线干扰 WASM loader）
const WASM_LOCAL_PATH = '/mediapipe-wasm';

// 模型文件已本地化到 public/models/（同源加载，不依赖 Google Storage 等境外 CDN）
const MODEL_URL = '/models/face_landmarker.task';

let landmarkerInstance = null;

/**
 * 初始化 Face Landmarker（单例，重复调用返回同一实例）
 * @returns {Promise<FaceLandmarker>}
 */
export async function initVision() {
  if (landmarkerInstance) return landmarkerInstance;

  let filesetResolver;
  try {
    filesetResolver = await FilesetResolver.forVisionTasks(WASM_LOCAL_PATH);
  } catch (err) {
    console.error('[StudyMate] WASM 运行时加载失败：', err);
    throw new Error('无法加载 MediaPipe WASM 运行时文件，请检查 node_modules/@mediapipe/tasks-vision/wasm 是否存在');
  }

  const createOptions = (delegate) => ({
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO',   // 视频模式，需传入递增时间戳
    numFaces: 1,            // V1 仅支持单人
    outputFacialTransformationMatrixes: true, // 需要变换矩阵来解算头部姿态
    outputFaceBlendshapes: false,
  });

  // 优先 GPU（WebGL）加速，失败时回退 CPU（WASM）
  try {
    landmarkerInstance = await FaceLandmarker.createFromOptions(
      filesetResolver,
      createOptions('GPU')
    );
    console.log('[StudyMate] Face Landmarker 初始化成功（GPU 模式）');
  } catch (gpuErr) {
    console.warn('[StudyMate] GPU 模式初始化失败，回退到 CPU 模式：', gpuErr);
    try {
      landmarkerInstance = await FaceLandmarker.createFromOptions(
        filesetResolver,
        createOptions('CPU')
      );
      console.log('[StudyMate] Face Landmarker 初始化成功（CPU 模式）');
    } catch (cpuErr) {
      console.error('[StudyMate] CPU 模式也初始化失败：', cpuErr);
      throw cpuErr;
    }
  }

  return landmarkerInstance;
}

/**
 * 对当前视频帧执行关键点检测
 * @param {FaceLandmarker} landmarker
 * @param {HTMLVideoElement} videoEl
 * @param {number} timestampMs 递增时间戳（performance.now()），避免 MediaPipe 报错
 * @returns {{
 *   landmarks: Array<{x:number,y:number,z:number}>|null,  // 478 点归一化坐标
 *   transformMatrix: Float32Array|null,                     // 4x4 列主序，用于求头部姿态
 *   faceDetected: boolean
 * }}
 */
export function detectFrame(landmarker, videoEl, timestampMs) {
  const result = landmarker.detectForVideo(videoEl, timestampMs);

  const faceDetected =
    result.faceLandmarks && result.faceLandmarks.length > 0;

  const transformMatrix =
    result.facialTransformationMatrixes &&
    result.facialTransformationMatrixes.length > 0
      ? result.facialTransformationMatrixes[0].data
      : null;

  return {
    landmarks: faceDetected ? result.faceLandmarks[0] : null,
    transformMatrix,
    faceDetected,
  };
}

/**
 * 释放模型资源
 */
export function closeVision() {
  if (landmarkerInstance) {
    landmarkerInstance.close();
    landmarkerInstance = null;
  }
  closeHandVision();
}

// ===== 手部检测（玩手机识别用，与 FaceLandmarker 同包，无新增依赖） =====

// 手部模型同样本地化到 public/models/（同源加载）
const HAND_MODEL_URL = '/models/hand_landmarker.task';

let handLandmarkerInstance = null;

/**
 * 初始化 Hand Landmarker（单例，重复调用返回同一实例）
 * 用于检测手部关键点，辅助识别"玩手机"分心行为。
 * @returns {Promise<HandLandmarker|null>} 初始化失败返回 null（不阻塞主流程）
 */
export async function initHandVision() {
  if (handLandmarkerInstance) return handLandmarkerInstance;

  let filesetResolver;
  try {
    filesetResolver = await FilesetResolver.forVisionTasks(WASM_LOCAL_PATH);
  } catch (err) {
    console.warn('[StudyMate] 手部模型 WASM 加载失败，玩手机检测不可用：', err);
    return null;
  }

  const createOptions = (delegate) => ({
    baseOptions: {
      modelAssetPath: HAND_MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: 2,   // 最多检测两只手
  });

  // 优先 GPU，失败回退 CPU，再失败返回 null（不阻塞主流程）
  try {
    handLandmarkerInstance = await HandLandmarker.createFromOptions(
      filesetResolver,
      createOptions('GPU')
    );
    console.log('[StudyMate] Hand Landmarker 初始化成功（GPU 模式）');
  } catch (gpuErr) {
    console.warn('[StudyMate] 手部模型 GPU 失败，尝试 CPU：', gpuErr);
    try {
      handLandmarkerInstance = await HandLandmarker.createFromOptions(
        filesetResolver,
        createOptions('CPU')
      );
      console.log('[StudyMate] Hand Landmarker 初始化成功（CPU 模式）');
    } catch (cpuErr) {
      console.warn('[StudyMate] 手部模型初始化失败，玩手机检测不可用：', cpuErr);
      return null;
    }
  }

  return handLandmarkerInstance;
}

/**
 * 对当前视频帧执行手部关键点检测
 * @param {HandLandmarker} handLandmarker
 * @param {HTMLVideoElement} videoEl
 * @param {number} timestampMs 递增时间戳
 * @returns {Array<Array<{x:number,y:number,z:number}>>|null} 每只手 21 个关键点，无手时返回空数组
 */
export function detectHands(handLandmarker, videoEl, timestampMs) {
  if (!handLandmarker) return [];
  const result = handLandmarker.detectForVideo(videoEl, timestampMs);
  if (!result.landmarks || result.landmarks.length === 0) return [];
  return result.landmarks;
}

/**
 * 释放手部模型资源
 */
export function closeHandVision() {
  if (handLandmarkerInstance) {
    handLandmarkerInstance.close();
    handLandmarkerInstance = null;
  }
}