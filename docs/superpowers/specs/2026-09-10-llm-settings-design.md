# 设计：通用 LLM 配置 + 服务端持久化 + AI Organize 修复

日期：2026-09-10
状态：已确认（方案 A）

## 背景 / 目标

1. AI Organize 目前硬编码单一 LLM 实现，无法自定义 LLM。
2. 看板数据仅存浏览器 localStorage——清缓存/换浏览器即丢，key 若放浏览器也不安全。
3. 现有 AI Organize 有若干缺陷：图片 base64 塞进 prompt、无规模限制、无超时、重排后视口不居中、JSON 解析失败裸 500。

目标：通用（OpenAI 兼容）LLM 配置 + 服务端持久化 + 设置 UI + 连通性测试 + 修复缺陷。

## 关键决策

- **LLM 接口**：仅 OpenAI 兼容（`POST {baseUrl}/chat/completions`），覆盖 OpenAI/DeepSeek/Groq/OpenRouter/Ollama 等。
- **配置存储**：服务端 `data/llm-config.json`，key 掩码回显，浏览器永远拿不到完整 key。
- **看板持久化**：服务端 `data/state.json`（全量状态包），localStorage 保留为离线缓存；首次启动服务端为空时自动迁移 localStorage → 服务端。
- **绑定**：默认 `127.0.0.1`，可用 `HOST`/`PORT` 环境变量覆盖。

## 服务端

### `server/storage.ts`（新增）
- 数据类型：`LlmConfig { baseUrl, model, apiKey }`、`AppState { pages, currentPageId, nodes:{pageId:[]}, edges:{pageId:[]}, viewports:{pageId:{vx,vy,vs}} }`
- `data/` 目录 `0700`、文件 `0600`，原子写（temp + rename）；`data/` 入 `.gitignore`
- `loadState/saveState`、`loadLlmConfig/saveLlmConfig`
- `maskKey()`（`sk-****abc1`）、`publicConfig()`（GET 用，不含完整 key）

### `server/llm.ts`（新增，通用 OpenAI 兼容客户端）
- `callLlm(cfg, system, user, timeoutMs)`：POST chat/completions，Bearer key，`temperature:0`；baseUrl 自动补 `/chat/completions`；AbortController 超时（organize 60s / test 30s）；解析 `choices[0].message.content`（兼容 content 数组）；非 200 提取服务端错误信息
- `extractJson(text)`：剥 markdown 围栏，截取首个 `[`/`{`，JSON.parse
- `organizeNodes(nodes, cfg)`：构建聚类 prompt；**image 节点 base64 内容过滤为 `[image]`、URL 截断保留**；内容截断 500 字符；节点上限 60（超出的保持原地并提示）；JSON 解析失败自动重试 1 次
- `testConnection(cfg)`：最小 `ping` 请求，返回回复摘要

### `server.ts`（重写路由编排）
- 移除旧的硬编码 LLM SDK import/依赖
- `GET /api/data` / `POST /api/data`（`express.json({limit:'50mb'})` 支持 base64 图片）
- `GET /api/settings`（掩码）/ `POST /api/settings`（apiKey 留空=保留现有；校验 baseUrl 必须 http(s) 开头、model 非空）
- `POST /api/llm/test`：接受可选 `{baseUrl,model,apiKey}` 覆盖（未保存即可测），缺省用已存配置；成功 `{ok,reply}` / 失败 `{ok:false,error}`
- `POST /api/organize`：只收 `{nodes}`，改用服务端配置；未配置返回明确错误
- 默认 `app.listen(PORT, process.env.HOST || '127.0.0.1')`
- 顺带修复生产 catch-all：`app.get('*')`（Express 4）

## 客户端

### `src/App.tsx`（持久化 + organize 改造）
- 启动 `GET /api/data`：服务端有数据→水合全部状态并回写 localStorage 缓存；空→把当前 localStorage 状态防抖 `POST` 迁移
- 状态变更（pages/nodes/edges/currentPageId + x/y/scale 变化）→ 700ms 防抖 `POST /api/data`（当前页用实时 state/motion 值，其它页读 localStorage，构建全量包）
- `handleAiOrganize`：请求体只发 `{nodes}`；应用坐标后调用 `fitViewport()`（按新位置包围盒缩放适配视口）
- 新增 `isSettingsOpen` 状态与 `<SettingsModal>` 渲染

### `src/components/Toolbar.tsx`
- 末尾加 `Settings` 图标按钮（lucide `Settings`），新增 `onOpenSettings` prop

### `src/components/SettingsModal.tsx`（新增）
- 字段：Base URL、Model、API Key（password，占位符显掩码，留空=保留）
- 常用服务商预设下拉（OpenAI/DeepSeek/Groq/OpenRouter/Ollama 本地）
- **Test Connection**：POST 当前表单值到 `/api/llm/test`，内联成功/失败结果
- Save / Cancel；打开时 `GET /api/settings` 预填

## 修复项

| 问题 | 修复 |
|---|---|
| 图片 base64 进 prompt | 过滤为 `[image]`，URL 截断保留 |
| 无规模限制 | 节点 ≤60、内容 ≤500 字符 |
| 无超时 | AbortController 60s/30s |
| 重排后找不到节点 | `fitViewport()` 自动适配 |
| JSON 解析裸 500 | 健壮提取 + 重试 1 次 + 明确错误 |
| 生产 catch-all 失效 | `app.get('*')` |

## 安全

- key 存服务端 `data/llm-config.json`（0600），不进浏览器/localStorage；GET 只回掩码
- `data/` gitignore；不打印 key；默认绑定 127.0.0.1
- 移除旧的硬编码 LLM SDK 依赖

## 验证

1. `npm run lint` + `npx vite build`
2. curl 冒烟（`PORT=3100 npm run dev` 避开 3000 占用）：
   - `GET/POST /api/data` 往返
   - `POST /api/settings` 保存 → `GET` 返回掩码（无完整 key）
   - `POST /api/organize` 未配置 → 明确错误
   - `POST /api/llm/test` 对不可达地址 → 明确失败
3. 手动：配置→测试连接→AI Organize→视口自动适配→刷新页面数据仍在
