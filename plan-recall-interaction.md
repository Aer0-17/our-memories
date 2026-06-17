# 回忆交互重构方案

## 背景（Context）

“我们的回忆”是情侣私密双人空间，前端为 Next.js 16 静态导出 + React 19 + Tailwind v4 + framer-motion + d3-geo 自绘 SVG 地图，后端 Go/Gin + SQLite。移动端（手机浏览器 / Capacitor APK）100% 复用 `apps/web` 响应式页面。

三个已确认的痛点与产品决策：

| # | 痛点 | 根因（已核实） | 决策 |
|---|------|----------------|------|
| 1 | 点亮地图与地图上的回忆缺乏互动 | 全国图点省份只 `router.push` 无预览（`ChinaMap.tsx:156`）；省份图点城市只弹固定宽浮动卡片，地图对“点亮/回忆”几乎无反馈（无回忆数、无轨迹、无点亮动效） | 增强：旅行轨迹连线 + 点亮动效与回忆数徽标 + 城市标记预览 |
| 2 | 回忆卡片跳转地图不适配手机 | `MemoryArchive.tsx:651` 卡片 `<Link>` 跳 `/province/[id]?city=xxx`，落地是固定 292/390px 浮动卡片，移动端局促；“跳转地图页”这个动作本身就不手机友好 | 移动端原地展开 BottomSheet，不跳转（含小地图定位） |
| 3 | 另一人无法编辑回忆 | 前端 `useContentEditAccess` 只判“是否登录”，两人都看到完整编辑表单；后端 `UpdateMemory` 静默拒绝非创建者核心字段、却返回 `200 ok`（`memory.go:219-229`），造成“保存了却没变化”错觉。已有死代码 `useMemoryEditAccess` 设计成“作者编辑/对方加批注”但从未接入 | 作者编辑正文，对方只能加 partnerNote 批注（纯前端启用 `useMemoryEditAccess`，匹配现有后端，不动后端） |

**范围说明**：本方案为**纯前端重构**（决策 3 不动后端，决策 2/3 落在 `apps/web`）。后端 `UpdateMemory`/`DeleteMemory` 的作者限制保持现状——前端按作者身份正确呈现，消除“静默失败”错觉。

## 总体交互设计

### 双人编辑（决策 3）
- 创建者（`memory.createdById === session.user.id`）：看到“编辑”入口与完整编辑表单（标题/日期/正文/心情/标签/可见范围/照片/封面），保存走现有 `onUpdate` 全字段 PATCH。
- 非创建者：**不显示“编辑”按钮**，改为“加批注”入口；表单只渲染 `partnerNote` 字段；保存只提交 `{ partnerNote }`（后端已支持且仅落库该字段）。不再把核心字段 PATCH 出去，从源头消除“保存了却没变化”。
- `partnerNote` 作为对方参与回忆的主通道，单独成块、突出呈现（“给对方的批注 / 对方留的话”），双方都能看到、非创建者可编辑、创建者只读。
- `MemoryArchive` 列表卡片的删除按钮：按作者 `canEdit` 禁用（非创建者 `disabled`，避免点击后端 403）。

### 移动端回忆详情（决策 2）
- `/memories`（`MemoryArchive`）的回忆卡片：**移动端 `<lg` 点击不再 `<Link>` 跳转**，改为 `onClick` 打开 BottomSheet；**桌面端 `≥lg` 保留 `<Link>` 跳地图页**（现有浮动卡片沉浸体验不变）。
- BottomSheet 内容：封面/相册、标题·日期·地点、正文、心情/标签、partnerNote 批注区、编辑/加批注入口（按权限）+ **迷你地图定位**（小型省份轮廓 + 高亮该城市点，让“回忆↔地图”在移动端不跳转也保持关联）。
- 抽屉两档吸附：半屏（看概要+定位）/ 全屏（看相册/历史/编辑表单）；下拽关闭。

### 地图互动增强（决策 1，落在省份图 `ProvinceMap`，全国图 `ChinaMap` 后续可复用）
- **旅行轨迹连线**：把已点亮城市按其回忆最早日期排序，在 SVG 内用 `<motion.path>` 串联，dasharray 逐段绘制动画，体现“两人共同走过的路线”。
- **点亮动效**：城市由 `lit=false`→`true` 时（首次添加回忆），`CityMarker` 播放一次 pulse/光晕动画。
- **回忆数徽标**：`CityMarker` 右上角小徽标显示该城回忆数量（取自 `localMemories[city.id].length`）。
- **城市标记预览**：桌面 `hover` / 移动 `长按` 城市标记，弹出轻量 popover（封面缩略 + 数量 + 最近日期），不必打开完整卡片即可速览。

## 实现步骤

> AGENTS.md 强制要求：写代码前查 `node_modules/next/dist/docs/` 中 client components / hooks / 静态导出指南，确认与训练数据差异。实现每一步前先读相关指南。

