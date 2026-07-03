# 路面损伤检测智能体 — Pavement Inspector AI

> 基于阿里云通义千问 VL 多模态大模型的专业路面损伤检测智能体

## 🔗 在线访问

部署到 GitHub Pages 后，通过以下地址访问：

```
https://<你的用户名>.github.io/pavement-inspector/
```

## 📋 项目简介

Pavement Inspector 是一个专业的路面损伤检测智能体应用，利用**通义千问 VL（qwen-vl-max）**多模态大模型，自动识别和评估路面损伤。

### 核心功能

| 功能 | 说明 |
|------|------|
| 🔍 **标准检测** | 上传路面图片，LLM 自动识别 8 类路面损伤 |
| 📊 **CV 校验模式** | 用 LLM 矫正传统 CV 模型的检测结果，发现漏检和误检 |
| 📈 **PCI 评分** | 自动计算路面状况指数（Pavement Condition Index） |
| 📝 **检测报告** | 生成详细的损伤报告，包含类型、位置、严重程度和维护建议 |
| 🎬 **演示模式** | 无需 API Key 即可体验完整工作流 |
| 📜 **历史记录** | 保存检测历史，支持回顾和对比 |

### 可检测的 8 类路面损伤

1. **裂缝 (Crack)** — 横向/纵向/龟裂/块状裂缝
2. **坑槽 (Pothole)** — 路面局部塌陷
3. **车辙 (Rutting)** — 车轮轨迹凹陷
4. **松散/剥落 (Raveling)** — 集料脱落
5. **修补 (Patching)** — 修补区域及二次破损
6. **泛油 (Bleeding)** — 沥青上浮
7. **沉陷 (Depression)** — 路面下沉
8. **推移 (Shoving)** — 路面材料位移

## 🚀 快速开始

### 1. 获取 API Key

1. 访问 [阿里云 DashScope 控制台](https://dashscope.console.aliyun.com/apiKey)
2. 登录阿里云账号（支持支付宝/淘宝账号登录）
3. 点击"创建 API Key"，复制生成的 Key（格式：`sk-xxxxxxxxxxxxxxxxxxxxxxxx`）
4. 开通[通义千问 VL 模型服务](https://dashscope.console.aliyun.com/)

### 2. 运行应用

#### 方式一：直接打开（本地测试）

```bash
# 直接在浏览器中打开
open index.html
```

#### 方式二：部署到 GitHub Pages

```bash
# 1. 创建 GitHub 仓库
# 2. 推送代码到仓库
git init
git add .
git commit -m "Initial commit: Pavement Inspector AI"
git remote add origin https://github.com/<你的用户名>/pavement-inspector.git
git push -u origin main

# 3. 在仓库 Settings > Pages 中启用 GitHub Pages
#    Source: Deploy from a branch
#    Branch: main, folder: / (root)
```

#### 方式三：使用本地服务器

```bash
# Python 3
python -m http.server 8080

# Node.js
npx serve .

# 然后访问 http://localhost:8080
```

### 3. 使用应用

1. 打开应用后，点击右上角 **⚙️ 设置**，输入 API Key
2. 上传路面图片（拖拽 / 点击上传 / 粘贴）
3. 选择工作模式（标准检测 / CV 校验）
4. 点击 **开始分析**
5. 查看检测报告，可导出或复制

💡 **提示**：点击 **演示** 按钮可立即体验完整工作流，无需 API Key。

## 🏗️ 技术架构

```
pavement-inspector/
├── index.html          # 主页面（完整的 UI 布局）
├── css/
│   └── style.css       # 样式表（响应式设计 + 打印样式）
└── js/
    └── app.js          # 核心逻辑（图片处理 + API 调用 + 结果渲染）
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | 原生 HTML5 + CSS3 + ES6 JavaScript（零依赖） |
| AI 模型 | 阿里云 DashScope 通义千问 VL (qwen-vl-max) |
| API 协议 | OpenAI-Compatible Chat Completions API |
| 图片处理 | HTML5 Canvas（压缩 + 标注绘制） |
| 数据存储 | localStorage + sessionStorage |
| 部署平台 | GitHub Pages（静态文件托管） |

### 工作流程

```
用户上传图片 → Canvas 压缩(≤2048px) → Base64 编码
    ↓
构建多模态 Prompt（系统提示 + 图片 + 检测指令）
    ↓
调用 DashScope API（qwen-vl-max）
    ↓
解析 JSON 响应 → 渲染检测报告
    ↓
保存历史记录 → 支持导出/复制
```

### CV 校验模式流程

```
用户上传图片 + CV 模型检测结果 JSON
    ↓
LLM 独立检测 + 对比 CV 结果
    ↓
输出：校验结果 + 漏检标注 + 误检标注 + 精度评估
    ↓
Canvas 绘制 bbox 可视化标注
```

## 📄 API 参考

### DashScope API 调用

```javascript
POST https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
Authorization: Bearer <API_KEY>
Content-Type: application/json

{
  "model": "qwen-vl-max",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } },
        { "type": "text", "text": "请分析这张路面图片..." }
      ]
    }
  ],
  "max_tokens": 3000,
  "temperature": 0.1
}
```

## 📝 课程论文提纲

参见 [论文提纲](./论文提纲.md)

## ⚠️ 注意事项

1. **API Key 安全**：本应用将 API Key 存储在浏览器 localStorage 中，不会上传到任何第三方服务器。但请注意，在共享设备上使用时建议不勾选"保存 API Key"。
2. **费用**：通义千问 VL 模型按 token 计费，请关注 [DashScope 计费说明](https://help.aliyun.com/zh/dashscope/product-overview/billing)。
3. **CORS**：DashScope API 支持浏览器跨域请求，无需后端代理。
4. **图片大小**：上传图片会自动压缩至最大边长 2048px，以确保 API 调用效率。

## 📄 License

本项目仅用于教学目的。
