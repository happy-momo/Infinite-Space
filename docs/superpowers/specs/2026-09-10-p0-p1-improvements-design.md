# Infinite Space — P0/P1 功能精进设计

日期：2026-09-10
状态：设计定稿，待实施

## 背景与目标

产品现状：单机单用户无限画布（文本/图片/链接节点、连线、多页面、服务端持久化、AI Organize / AI Story）。
精进目标：
- **P0 — 可靠性基本盘**：让「当前功能」从能用变敢用（撤销、快捷键、复制粘贴、框选、视口控制、导出导入）。
- **P1 — AI 与体验深化**：AI Story 可迭代、AI Organize 落组标签、图片压缩、链接卡片增强、深色模式。

非目标（本设计不覆盖）：多用户协作、鉴权、性能虚拟化、国际化、无障碍、E2E 测试。这些作为后续独立阶段。

## 架构原则

- **前端**：React 19 + Vite + Tailwind 4 + motion。新增能力尽量收敛为小型 hook / 组件，保持 App.tsx 可读。
- **后端**：Express + `server/llm.ts` / `server/storage.ts`。AI 相关扩展点全部在服务端 prompt/返回结构上做，前端只消费。
- **历史栈只覆盖 {nodes, edges}**，不含 viewport 与页面结构；页面切换不参与撤销。
- **事务边界打点**：拖拽/缩放在 pointerdown 打一次快照；增删连线、内容编辑、样式变更在操作前打快照；避免 mousemove 频繁入栈。

## P0 设计

### P0.1 Undo/Redo

新 `src/hooks/useHistory.ts`：

```
useHistory(): {
  past, future, canUndo, canRedo,
  snapshot(): void,          // 把当前 {nodes,edges} 压入 past，清空 future
  undo(): {nodes,edges}|null,
  redo(): {nodes,edges}|null,
}
```

- 内部用 ref 持有最新 `{nodes, edges}`，App 在每次 state 变化后同步 ref（现有 `stateRef` 模式）。
- `snapshot()` 由 App 暴露为 `beginTransaction`，在以下位置调用：
  - CanvasNode：节点拖拽 pointerdown 前、resize pointerdown 前、进入编辑态前；
  - App：`handleAddNode`、`handleRemoveNode`、`handleDeleteSelected`、`handleLinkClick`(连线)、`handleRenamePage` 不在此列（页面不撤销）、字体/字号/颜色变更前（这些走 `handleUpdateNode`，需在编辑态/格式操作入口打点，见下）。
- `handleUpdateNode` 是拖拽期间高频调用，**不能在函数内部统一打点**。改为：拖拽走 `onUpdate`（不打点，pointerdown 已打点）；格式操作（B 按钮、字号、字体、link 项增删）在其 click handler 内先调 `beginTransaction()`。
- `undo()`/`redo()` 直接 `setNodes/setEdges`（不走 state 派生的副作用；页面存储 effect 会自然同步）。
- 快捷键（P0.2 统一键盘层）触发。

工具栏新增 Undo/Redo 两个按钮（Undo2/Redo2 图标），`disabled` 绑定 canUndo/canRedo。

### P0.2 键盘快捷键

App 挂一个全局 `keydown`（window）。前置守卫：

```
const editing = document.activeElement?.isContentEditable
  || ['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName||'')
```

| 键 | 动作 |
|---|---|
| Delete / Backspace | 删除选中（同 handleDeleteSelected；未选中时不触发“清空画布”确认） |
| Ctrl/Cmd+Z | undo |
| Ctrl/Cmd+Shift+Z / Ctrl+Y | redo |
| Ctrl/Cmd+C / V | 复制 / 粘贴选中节点 |
| 方向键 | 选中节点位移 10px（shift 加速到 40px） |

复制/粘贴：`copiedRef = {nodes, edges}`；复制仅收集 selectedIds 的节点 + 两端均在选区内的边；粘贴深拷贝并生成新 id，相对位置整体偏移 +40/+40，粘贴后选中新节点。粘贴后 `beginTransaction()`。

### P0.3 框选 Marquee + 平移方式

背景拖拽语义调整：
- **左键拖拽空白 = 框选**（替换现有背景平移）。
- **平移**：Space+左拖、中键拖拽、滚轮（保留）、Shift+滚轮（保留）。
- App 跟踪 `spaceDown`（window keydown/keyup）。`onPointerDownCanvas` 内：若 button===1（中键）或 spaceDown → pan；否则 → marquee。

框选实现：
- 起始屏幕坐标 → 世界坐标 `(e.clientX - x.get())/scale.get()`。
- move 时更新世界矩形；`nodes` 中 bounding box（x,y,w,h）与矩形相交的收集为选中（Shift 时并入，否则替换）。
- 渲染一个绝对定位的虚线 overlay（放在画布世界层内，`pointer-events-none`），rect 用世界坐标算样式。
- pointerup 结束；`beginTransaction()` 在起始时打点。

### P0.4 视口控件

新 `src/components/ViewportControls.tsx`（右下角，玻璃风格）：
- `fitAll()`：复用现有 `fitViewport`（对所有节点 bbox），暴露为按钮。
- `+ / −`：绕视口中心缩放 `*1.25 / /1.25`（clamp 0.1~5）。
- `100%`：scale=1，保持中心不动。