### 阶段 1 — 基础设施（为阶段 2/3 复用）

**新建 `apps/web/lib/useIsMobile.ts`**：`useSyncExternalStore` 订阅 `(max-width: 1023px)`（对齐 Tailwind `lg`），SSR 快照返回 `false`。仅用于“点击后才出现”的交互分支；静态可见性差异一律用 CSS `hidden lg:block` 规避水合不匹配。

**新建 `apps/web/components/ui/BottomSheet.tsx`**（可复用）：
- Props：`open`、`onClose`、`snapPoints?: number[]`（默认 `[0.48, 0.92]`）、`initialSnap?`、`children`。
- `fixed inset-x-0 bottom-0 z-[60]`，圆角顶 + 拖拽手柄，沿用设计语言（`#FAFBF7` 底 / `#D8DDD8` 边 / backdrop-blur）。
- framer-motion `useDragControls`，**拖拽仅由手柄发起**（`dragListener={false}` + handle `onPointerDown`），内容区原生滚动不与拖拽打架。
- `onDragEnd` 按 offset+velocity 决定吸附或关闭（下拽 >80px 或 velocity>500 → 关闭）。
- 高度用 `dvh` + `env(safe-area-inset-bottom)`；根元素 `onPointerDown/onWheel` `stopPropagation` 隔离（同款手段见现 MemoryCard）。
- 复用现有 `spring`（`ProvinceMap.tsx:71`）与 `AnimatePresence` 进出场。

### 阶段 2 — 双人编辑权限（纯前端，先做、风险最低）

**改 `apps/web/lib/useContentEditAccess.ts`**：`useMemoryEditAccess` 已具备 `isCreator/canEdit/canAddNote`（line 37-84），无需重写；确认 `memory.createdById` 与 `session.user.id` 比较正确即可接入。

**改 `apps/web/components/ProvinceMap.tsx` MemoryCard**（编辑表单 ~1080-1404、`startEdit` 1153、`canSave` 1116、编辑按钮 ~1640、删除按钮 ~1653、保存 1388）：
- 用 `const access = useMemoryEditAccess(memory)` 替换对该条回忆的 `isAdmin` 门控（`isAdmin` 仍用于“是否登录”这一层，`access` 决定“能否改这条”）。
- 创建者（`access.canEdit`）：现有完整表单与“编辑/删除”按钮原样保留。
- 非创建者（`access.canAddNote && !access.canEdit`）：
  - 隐藏“编辑”按钮与核心字段编辑入口；新增“加批注”按钮，打开仅含 `partnerNote` 的精简表单。
  - 保存时只 PATCH `{ partnerNote }`（复用 `handleUpdateMemory`，但构造最小 payload，或新增 `onUpdatePartnerNote`）。
  - **不再发送** title/date/text/mood/tags/visibility/photos，根除静默失败。
- `partnerNote` 区块独立化：回忆详情中作为“对方的批注”展示，非创建者可编辑、创建者只读。
- 删除按钮 `disabled={!access.canEdit}`（非创建者禁用，避免 403）。
- `canSave` 在非创建者路径下改为只校验 `partnerNote` 非空。

**改 `apps/web/components/MemoryArchive.tsx`**：列表卡片删除按钮（line 692-708）改用 `useMemoryEditAccess(memory).canEdit` 决定是否渲染/禁用（当前 `onDelete` 仅 `canEdit` 全局门控）。

### 阶段 3 — 移动端原地 BottomSheet（不跳转）

**新建 `apps/web/components/memories/MemoryDetailSheet.tsx`**：基于 `BottomSheet`，承载单条回忆详情 + 迷你地图定位 + 编辑/批注入口。内容层与 `ProvinceMap` MemoryCard 的展示部分高度重叠，**抽公共内容组件 `MemoryContentView`**（照片/标题/日期/正文/mood/tags/partnerNote），供“地图浮动卡片”与“移动 sheet”复用，避免复制两份（参考 `plan.md` 第 2 步思路）。

**改 `apps/web/components/MemoryArchive.tsx`**：
- 顶层加 `selectedMemory` state 与 `useIsMobile()`。
- `MemoryCard`（line 644）改为：移动端整卡 `onClick` → `setSelectedMemory(memory)` 打开 `MemoryDetailSheet`（不用 `<Link>`）；桌面端保持 `<Link href="/province/...?city=...">`。
- 用条件渲染区分：`isMobile ? <button onClick>…</button> : <Link>…</Link>`，卡片视觉一致。
- `MemoryDetailSheet` 内的编辑/批注复用阶段 2 的权限逻辑与 `MemoryContentView`。

