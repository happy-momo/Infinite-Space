# 🪐 Infinite Space(无限空间)

> 一款 **AI 加持的无限画布**,用于收集、连接与叙事——你的想法、图片和链接都生活在一块无边界的画布上,由你来组织,由你自带的大模型来辅助。

[English](README.md) · [中文](README.zh-CN.md)

<p align="center">
  <a href="#-功能特性"><strong>功能特性</strong></a> ·
  <a href="#-快速开始"><strong>快速开始</strong></a> ·
  <a href="#-使用指南"><strong>使用指南</strong></a> ·
  <a href="#-二次开发"><strong>二次开发</strong></a> ·
  <a href="#-http-api"><strong>HTTP API</strong></a> ·
  <a href="#-参与贡献"><strong>参与贡献</strong></a>
</p>

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D%2020-green.svg)
![Stack](https://img.shields.io/badge/stack-React%2019%20%E2%80%A2%20Vite%206%20%E2%80%A2%20Express-blueviolet)
![PRs](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

---

**Infinite Space** 把一个空白浏览器标签页变成思维的游乐场:在无缝的无限画布上任意放置**文字、图片、链接**,把它们连成一张想法之网,跨**多个页面**整理,再交给**你选择的任意大模型**一键梳理或串成故事。

- **自带大模型(BYO-LLM)** —— 兼容任意 OpenAI 兼容接口(智谱 GLM、OpenAI、DeepSeek、Groq、OpenRouter、Ollama……)。你的 API Key 保存在服务端,**绝不暴露给浏览器**。
- **真正理解你画布内容的 AI** —— *AI 整理* 把相关节点聚类并生成带标签的整洁布局;*AI 总结* 把整块画布串成一条连贯的故事线,还能用不同风格重新生成。
- **本地优先** —— 画布数据住在浏览器 localStorage;可选的 Express 后端补充服务端持久化、LLM 代理与链接元数据增强。

---

## ✨ 功能特性

| | |
|---|---|
| 🗺️ **无限画布** | 顺滑平移/缩放(Space+拖拽、中键、滚轮),小地图,一键适配全部内容 |
| 📝 **富文本节点** | 双击编辑,行内加粗,字体/字号选择,优雅的排版渲染 |
| 🖼️ **图片节点** | 上传即**自动压缩为 ≤1600px 的 WebP**,让画布始终保持流畅 |
| 🔗 **链接卡片** | 显示标题 + URL 的智能卡片,保存时**自动抓取页面标题与 favicon** |
| ⛓️ **节点连线** | 专用连线工具,任意节点之间拖出关系线 |
| 🗂️ **多页面** | 标签页式工作区——每个页面独立的节点、连线与视口 |
| ✨ **AI 整理** | LLM 聚类相关节点,自动生成**分组标签**并排版,画布自动适配视口 |
| 📖 **AI 总结** | 把整块画布内容+连线串成故事线,生成高亮的故事节点;支持 详细 / 简洁 / 讲故事 / 正式 / English 多种风格及自定义要求重新生成 |
| 🧠 **自带大模型** | 任意 OpenAI 兼容模型;应用内配置、连通性测试;Key 服务端加密掩码存储 |
| ↩️ **撤销 / 重做** | 覆盖每一步操作(拖拽、编辑、删除、AI 动作)的完整历史 |
| ⌨️ **键盘优先** | 撤销/重做、复制粘贴、删除、微调、平移、框选快捷键 |
| 💾 **导出 / 导入** | 整块画布(页面 + 节点 + 连线 + 视口)打包为单个 JSON |
| 🌙 **深色模式** | 一键切换,跨会话记忆 |

## 📸 截图

<img width="1920" height="953" alt="image" src="https://github.com/user-attachments/assets/1469fbc2-7c9d-4f14-8664-4ad1c416b6b4" />

## 🚀 快速开始

**环境要求:** [Node.js](https://nodejs.org) **≥ 20**(Tailwind CSS 4 的硬性要求,推荐 Node 22)。

```bash
git clone https://github.com/happy-momo/Infinite-Space.git
cd Online-idea-dashboard
npm install

# 启动开发服务器(前端 + API,自动重载)
npm run dev
```

打开 **http://127.0.0.1:3000** 即可使用画布。要解锁 AI 功能,点击 **⚙️ 设置**,选择服务商预设(或粘贴 Base URL / 模型名),填入 API Key,点 **测试连接** 后 **保存**。

> 🐢 *如果旧系统 Node 导致 `npm install` 失败,先执行 `nvm install 22 && nvm use 22`。*

### 生产构建

```bash
npm run build   # 前端 + 服务端打包到 dist/
npm start       # 在 http://127.0.0.1:3000 提供全部服务
```

## 🐳 Docker 部署

项目已附带多阶段 `Dockerfile`(Node 22, Alpine)、`.dockerignore` 与 `docker-compose.yml`——**单个容器**即可跑起来(Express 直接托管构建好的 React 前端),`data/` 目录通过卷持久化。

**环境要求:** 安装 [Docker](https://www.docker.com/products/docker-desktop/)(含 Compose)。

```bash
docker compose up -d      # 构建 + 启动
# 访问 http://localhost:3000

docker compose logs -f    # 查看日志
docker compose down       # 停止(数据保留在卷中)
```

不使用 Compose 也可:

```bash
docker build -t infinite-space .
docker run -d -p 3000:3000 \
  -e HOST=0.0.0.0 \
  -v infinite-space-data:/app/data \
  infinite-space
```

**说明**

- 镜像内置 `HOST=0.0.0.0` 与 `NODE_ENV=production`,无需额外配置即可监听所有网卡并托管静态构建产物;`PORT`(默认 `3000`)与 `HOST` 均可用环境变量覆盖。
- 数据(画布状态 + LLM 配置,含 API Key)保存在**命名卷** `infinite-space-data`,挂载到 `/app/data`,**不会**打进镜像。若想沿用本机已有的 `data/` 目录,把 `docker-compose.yml` 里的 `- infinite-space-data:/app/data` 改成 `- ./data:/app/data` 即可。
- 容器以非 root 的 `app` 用户运行,`data/` 文件使用受限权限(`0600`/`0700`)。
- 由于打包产物在运行时会 `require("vite")`,运行镜像安装的是**完整依赖**(不能使用 `--omit=dev`)。

## 🧭 使用指南

### 画布基础操作

- **平移** — 按住 `Space` 拖拽、**中键**拖拽,或触屏直接拖。
- **缩放** — 鼠标滚轮,或右下角 **＋ / − / 适配 / 100%** 控件。
- **选择** — 单击节点;按住 `Shift`/`Cmd` 多选。空白处拖拽可**框选**。
- **微调** — 方向键移动选中节点(按住 `Shift` 速度 ×4)。

### 节点类型

| 节点 | 创建方式 | 说明 |
|---|---|---|
| **文字** | 工具栏 `T` | 富文本。**双击**编辑;`Enter` 保存,`Shift+Enter` 换行。支持加粗、字体(微软雅黑 / 苹方 / 宋体 / 楷体 / Serif / Mono)与字号。 |
| **图片** | 工具栏 `🖼` | 上传图片即**自动压缩为 WebP(≤1600px)**,保证 base64 体积可控。 |
| **链接** | 工具栏 `🔗` | 显示标题 + URL 的智能卡片;保存后服务端**尽力抓取页面标题与 favicon** 丰富卡片。 |

### 节点连线

点击 **⛓ 连线** 工具,依次点击**起点**节点、**终点**节点即可生成连线。连线很重要:**AI 总结会读取连线关系**,让故事线忠实反映画布的真实结构。

### AI 功能

两个功能都使用 **⚙️ 设置** 中配置的大模型,且**在服务端执行**(Key 永不进入浏览器)。

- **✨ AI 整理** —— 一键。LLM 聚类相关节点,应用内自动将每个簇排版成带**自动分组标签**的网格,并适配视口让你看到全貌。
- **📖 AI 总结(故事线)** —— 把当前画布内容 + 连线串成叙事,生成一个高亮的**故事线文字节点**。之后顶部浮动栏支持**重新生成**,风格可选 详细 / 简洁 / 讲故事 / 正式 / English,也可追加自定义要求(如「突出 lilei 的贡献」)。提示词会排除故事节点自身,并**严格要求模型不得虚构事实与关系**。

### 快捷键

| 操作 | 快捷键 |
|---|---|
| 撤销 / 重做 | `Ctrl/Cmd+Z` · `Ctrl/Cmd+Shift+Z` 或 `Ctrl/Cmd+Y` |
| 复制 / 粘贴 | `Ctrl/Cmd+C` · `Ctrl/Cmd+V` |
| 删除选中 | `Delete` / `Backspace` |
| 微调选中 | `↑ ↓ ← →`(按住 `Shift` ×4) |
| 平移 | `Space` + 拖拽 / 中键 / 触屏 |
| 缩放 | 鼠标滚轮 |

*(输入状态下快捷键自动跳过——包括中文输入法组词期间。)*

## ⚙️ 配置说明

### 应用内 LLM 设置(推荐)

点击 **⚙️ 设置** → 配置 **Base URL / 模型 / API Key**(内置 OpenAI、DeepSeek、Groq、OpenRouter、Ollama 预设)。Key 以 **0600 权限**保存到服务端 `data/llm-config.json`,浏览器永远只看到掩码(`sk-****abc1`)。保存时留空 Key 表示保留现有 Key。

### 服务端环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3000` | HTTP 端口 |
| `HOST` | `127.0.0.1` | 绑定地址;设为 `0.0.0.0` 可允许局域网内其他设备访问 |

LLM 配置**不需要**环境变量。

### 数据与隐私

- **看板数据本地优先**:存储在浏览器 localStorage,并(防抖)镜像到服务端 `data/state.json`,刷新/重启不丢数据。
- **密钥绝不进入客户端**:API Key 只存在于 `data/llm-config.json`。`data/` 已加入 `.gitignore`,并以受限权限写入。

## 🔌 HTTP API

Express 服务(默认 `http://127.0.0.1:3000`)提供少量 JSON API:

| 方法 | 路由 | 说明 |
|---|---|---|
| `GET` / `POST` | `/api/data` | 读写持久化的看板状态 |
| `GET` / `POST` | `/api/settings` | 读取(掩码)/ 更新 LLM 配置 |
| `POST` | `/api/llm/test` | 测试(可未保存的)服务商连通性 |
| `POST` | `/api/organize` | 通过已配置 LLM 聚类并排版画布 |
| `POST` | `/api/summarize` | 把画布总结成故事线(支持 `style`、`instruction`) |
| `GET` | `/api/linkinfo?url=…` | 尽力抓取页面标题 / favicon,用于链接增强 |

## 🏗️ 项目结构

```
├── src/                     # React 19 前端
│   ├── App.tsx              # 画布状态、历史、快捷键、AI 动作
│   ├── components/          # CanvasNode、Toolbar、Minimap、EdgeLayer、SettingsModal、
│   │                        # StoryControls、ViewportControls、CanvasListItem
│   ├── hooks/useHistory.ts  # 撤销/重做快照栈
│   ├── data.ts / types.ts   # 种子数据与共享类型
│   └── index.css            # Tailwind 4 + 深色模式变体
├── server/                  # Express 后端
│   ├── llm.ts               # OpenAI 兼容客户端、提示词、清洗、聚类
│   └── storage.ts           # 原子 JSON 持久化(状态 + LLM 配置)
├── server.ts                # 路由编排 + dev(Vite)/ prod(静态)托管
├── docs/superpowers/specs/  # 设计文档
└── package.json
```

## 🛠️ 二次开发

项目刻意保持小而精:前端 **React + Vite + Tailwind**,后端 **Express**,**无数据库**——持久化就是 JSON 文件 + localStorage。

### 架构一览

1. **状态** 集中在 `App.tsx`(`nodes`、`edges`、`pages`)。所有变更走 `setNodes`/`setEdges`;操作包裹 `beginTransaction()`,让 `useHistory` 能按「一次操作」整体撤销/重做。
2. **画布交互** 在 `App.tsx`(`onPointerDownCanvas`:框选、平移、缩放)与 `CanvasNode.tsx`(拖拽、缩放、编辑)处理。
3. **AI 动作** 很薄:`App.tsx` 把 `{ nodes, edges }` 发给路由,`server/llm.ts` 负责拼提示词、调用任意 OpenAI 兼容端点、并在返回前清洗输出。

### 新增一种节点类型

1. 在 `src/types.ts` 扩展 `NodeType`。
2. 在 `src/components/Toolbar.tsx` 加一个调用 `onAdd('你的类型')` 的按钮。
3. 在 `CanvasNode.tsx` 渲染新类型的正文(参照现有 `text` / `image` / `link` 分支)。

### 新增一个 AI 动作

1. 在 `server/llm.ts` 添加提示词与函数(复用 `callLlm` 做传输、`sanitizeText` 做清洗)。
2. 在 `server.ts` 注册路由。
3. 在 `App.tsx` 用按钮调用——通过 `stateRef.current` 发送**当前最新**的画布数据(参考 `handleAiSummarize` 的 flush-commit 写法,避免读到旧内容)。

### 更换或新增 LLM 服务商

客户端只讲**一种协议**——OpenAI 兼容的 `POST {baseUrl}/chat/completions` + Bearer Key。任何实现该协议的服务商(智谱 GLM、OpenAI、DeepSeek、Groq、OpenRouter、Ollama……)只需在 `SettingsModal.tsx` 加一个预设即可,AI 逻辑零改动。

### 质量检查

```bash
npm run lint   # TypeScript 严格检查
npm run build  # 完整生产构建(前端 + 服务端)
```

## 🗺️ 路线图

- [ ] 可分享画布(公开链接 / 只读视图)
- [ ] 实时多人协作
- [ ] 更多节点类型(看板列、思维导图分支、内嵌笔记)
- [ ] AI 模板与更丰富的故事风格
- [ ] 离线 PWA + 云同步
- [ ] GitHub Actions CI(代码检查 + 构建 + 自动部署)

*有好点子?开一个 issue 或 PR——路线图是对话,不是合同。*

## 🤝 参与贡献

欢迎一切形式的贡献:bug 反馈、UI 打磨、文档、翻译与功能开发。

1. Fork 本仓库并创建分支:`git checkout -b feat/my-feature`
2. 完成修改并验证:`npm run lint && npm run build`
3. 提交 Pull Request,清楚说明**做了什么**与**为什么**。

请遵循现有代码风格,保持 PR 聚焦。较大的改动建议先开 issue 对齐方案。

## 📄 许可证

[MIT](LICENSE)——随便用、随便 fork、放心往上叠功能。

---

<p align="center">
  喜欢 Infinite Space 的话,点个 ⭐ 让更多人看到它,再开个 issue 告诉我们下一步该做什么。<br/>
  <sub>用 ❤️ 构建。</sub>
</p>
