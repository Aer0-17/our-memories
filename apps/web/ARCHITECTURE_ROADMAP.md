# 用户端架构优化路线图

> 记录组件库建设、架构优化与体验设计的完整进度。
> 最后更新：2026-06-23

---

## 总览

| 阶段 | 状态 | 说明 |
|------|------|------|
| 一、组件库地基 | ✅ 完成 | 10 个 UI 组件 + barrel export |
| 二、应用组件库 | ✅ 完成 | confirm/modal/toast/spinner/skeleton 全量替换 |
| 三、硬编码色迁移 | ✅ 完成 | TSX/TS 0 处，CSS 类 0 处，仅剩 @theme 定义 |
| 四、拆分巨型组件 | ✅ 完成 | ProvinceMap 2273→853，MemoryArchive 1048→355 |
| 五、登录态响应式 | ✅ 完成 | AuthProvider + useAuth |
| 六、错误处理统一 | ✅ 完成 | ApiError + catch 块 |
| 七、loading/error 文件 | ⚪ 不适用 | 静态导出不支持 loading.tsx，已用组件内 Skeleton |
| 八、死代码清理 | ✅ 完成 | TimeCapsuleGrid / localPrivacy / capsule 配置 |
| 九、CSS 瘦身 | ◐ 部分 | rgb()→var() 迁移完成，.login-*/.entry-* 合并未做 |

验证：`typecheck` ✅ · `lint` 0错误0警告 ✅ · `build` 45页 ✅

---

## 已完成

### 第一阶段：组件库地基

| 组件 | 文件 | 替代 |
|------|------|------|
| Card / CardHeader | `components/ui/card.tsx` | 重复卡片样式 |
| Badge | `components/ui/badge.tsx` | 状态标签 |
| Spinner / LoadingBlock | `components/ui/spinner.tsx` | Loader2 手写 |
| Skeleton / SkeletonCard / SkeletonList | `components/ui/skeleton.tsx` | animate-pulse |
| Modal | `components/ui/modal.tsx` | 6+ 处手写模态 |
| ConfirmDialog | `components/ui/confirm-dialog.tsx` | 原生 confirm() |
| useConfirm | `components/ui/use-confirm.tsx` | Promise 化确认 hook |
| Toast / ToastProvider / useToast | `components/ui/toast.tsx` | alert / 状态浮层 |
| barrel export | `components/ui/index.ts` | 统一导入 |

设计 tokens：`app/globals.css` `@theme` 块定义完整调色板（cream/mist/sky/mint/leaf/sakura/bloom/rose/rose-ink/ink/dim/paper/slate/slate-soft/teal + 语义阴影 + 扩展装饰色），token 类已验证生成到产出 CSS。

### 第二阶段：应用组件库

**原生 confirm() → ConfirmDialog（7/7 处，0 残留）**
- `AnniversaryWall.tsx` — 纪念日删除
- `MemoryArchive.tsx` → `memories/MemoryArchiveCard.tsx` — 回忆删除
- `MemoryCitySheet.tsx` — 回忆删除 + 地标删除
- `time-capsule/page.tsx` — 时光胶囊删除
- `ProvinceMap/MemoryCard.tsx` — 回忆删除 + 地标删除

**手写模态 → Modal（7/7 处，0 残留）**
- `AnniversaryWall.tsx`、`WhisperWall.tsx`、`time-capsule/page.tsx`
- `memories/AddMemoryPanel.tsx`（原 MemoryArchive 内联）
- `MemoryTools.tsx`、`city-picker.tsx`

**状态浮层 → useToast**
- `WhisperWall.tsx`、`AnniversaryWall.tsx`、`MemoryArchive.tsx`、`MemoryTools.tsx`

**Loader2 → Spinner（0 残留，仅 spinner.tsx 自身用 Loader2 实现）**
- `WhisperWall.tsx`、`time-capsule/page.tsx`、`MemoryArchive.tsx`
- `MemoryCitySheet.tsx`、`MemoryDetailSheet.tsx`、`ProvinceMap/MemoryCard.tsx`

**手写骨架 → Skeleton**
- `time-capsule/page.tsx`

**重复函数清理（活跃文件 0 残留）**
- `isBrowserImageUrl`（5 处）→ `lib/image.ts`
- `daysUntil`（2 处）→ `lib/dateFormat.ts`
- `photoPayload` / `memoryPhotosPayload`（4 处）→ `lib/photoPayload.ts`

**全局基础设施**
- `app/layout.tsx` 注入 ToastProvider
- `app/error.tsx` 全局错误边界（Next.js 16 `unstable_retry` API）
- `app/not-found.tsx` 404 兜底页

### 第三阶段：硬编码色全量迁移 ✅

- TSX/TS 文件硬编码十六进制色：**0 处**
- CSS 类中硬编码色：**0 处**（`rgb()` 全部迁移为 `color-mix(in srgb, var(--color-*) N%, transparent)`）
- `@theme` 块内 token 定义：53 处（这是定义本身，非硬编码）
- SVG / JS 色值改为 `var(--color-*)`
- `app/globals.css` 扩展了入口页暖色、天气像素图标、状态色等装饰 token

### 第四阶段：拆分巨型组件 ✅

**ProvinceMap.tsx（2273 → 853 行）**
```
components/ProvinceMap/
├── shared.ts              # 共享类型、常量、工具函数、marker 布局（107 行）
├── CityMarker.tsx         # 城市标记（111 行）
├── CityPreviewPopover.tsx # 城市预览浮卡（48 行）
├── MemoryCard.tsx         # 回忆卡片含 CRUD + 表单（1054 行）
├── MemoryImage.tsx        # 图片渲染（30 行）
└── LandmarkSprite.tsx     # 地标精灵（32 行）
```
主组件保留：地图渲染 + 状态编排 + 缩放/拖拽（853 行）

