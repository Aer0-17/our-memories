# 移动端优化总结

## 完成的优化项

### 1. ✅ 登录页满屏显示
**问题**: 登录页在移动端没有铺满整个屏幕

**原因**: `layout.tsx` 中的 `html` 和 `body` 标签使用了 `h-full` 和 `min-h-full`，导致高度计算错误

**解决方案**:
- 移除了 `html` 标签的 `h-full` class
- 移除了 `body` 标签的 `min-h-full` class
- 保留 `EntryExperience.tsx` 中的 `h-[100dvh]`（使用动态视口高度）

**修改文件**: `apps/web/app/layout.tsx`

---

### 2. ✅ 自动保持登录状态（长效token）
**问题**: 每次打开应用都要重新登录

**原因**: 虽然后端已实现 30天的 refreshToken，前端也实现了自动刷新机制，但登录页没有检查已有的 session

**解决方案**:
- 在 `EntryExperience.tsx` 的 `useEffect` 中添加了 session 检查
- 如果检测到有效的 `accessToken`，自动跳转到 `/map`
- 保留了现有的 token 自动刷新机制（apiClient.ts 已实现）

**技术细节**:
- AccessToken: 30分钟有效期
- RefreshToken: 30天有效期
- 自动刷新: 当API返回401时，使用refreshToken获取新的accessToken
- 持久化: 使用 localStorage 存储 session

**修改文件**: `apps/web/components/EntryExperience.tsx`

---

### 3. ✅ 请求缓存避免重复加载
**问题**: 所有请求都使用 `cache: "no-store"`，导致每次都重新加载

**解决方案**:
- 安装了 `swr` 库（轻量级数据获取hook）
- 创建了 `apps/web/lib/swr.ts` 统一封装
- 修改了 `apiClient.ts`，移除强制的 `no-store`
- 在 `MemoryArchive.tsx` 中应用了 SWR

**SWR 配置**:
- `revalidateOnFocus: false` - 窗口聚焦时不重新验证
- `dedupingInterval: 60000` - 60秒内的重复请求会被合并
- 自动缓存和去重
- 支持乐观更新（mutate）

**修改文件**:
- `apps/web/lib/apiClient.ts`
- `apps/web/lib/swr.ts` (新建)
- `apps/web/components/MemoryArchive.tsx`

---

### 4. ✅ 悬浮FAB按钮
**状态**: 已经实现，无需修改

**说明**: `MemoryArchive.tsx` 中已经正确实现了悬浮的 FAB（Floating Action Button）:
- 位置: 固定在右下角（`fixed bottom-6 right-6`）
- 样式: 粉色圆形按钮，带阴影和hover效果
- 交互: 点击打开弹窗表单

其他页面（如 `AnniversaryWall.tsx`）使用侧边栏设计，不需要FAB。

---

## 技术栈

- **前端框架**: Next.js 16.2.6 (App Router + Turbopack)
- **移动端**: Capacitor 8.0（将Web打包成原生应用）
- **数据获取**: SWR 2.x
- **认证**: JWT (accessToken + refreshToken)
- **后端**: Fastify + Prisma

---

## 构建验证

```bash
npm run build -w @map-of-us/web
```

✅ 构建成功，所有46个路由正常生成

---

## 使用说明

### 开发模式
```bash
npm run dev -w @map-of-us/web
```

### 同步到移动端
```bash
cd apps/mobile
npm run sync        # 同步到 iOS 和 Android
npm run android     # 运行 Android
npm run ios         # 运行 iOS
```

---

## 后续建议

1. **SWR扩展**: 可以将其他组件（如 `AnniversaryWall.tsx`、`MemoryTools.tsx`）也改用 SWR
2. **全局配置**: 在 `layout.tsx` 中添加 `<SWRConfig>` 提供全局配置
3. **错误重试**: 配置 SWR 的 `onError` 和 `errorRetryCount`
4. **离线支持**: 考虑使用 Service Worker 实现离线缓存

---

## 性能优化效果

- ⚡ **首次加载**: 使用 localStorage 检查登录状态，避免不必要的登录页渲染
- ⚡ **数据缓存**: SWR 自动缓存API响应，避免重复请求
- ⚡ **Token刷新**: 无感知的自动刷新，用户无需重新登录
- ⚡ **满屏体验**: 移动端登录页完全覆盖屏幕，更沉浸

---

生成时间: 2026-06-11
