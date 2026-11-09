// ===== 所有阈值参数的唯一来源（第 11 章 算法参数汇总） =====
// 硬性要求：阈值不得散落在代码各处，一律从此文件读取。

export const CONFIG = {
  // ---- 采集 ----
  VIDEO_WIDTH: 640,
  VIDEO_HEIGHT: 480,
  TARGET_FPS: 15,

  // ---- 眼睛 ----
  EAR_THRESHOLD: 0.18,        // 低于此值判为闭眼
  EYE_CLOSE_SEC: 1.5,         // 持续闭眼判定秒数
  PERCLOS_WINDOW_SEC: 60,     // PERCLOS 滑动窗口时长
  PERCLOS_THRESHOLD: 0.30,    // PERCLOS 超此占比判为疲劳

  // ---- 头部姿态（角度，单位：度） ----
  PITCH_THRESHOLD: 18,        // 俯仰角超此值判为低头（原 25，调低提高灵敏度）
  YAW_THRESHOLD: 22,          // 偏航角绝对值超此值判为转头（原 30，调低提高灵敏度）
  HEAD_DOWN_SEC: 1.5,         // 低头持续秒数（原 3，缩短加快响应）
  HEAD_TURN_SEC: 1.5,         // 转头持续秒数（原 3，缩短加快响应）

  // ---- 距离 ----
  FACE_RATIO_THRESHOLD: 0.55, // 人脸框高/画面高超此值判为距离过近
  CLOSE_SEC: 3,               // 距离过近持续秒数（原 5，缩短加快响应）

  // ---- 玩手机（手部检测辅助识别） ----
  PHONE_SEC: 2,               // 手在面部下方持续秒数判为玩手机
  PHONE_HAND_Y_MAX: 0.85,     // 手掌中心 y 上限（排除手在画面最底部的写字/打字）

  // ---- 触碰面部（扣脸/挠头/摸脸） ----
  TOUCH_FACE_SEC: 2,          // 手触碰面部持续秒数
  TOUCH_FACE_MARGIN: 0.06,    // 面部包围盒外扩边距（归一化）

  // ---- 手靠近嘴部（喝水/进食） ----
  HAND_MOUTH_SEC: 2,          // 手靠近嘴部持续秒数
  MOUTH_DIST_THRESHOLD: 0.10, // 指尖到嘴部归一化距离阈值

  // ---- 抬头仰视 ----
  LOOK_UP_THRESHOLD: -20,     // 俯仰角低于此值判为抬头（负值=仰视）
  LOOK_UP_SEC: 3,             // 抬头持续秒数

  // ---- 长时间盯屏（无眨眼） ----
  STARE_SEC: 20,              // 无眨眼持续秒数判为盯屏（正常人3~4秒眨一次）

  // ---- 状态机 ----
  ABSENCE_SEC: 10,            // 连续无人脸秒数判为离座
  STATE_HOLD_SEC: 1,          // 状态切换滞回秒数（原 2，缩短加快响应）

  // ---- 基线校准 ----
  CALIBRATION_SEC: 3,         // 启动时采集静息 EAR 的时长
  EAR_BASELINE_RATIO: 0.65,   // 阈值 = 静息EAR × 0.65（不低于 0.15）
};

// ---- 本地存储键名 ----
export const STORAGE_KEYS = {
  CONSENT: 'studymate_consented',   // 隐私同意标记
  SETTINGS: 'studymate_settings',   // 用户行为判定设置
  THRESHOLDS: 'studymate_thresholds', // 检测阈值覆盖（滑块设置）
};

/**
 * 生成按用户名隔离的往期记录存储键
 * 规约：localStorage 键 studymaterecords{username}
 * @param {string} username 当前登录用户名
 * @returns {string} 如 'studymaterecordsdemo'
 */
export function recordsKey(username) {
  return `studymaterecords${username || 'guest'}`;
}

// ---- 行为定义（用户可在设置页勾选归类） ----
// key 与状态机 reason 一致；category: 'distracted' | 'fatigued' | 'none'
export const BEHAVIOR_DEFINITIONS = [
  { key: 'head_down',       label: '低头',           detect: '头部俯仰角',   defaultCategory: 'distracted' },
  { key: 'head_turn',       label: '转头',           detect: '头部偏航角',   defaultCategory: 'distracted' },
  { key: 'too_close',       label: '距离屏幕过近',    detect: '人脸占比',     defaultCategory: 'distracted' },
  { key: 'phone_use',       label: '看手机',         detect: '手部检测',     defaultCategory: 'distracted' },
  { key: 'touch_face',      label: '触碰面部（扣脸/挠头）', detect: '手部检测', defaultCategory: 'distracted' },
  { key: 'hand_near_mouth', label: '手靠近嘴部（喝水/进食）', detect: '手部检测', defaultCategory: 'none' },
  { key: 'look_up',         label: '抬头仰视',       detect: '头部俯仰角',   defaultCategory: 'none' },
  { key: 'eye_closed',      label: '闭眼',           detect: '眼睛纵横比',   defaultCategory: 'fatigued' },
  { key: 'perclos',         label: 'PERCLOS 疲劳',   detect: '闭眼占比',     defaultCategory: 'fatigued' },
  { key: 'stare_screen',    label: '长时间盯屏',     detect: '眨眼频率',     defaultCategory: 'fatigued' },
];

// ---- 检测阈值滑块定义（设置侧滑面板用） ----
// 用户可通过滑块调整，存 localStorage 覆盖 CONFIG 默认值
export const THRESHOLD_DEFINITIONS = [
  {
    key: 'EAR_THRESHOLD',
    label: '闭眼判定阈值（EAR）',
    desc: '低于此值判为闭眼，越小越宽松',
    min: 0.10, max: 0.30, step: 0.01,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'PITCH_THRESHOLD',
    label: '低头判定角度（°）',
    desc: '俯仰角超此值判为低头，越小越灵敏',
    min: 10, max: 35, step: 1,
    format: (v) => `${v}°`,
  },
  {
    key: 'PERCLOS_THRESHOLD',
    label: 'PERCLOS 疲劳占比',
    desc: '60秒窗口内闭眼占比超此值判为疲劳',
    min: 0.15, max: 0.50, step: 0.05,
    format: (v) => `${Math.round(v * 100)}%`,
  },
];