**迷你地图定位**：sheet 顶部嵌一个小型省份轮廓（复用 `makeProjectionForProvince` / `chinaFeatures`，`lib/geo`）+ 高亮目标城市点（`city.x/y` 投影），无交互、仅定位示意，保持“回忆↔地图”关联。

**`RandomPhotoCard`**（`xl:block`，移动端隐藏）：本期不改其跳转逻辑，但可让其移动端也走 `MemoryDetailSheet`（可选，列为后续）。

### 阶段 4 — 地图互动增强（落在 `ProvinceMap.tsx`）

**回忆数徽标 + 点亮动效**（改 `CityMarker` 与 `mapCities` 渲染，812-843）：
- `mapCities` 已有 `lit`；补充 `memoryCount = localMemories[city.id]?.length ?? 0`，传入 `CityMarker`。
- `CityMarker` 右上角渲染数量徽标（`memoryCount > 0` 时）。
- 点亮动效：用 `useRef` 追踪上一次 `lit`，`false→true` 时播放一次 framer-motion `scale`+`boxShadow` pulse（复用 `provinceGlow` filter 思路）。

**旅行轨迹连线**（SVG 内，`mapGeometry.paths` 之后、城市标记之前）：
- 取已点亮城市，按各自最早回忆日期排序，连成折线 `<motion.path>`，`pathLength` 0→1 动画。
- 只在该省有 ≥2 个点亮城市时绘制；线型虚线 + 低透明度，不抢地图主体。

**城市标记预览 popover**（`motion.button` 819）：
- 桌面 `onHoverStart` / 移动 `onPointerDown` 长按 ~400ms 触发，弹出绝对定位 popover：封面缩略 + `memoryCount` + 最近日期。
- 复用 `getLatestMemory`（`@/data/memories`）取代表回忆。
- 预览不改变 `selectedCityId`，点击仍走 `handleSelectCity`。

### z-index 协调（移动端 sheet 引入后）
| 层 | z |
|----|---|
| 地图/标记/轨迹 | 0 |
| 缩放控制、城市列表/面板、城市预览 popover | 40 |
| 桌面浮动卡片 | 50 |
| **BottomSheet（新）** | **60** |
| 省份页返回按钮 | 80 |

## 涉及文件汇总

| 文件 | 操作 |
|------|------|
| `apps/web/lib/useIsMobile.ts` | 新建 |
| `apps/web/components/ui/BottomSheet.tsx` | 新建（可复用） |
| `apps/web/components/memories/MemoryContentView.tsx` | 新建（展示内容公共层，供卡片/sheet 复用） |
| `apps/web/components/memories/MemoryDetailSheet.tsx` | 新建（移动端回忆详情抽屉 + 迷你地图定位） |
| `apps/web/components/ProvinceMap.tsx` | 改：MemoryCard 接入 `useMemoryEditAccess`（作者/批注分流）、`CityMarker` 加徽标+点亮动效、SVG 加轨迹连线、城市标记加预览 popover、partnerNote 区块独立化 |
| `apps/web/components/MemoryArchive.tsx` | 改：移动端卡片 `onClick` 打开 sheet（桌面保留 `Link`）、删除按钮按作者禁用 |
| `apps/web/lib/useContentEditAccess.ts` | 改：确认 `useMemoryEditAccess` 接入点（基本无需重写） |

后端 `backend/handlers/memory.go` **不动**（决策 3 保持作者限制，前端按权限正确呈现）。

## 分阶段交付建议

1. **阶段 2（双人编辑权限）**：风险最低、解决最痛的“保存了却没变化”，先落地。
2. **阶段 1 + 3（移动端原地 sheet）**：基础设施 + 移动端详情，解决“跳转不适配手机”。
3. **阶段 4（地图互动增强）**：体验增强，最后做。

每阶段独立可验证、可单独提交。

## 验证方案

1. `npm run dev -w @map-of-us/web`（端口 3002），后端 `cd backend && go run main.go`。
2. **双人编辑**：用 `me` 创建一条回忆，切 `ta` 登录：① 看不到“编辑”只有“加批注”；② 加批注保存后刷新仍在、正文未被覆盖；③ 列表卡片删除按钮对 `ta` 禁用；④ `me` 视角批注只读。
3. **移动端 sheet**：390×844 视口，`/memories` 点卡片 → sheet 原地展开（不跳转）、半屏/全屏档、迷你地图定位正确、下拽关闭；桌面 1440 宽点卡片仍跳地图页浮动卡片。
4. **地图互动**：省份页城市标记显示回忆数徽标；新增首条回忆时该城有点亮动效；≥2 点亮城市出现轨迹连线；hover/长按城市出预览 popover。
5. **回归**：桌面 1440×900 浮动卡片锚定/翻转、侧边栏、编辑保存与现状逐项对比，确认零退化。
6. `npm run build -w @map-of-us/web` 静态导出无水合警告、无构建错误；`npm run typecheck` 通过。