### P0.5 导出 / 导入

工具栏加 Export（Download 图标）与 Import（Upload 图标）两个 ToolButton。
- **导出**：构造完整 bundle（复用 `postBundle` 的构建逻辑，抽成 `buildBundle()`），`Blob` + `a.download` 为 `board-<date>.json`。
- **导入**：隐藏 `<input type=file accept=.json>`，解析后调 `applyImport(bundle)`：
  - 校验 pages 数组非空；
  - 写 localStorage（pages/current/nodes/edges/viewport 各键）→ 触发各 effect 的 state 同步（setPages/setCurrentPageId/setNodes/setEdges/x/y/scale）；
  - 调 `scheduleServerSave()` 让服务端落盘；
  - 导入前 `beginTransaction()`。
- 导入失败 alert 并保持原状态。

## P1 设计

### P1.1 AI Story 重写 / 追问 + 风格

服务端：`summarizeBoard(nodes, edges, cfg, opts?: { instruction?: string; style?: string })`。
- style 映射为对故事线的改写要求（详细/简洁/讲故事/正式/英文…），追加进 prompt 的“故事线”段。
- instruction 原样追加为“用户的额外要求”。
- `/api/summarize` body 增加可选 `instruction`、`style`。

前端：
- App 记录 `storyNodeId`。生成故事后顶部浮动条出现（复用“Select target node”提示条的定位样式）：
  - 风格 chips：详细 / 简洁 / 讲故事 / 正式 / English；
  - 一个输入框：追问或改写要求；
  - “重新生成”按钮 + 关闭 X。
- 重新生成时：发送当前看板 nodes/edges（**排除 storyNodeId**）+ instruction/style；成功后 `handleUpdateNode(storyNodeId, { content: ... })` **原地替换**，不新建节点。

### P1.2 AI Organize 组标签

服务端：`layoutGroups` 顺带返回每组锚点 `{name, x, y}`（组左上角）；`organizeNodes` 返回 `{ positions, groups }`；`/api/organize` 直接透传。
前端 `handleAiOrganize`：
- 应用 positions（原有逻辑 + fitViewport）；
- 为每个 group 创建**小号文字标签节点**：`fontSize` 默认略大、加粗，位于 `(group.x, group.y - 44)`，宽 ~200、高 ~36，内容为组名。标签随本次组织一并加入 nodes（不连线）。
- 下一次 AI Organize 会把标签当普通文本节点处理，可接受（语义上属于该组）。

### P1.3 图片上传压缩

CanvasNode 上传 handler：
- File → `createImageBitmap`/`Image` → 若 max(w,h) > 1600 则缩放到 1600；
- `canvas.toBlob('image/webp', 0.82)`（不支持 webp 回退 jpeg 0.85）→ `FileReader.readAsDataURL` → `onUpdate(content)`。
- 效果：base64 体积显著下降，state.json 不再快速膨胀。

### P1.4 链接卡片标题 / favicon（尽力而为）

服务端新增 `GET /api/linkinfo?url=`：
- 8s 超时 fetch HTML，正则取 `<title>` 与 `<link rel=icon>`；
- 任何失败返回 `{ ok:false }`，不抛错。
前端：
- 链接节点新增 link 项保存 URL 时（title 为空），后台调用 `/api/linkinfo` 尽力填充 title；
- 卡片展示时若有 favicon URL，渲染小图标；无则忽略。
- 全程 best-effort，绝不阻塞交互；失败静默。

### P1.5 深色模式

- App 状态 `theme: 'light'|'dark'`（localStorage `canvas_theme`），根容器 class 追加 `dark`。
- 全组件颜色加 `dark:` 变体：背景 `bg-white/80 → dark:bg-gray-900/80`、文字 `text-gray-700 → dark:text-gray-200`、边框、阴影、输入框、弹窗、小地图、滚动条。`index.css` 补充 `.dark .canvas-bg` 深色网格。
- 切换按钮（Sun/Moon）放在左下页面面板或右上角。
- **工作量最大、回归风险最高，安排在 P1 最后实施**；若中途影响已有交付，以 checkpoint 形式与用户确认。

## Ops

- `package.json` dev 改为 `tsx watch server.ts`：服务端代码变更自动重启，规避此前“前端新代码、后端旧代码”的 404 问题。`dev:noreload` 保留纯 `tsx server.ts` 作后备。

## 实施顺序

1. P0.1 Undo/Redo → 2. P0.2 快捷键 → 3. P0.3 框选/平移 → 4. P0.4 视口控件 → 5. P0.5 导出导入
6. P1.1 AI Story 重写 → 7. P1.2 组标签 → 8. P1.3 图片压缩 → 9. P1.4 链接信息 → 10. P1.5 深色模式
每步 lint + 隔离端口冒烟；最后统一提交。

## 验证

- 每项手动冒烟：隔离端口起服务，验证行为；`tsc --noEmit` 全绿。
- P0 关键场景：拖一条节点→undo 复位；删除→undo 恢复；框选多节点→Delete；复制粘贴出现副本；导入导出来回一致。
- P1 关键场景：AI Story 换风格原地重写；AI Organize 出现组标签；上传大图体积下降；链接标题尽力填充；切换深色。
