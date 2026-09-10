# 设计：看板名称重命名（CanvasListItem 组件）

日期：2026-09-10
状态：已确认

## 背景 / 目标

应用（Infinite Space 无限画布）左下角面板支持多看板（Canvases）的创建、切换、删除，但**无法重命名看板名称**。新建看板名自动为 `Canvas N`，用户无法自定义。本设计为每个看板项增加重命名能力，交互方式：名称旁铅笔图标 → 内联输入编辑。

## 方案选择

- **方案 B（已选）**：抽取 `CanvasListItem` 独立组件，重命名状态局部化。
- 备选 A（App.tsx 内联，改动最小但会进一步膨胀已 455 行的 App.tsx）与 C（弹窗，交互过重）已否决。

## 组件与文件

### 1. `src/types.ts`（修改）
将 `Page` 接口从 `App.tsx` 移入，与 `NodeData` / `EdgeData` 并列导出：

```ts
export interface Page {
  id: string;
  name: string;
}
```

### 2. `src/components/CanvasListItem.tsx`（新建）
每个看板项一个实例，纯展示组件，内部管理重命名交互状态。

Props：

```ts
interface Props {
  page: Page;
  isActive: boolean;      // 是否当前看板
  canDelete: boolean;     // pages.length > 1
  onSwitch: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}
```

内部状态：`isRenaming: boolean`、`draft: string`（草稿值）。

### 3. `src/App.tsx`（修改）
- `import { CanvasListItem } from './components/CanvasListItem'`；`Page` 改从 `./types` 导入，删除本地接口定义。
- 新增 `handleRenamePage(id, name)`：

```ts
const handleRenamePage = (id: string, name: string) => {
  setPages(prev => prev.map(p => (p.id === id ? { ...p, name } : p)));
};
```

- 底部面板 map 体替换为：

```jsx
<CanvasListItem
  key={p.id}
  page={p}
  isActive={currentPageId === p.id}
  canDelete={pages.length > 1}
  onSwitch={setCurrentPageId}
  onRename={handleRenamePage}
  onDelete={handleDeletePage}
/>
```

## 交互与数据流

- **铅笔图标**（lucide `Pencil`）置于名称按钮右侧图标组；显隐规则与现有删除图标一致：当前看板常显，其余 `group-hover` 显现。
- 点击铅笔 → 名称 `<button>` 替换为 `<input>`：自动聚焦（`autoFocus`）、`onFocus` 全选文本。
- **Enter → `blur()` → 触发 `onBlur` 提交**（单一提交路径，避免 Enter+blur 双提交）。
- **Esc → 取消**：丢弃草稿、退出编辑态，名称保持不变。
- **blur → 提交**：`draft.trim()`；为空则维持原名（不保存），否则 `onRename(page.id, trimmed)`。
- 输入框 `maxLength={40}` 限制长度。
- 名称按钮 `w-40 truncate pr-12` 为图标区留白；图标组 `absolute right-2 flex items-center gap-1`，内含铅笔 + 条件删除按钮。

## 数据持久化

无需新增。`handleRenamePage` 更新 `pages` 状态后，既有 `useEffect` 自动写 `localStorage['canvas_pages']`。

## 校验 / 边界

- 空名称（trim 后为空）→ 不保存，维持原名。
- 首尾空白自动 trim。
- 允许重名：看板以 `id` 为唯一标识，不强制唯一。
- 重命名输入框取代名称按钮，点击不会误触“切换看板”。

## 验证方式

1. `npm run lint`（`tsc --noEmit`）零错误。
2. 手动（`npm run dev`，注意先 `export NVM_DIR="$HOME/.nvm"; source "$NVM_DIR/nvm.sh"`）：
   - 新建看板 → 点铅笔 → 改名 → Enter/点击外部 → 名称更新且刷新页面后仍在；
   - 清空名称 → 不保存；
   - Esc → 取消，名称不变；
   - 切换看板、删除看板仍正常。