**MemoryArchive.tsx（1048 → 355 行）**
```
components/memories/
├── AddMemoryPanel.tsx     # 新增回忆表单（560 行）
└── MemoryArchiveCard.tsx  # 归档卡片（129 行）
```
主组件保留：页面壳、数据编排、分组和详情抽屉联动

**MemoryCitySheet.tsx（1266 → 1121 行，已提取 3 个子模块）**
```
components/memories/
├── MemoryCitySheet.tsx    # 主抽屉壳 + 表单（1121 行）
├── MemoryGallery.tsx      # 画廊视图（33 行）
├── MemoryHistory.tsx      # 历史视图（149 行）
└── MobileMemoryImage.tsx  # 移动端图片（28 行）
```

### 第五阶段：登录态响应式 ✅

- `lib/authContext.tsx` — `AuthProvider` + `useAuth()`，`useSyncExternalStore` 订阅 session/admin-mode
- `app/layout.tsx` 注入 `AuthProvider`
- `authStore.ts` 登录/刷新/登出广播 `mapofus:session-updated`
- `useContentEditAccess` / `useMemoryEditAccess` 基于 `useAuth()`，移除 setTimeout 模拟

### 第六阶段：错误处理统一 ✅

- `apiClient.ts` — `ApiError` / `apiErrorFromResponse()` / `throwApiError()`，统一解析后端错误并映射 status→code
- `apiJson()` 与 SWR fetcher 抛出带 `code/status/path` 的 `ApiError`
- `upload.ts` 直传失败抛出错误，不再静默回退

### 第八阶段：死代码清理 ✅

- 删除 `TimeCapsuleGrid.tsx`（无引用，与 time-capsule/page.tsx 重复）
- 清理 `data/memories.ts` 空数组及空数据合并逻辑
- 简化 `LocalPrivacyImage.tsx`，删除禁用的隐私替换分支；删除无引用 `lib/localPrivacy.ts`
- 删除 `MemoryTools.tsx` 混乱的 capsule 配置与无引用 `TimeCapsulePage` 导出

### 第九阶段：CSS var() 迁移 ✅（瘦身部分未完成）

- CSS 类中 `rgb()` 色值迁移为 `color-mix(in srgb, var(--color-*) N%, transparent)`（40+ 处）
- 保留装饰性色值（sepia/clay/parchment 等登录页纹理色）作为 `@theme` 扩展 token

---

## 待实施

### MemoryCitySheet 表单拆分（优先级：低）

`MemoryCitySheet.tsx` 1121 行，已提取 Gallery/History/MobileImage。剩余主体含创建/编辑表单 + CRUD，可进一步拆出 `MemoryForm.tsx`。

### catch 块错误码区分（优先级：低）

- 各 catch 根据 `ApiError.code` 区分提示文案（网络错误 / 权限不足 / 配额超限 / 服务端错误）

### globals.css 进一步瘦身（优先级：低）

- 合并 `.login-*` / `.entry-*` 两套类为参数化单套（CSS 变量或 data-attribute 区分）
- 评估哪些 CSS 可迁移为 Tailwind 工具类
- 当前 885 行，目标 ~300 行

---

## 验证命令

```bash
cd apps/web
npm run typecheck   # TypeScript 类型检查
npm run lint        # ESLint（0 错误 0 警告）
npm run build       # 生产构建（45 页静态导出）
```

---

## 文件行数变化

| 文件 | 优化前 | 优化后 | 变化 |
|------|--------|--------|------|
| `ProvinceMap.tsx` | 2284 | 853 | -62% |
| `MemoryArchive.tsx` | 1048 | 355 | -66% |
| `MemoryCitySheet.tsx` | 1266 | 1121 | -11%（已提取 3 子模块） |
| **三个巨型文件合计** | **4598** | **2329** | **-49%** |

拆分产出的新文件：
| 文件 | 行数 |
|------|------|
| `ProvinceMap/shared.ts` | 107 |
| `ProvinceMap/CityMarker.tsx` | 111 |
| `ProvinceMap/CityPreviewPopover.tsx` | 48 |
| `ProvinceMap/MemoryCard.tsx` | 1054 |
| `ProvinceMap/MemoryImage.tsx` | 30 |
| `ProvinceMap/LandmarkSprite.tsx` | 32 |
| `memories/AddMemoryPanel.tsx` | 560 |
| `memories/MemoryArchiveCard.tsx` | 129 |
| `memories/MemoryGallery.tsx` | 33 |
| `memories/MemoryHistory.tsx` | 149 |
| `memories/MobileMemoryImage.tsx` | 28 |

---

## 质量指标

| 指标 | 优化前 | 优化后 |
|------|--------|--------|
| 原生 `confirm()` | 7 处 | 0 |
| 手写模态 `fixed inset-0 z-50` | 7 处 | 0 |
| `Loader2` 手写 | 8+ 处 | 0（仅 spinner.tsx 内部） |
| 手写 `animate-pulse` 骨架 | 1 处 | 0 |
| 硬编码十六进制色（TSX/TS） | 250+ 处 | 0 |
| 重复函数定义 | 14 处 | 0 |
| 全局错误边界 | 无 | error.tsx + not-found.tsx |
| 登录态响应式 | 非响应式 | AuthProvider + useAuth |
| API 错误处理 | 笼统文本 | ApiError + 错误码 |
| 最大文件行数 | 2284 | 1121 |
