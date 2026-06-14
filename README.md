# Gesture Stage

一个基于手势控制的交互式视觉舞台，使用 MediaPipe 和 Canvas 2D 构建。

![Gesture Stage](https://img.shields.io/badge/Platform-Web-blue)
![MediaPipe](https://img.shields.io/badge/MediaPipe-0.10.14-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ 功能特性

### 🖐️ 单手手势
| 手势 | 效果 |
|------|------|
| 👋 Open Palm | 粒子爆发，长按打开菜单 |
| ✊ Fist | 聚焦收缩效果 |
| ✌️ Peace | 双流上升效果 |
| ☝️ Point | 拖尾光效（💗✨ 粒子） |
| 🤏 Pinch | 精确环形效果 |
| 👋 Wave | 切换主题颜色 |

### 🤲 双手交互
| 手势 | 效果 |
|------|------|
| 🖼️ Frame Drag | 取景框手势拖拽（拇指食指张开，其他手指弯曲） |
| 🔮 Energy Ball | 双手靠近充电，分开发射能量球 |

### 🎯 空间菜单
- Open Palm 长按 620ms 打开径向菜单
- 5 个功能：主题切换、清除、Orb 演示、Frame 演示、关闭
- Pinch 确认选择

## 🚀 快速开始

### 前置要求
- 现代浏览器（Chrome、Firefox、Edge）
- 摄像头（用于手势检测，Demo 模式不需要）

### 安装运行

```bash
# 1. 克隆仓库
git clone https://github.com/zzzhang-ai/gesture-stage.git
cd gesture-stage

# 2. 启动本地服务器（任选一种）

# 方式 A: Python（推荐，系统自带）
python3 -m http.server 8000

# 方式 B: Node.js
npx serve -l 8000

# 方式 C: PHP
php -S localhost:8000

# 3. 打开浏览器访问
open http://localhost:8000
# 或手动打开 Chrome/Firefox 访问 http://localhost:8000
```

### ⚠️ 重要说明

**必须通过 HTTP 服务器访问**，不能直接双击 `index.html` 打开！

原因：浏览器安全策略限制，直接打开文件无法加载 MediaPipe 模型。

### Demo 模式（无需摄像头）

页面底部有 8 个 Demo 按钮，点击即可体验各种效果：
- **Palm** - 粒子爆发
- **Fist** - 聚焦收缩
- **Peace** - 双流上升
- **Point** - 拖尾光效
- **Pinch** - 环形效果
- **Frame** - Frame 拖拽
- **Orb** - 能量球
- **Menu** - 空间菜单

## 🎮 操作指南

### 基本操作
1. 点击 **Start camera** 开启摄像头
2. 等待模型加载完成（Model ready）
3. 将手放在摄像头前开始交互

### Debug 模式
按 `D` 键打开 Debug HUD，显示：
- 当前模式和手势
- 检测手数和置信度
- 菜单 dwell 进度
- Orb 充电状态
- 模式转换日志

### Frame 手势（取景框）
需要做出标准的"OK"手势：
- 拇指和食指张开形成"框"
- 食指完全伸直
- 中指、无名指、小指弯曲
- 拇指朝上

### Orb 手势（能量球）
1. 双手靠近（距离 < 140-360px）
2. 保持 300ms 进入充电模式
3. 快速分开双手发射

## 🛠️ 技术栈

- **前端**: HTML5 Canvas 2D
- **手势识别**: MediaPipe Tasks Vision 0.10.14
- **模型**: Hand Landmarker (float16)
- **样式**: 纯 CSS（无框架）
- **构建**: 无构建步骤，纯静态文件

## 📁 项目结构

```
gesture-stage/
├── index.html          # 主页面
├── app.js              # 核心逻辑（手势检测、状态机、渲染）
├── styles.css          # 样式
└── README.md           # 项目说明
```

## 🎨 主题

内置 4 种主题，通过 Wave 手势切换：

| 主题 | 背景色 | 主色 | 辅色 | 点缀色 |
|------|--------|------|------|--------|
| 1 | #05070a | #30d5c8 | #ff4f9a | #f7c948 |
| 2 | #080b12 | #7dd3fc | #fb7185 | #bef264 |
| 3 | #09090b | #f8fafc | #22c55e | #f59e0b |
| 4 | #06130f | #2dd4bf | #e879f9 | #fef08a |

## 📊 调优参数

所有手势阈值常量在 `app.js` 顶部，便于调整：

```javascript
const MENU_DWELL_MS = 620;           // 菜单长按时间
const MENU_DRIFT_TOLERANCE = 120;    // 菜单漂移容差
const ORB_START_DISTANCE_MIN = 140;  // Orb 启动最小距离
const ORB_STABLE_MS = 300;           // Orb 稳定时间
const TRIGGER_COOLDOWN_DEFAULT = 760; // 手势冷却时间
```

## 🔒 隐私

- 所有处理在浏览器本地完成
- 不上传任何数据
- 摄像头画面仅用于实时检测

## 📝 开发文档

- [Live Hardening 计划](docs/gesture-stage-live-hardening.md)
- [P0 实现记录](docs/gesture-stage-p0-hardening.md)
- [响应式测试清单](docs/gesture-stage-responsive-checklist.md)
- [摄像头测试脚本](docs/gesture-stage-webcam-test-script.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 License

MIT License
