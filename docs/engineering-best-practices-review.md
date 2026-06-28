# 工程最佳实践审查

审查时间：2026-06-28

## 当前推送状态

- 最新代码已推送到 GitHub：`a4425d5 Centralize memory cache updates`
- 近期相关提交：
  - `45b09d4 Add image fallback sync job`
  - `46ab09b Use pixel flowers for mobile badges`
  - `a4425d5 Centralize memory cache updates`
- 已验证：
  - `npm run typecheck -w @map-of-us/web`
  - `npm run lint -w @map-of-us/web`
  - `go test ./...`
- 未推送的本地文件：
  - `backend/data/ourMemories.db`
  - `docs/deployment-stable-notes.md`
  - `docs/ngrok-内网映射指南.md`
  - `docs/our-memories.tar.gz`

## 总体结论

项目当前能运行，功能推进速度也比较快，但还没有完全达到模块化最佳实践。主要问题集中在两个方向：

1. 前端核心交互组件过大，表单、接口请求、缓存更新、权限判断和 UI 展示混在一起。
2. 后端 handler 承担了过多职责，SQL、事务、权限、照片副作用、缓存清理和响应拼装都集中在 HTTP 层。

这些问题短期不会阻塞上线，但会影响后续推送通知、照片同步、移动端、多端实时更新等功能的稳定扩展。

## 主要风险

### P1：回忆编辑逻辑重复

涉及文件：

- `apps/web/components/memories/MemoryCitySheet.tsx`
- `apps/web/components/ProvinceMap/MemoryCard.tsx`

这两个组件都包含回忆编辑相关流程：

- 开始编辑
- 删除回忆
- AI 润色
- 选择图片
- 保存回忆
- 设置封面
- 地标图上传与删除

风险：

- 同一个业务规则容易在两个地方实现不一致。
- 修复一个入口后，另一个入口可能仍然存在旧 bug。
- 后续加入推送通知、操作日志、离线重试时，会继续复制流程。

建议：

- 抽出 `useMemoryEditor` 或 `MemoryFormController`。
- 组件只负责展示和交互布局。
- 保存、上传、校验、错误状态、草稿图片释放等逻辑统一放入 hook 或控制器。

建议拆分目标：

```text
components/memories/
  MemoryForm.tsx
  MemoryEditorSheet.tsx
  MemoryEditorPanel.tsx
  useMemoryEditor.ts
```

### P1：后端 handler 职责过重

涉及文件：

- `backend/handlers/memory.go`
- `backend/handlers/backup.go`
- `backend/handlers/store.go`

典型问题：

- handler 直接使用 `db.DB.Query`、`db.DB.Exec`、`db.DB.Begin`。
- handler 同时处理参数绑定、权限判断、事务、照片保存、缓存清理、响应组装。
- 业务流程难以单元测试，只能通过较重的 handler 测试覆盖。

风险：

- 业务规则分散，后续新增推送通知时容易写进 handler，进一步变成面条代码。
- 数据库变更或 OSS/S3 变更时，影响面较大。
- 同类业务难以复用，例如回忆、周年卡、时间胶囊都有相似的照片处理模式。

建议分层：

```text
backend/
  handlers/
    memory.go          # 只处理 HTTP 入参、鉴权上下文、响应
  services/
    memory_service.go  # 业务流程、权限规则、缓存、通知触发
  repositories/
    memory_repo.go     # SQL 查询与事务
  storage/
    storage.go         # 对象存储接口
```

handler 理想形态：

```go
func CreateMemory(c *gin.Context) {
    var req CreateMemoryRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        utils.Error(c, 400, "Invalid request")
        return
    }

    result, err := memoryService.Create(c.Request.Context(), RequestContext(c), req)
    if err != nil {
        writeServiceError(c, err)
        return
    }

    utils.Success(c, result)
}
```

### P2：地图组件边界不清

涉及文件：

- `apps/web/components/ProvinceMap.tsx`

当前该组件同时负责：

- 地图相机和缩放
- 拖拽与长按
- 城市选择
- 城市回忆加载
- SWR 缓存更新
- 回忆增删改
- 城市地标图增删改
- 移动端 sheet 状态
- 桌面端卡片定位

风险：

- 任一行为修改都可能影响地图交互。
- 新增功能时很难判断代码应该放在哪一层。
- 对“新增回忆后地图刷新”这类状态同步问题不够直观。

建议拆分：

```text
ProvinceMap.tsx
ProvinceMapCanvas.tsx
ProvinceMapOverlay.tsx
useProvinceMapData.ts
useMapCamera.ts
useCitySelection.ts
useCityAssets.ts
```

其中：

- `useProvinceMapData` 负责回忆 summary、城市回忆详情、缓存发布。
- `useMapCamera` 负责缩放、拖拽、视口约束。
- `useCitySelection` 负责选中城市、移动端 sheet 模式、长按预览。
- `ProvinceMap.tsx` 只组合这些能力。

### P2：照片同步 job 可用，但边界仍偏紧

涉及文件：

- `backend/jobs/photo_sync.go`
- `backend/storage/s3.go`

当前 job 不是只扫描回忆，而是扫描配置在 `photoTables` 里的照片表。它会查找：

- `data:image/...`
- `/local-images/...`
- `http.../local-images/...`

然后尝试上传到对象存储并更新数据库 URL。

优点：

- 启动后会延迟执行一次。
- 后续按 `PHOTO_SYNC_INTERVAL` 周期执行。
- 已有开始、结束、耗时、错误日志。

风险：

- job 直接使用数据库全局变量。
- job 直接依赖 storage 包的具体实现。
- 难以用 mock 测试 OSS 上传失败、数据库更新失败、清理失败等场景。

建议：

```text
jobs/
  photo_sync.go
services/
  photo_sync_service.go
repositories/
  photo_repo.go
storage/
  storage.go
```

核心接口：

```go
type ObjectStorage interface {
    UploadLocalObject(ctx context.Context, key string) (url string, objectKey string, err error)
    PublicURLForKey(key string) string
    DeleteObject(ctx context.Context, key string) error
}
```

### P2：S3/OSS 存储模块使用全局 client

涉及文件：

- `backend/storage/s3.go`

当前存储模块使用包级变量保存 S3 client。短期简单，但长期有几个问题：

- 单元测试要修改全局状态。
- 不同环境或不同 bucket 难以并行测试。
- 后续支持多空间独立存储配置时扩展困难。

建议：

- 保留当前外部 API，内部逐步抽象 `Storage` 接口。
- handler/job 不直接调用具体 S3 函数，改为依赖 service 注入。
- 测试中使用 fake storage。

当前实施状态：

- 已新增 `backend/storage/storage.go`，定义 `ObjectStorage`、`Default`、`SetDefault`。
- `backend/storage/s3.go` 已引入 `S3Storage` 实例，S3 client 从包级变量迁入实例字段。
- 原有 `storage.UploadImageWithKey`、`storage.DeleteObject`、`storage.KeyFromURL` 等包级函数保留为兼容 wrapper。
- 上传、照片批量清理、设置/城市素材/登录图旧图删除、`photo_sync` job 已改为通过 `ObjectStorage` 调用对象存储能力。
- `backend/jobs/photo_sync_test.go` 已使用 fake storage 覆盖上传、清理和禁用存储时的分支。

剩余可继续优化：

- 备份导入/导出中的 URL 重写仍使用兼容 wrapper，后续如支持多存储配置，可继续改为显式注入。
- `photo_sync` 仍保留在 job 层编排，后续可以下沉为 `PhotoSyncService`，进一步隔离调度和业务同步。

### P2：测试覆盖不足

当前测试文件：

- `backend/handlers/backup_test.go`
- `backend/storage/s3_test.go`
- `backend/storage/s3_smoke_test.go`

缺口：

- 前端没有针对回忆缓存同步的测试。
- 地图新增回忆后 summary 刷新缺少回归测试。
- 照片同步 job 没有直接测试。
- memory create/update/delete 的核心服务逻辑没有独立测试。

建议优先补：

1. `useMemoryCachePublisher` 的单元测试。
2. 回忆新增后 summary 和 city detail cache 同步测试。
3. `RunPhotoSyncOnce` 的 job/service 测试。
4. memory service 的创建、编辑、补充回忆、删除权限测试。

## 已经做对的方向

### 回忆缓存发布已经集中化

涉及文件：

- `apps/web/lib/memoryStore.ts`
- `apps/web/components/MemoryArchive.tsx`
- `apps/web/components/ProvinceMap.tsx`

这次新增的 `useMemoryCachePublisher` 是正确方向。它把回忆变更后的缓存发布集中到一个位置，避免每个页面自己手动维护 summary 和 city detail。

这个模式应该继续推广：

- city assets
- settings
- anniversary cards
- time capsules
- whispers

### 照片同步 job 已经具备基础生产可观测性

涉及文件：

- `backend/jobs/photo_sync.go`

它已经输出：

- 是否启用
- 执行周期
- 开始时间
- 更新数量
- 耗时
- 错误

这比完全静默的后台 job 更适合线上排查。

## 推荐改造顺序

### 第一阶段：先稳住回忆主链路

目标：

- 不大改 UI。
- 抽出回忆编辑和缓存更新。
- 降低新增 bug 风险。

任务：

1. 抽 `useMemoryEditor`。
2. 抽 `memoryApi`，统一 create/update/delete/setCover。
3. 给 `useMemoryCachePublisher` 补测试。
4. 保留现有 UI 样式，只减少重复逻辑。

### 第二阶段：拆地图组件

目标：

- 地图交互、数据加载、UI 展示分层。

任务：

1. 抽 `useProvinceMapData`。
2. 抽 `useMapCamera`。
3. 抽 `useCitySelection`。
4. `ProvinceMap.tsx` 只做组合。

### 第三阶段：后端引入 service/repository

目标：

- handler 变薄。
- 业务逻辑可测试。
- 给后续推送通知留扩展点。

任务：

1. 从 memory 模块开始。
2. 新建 `services/memory_service.go`。
3. 新建 `repositories/memory_repo.go`。
4. handler 调 service。
5. 在 service 层触发缓存清理和通知事件。

### 第四阶段：推送通知前先做事件模型

不要在每个 handler 里直接写推送逻辑。建议先抽事件：

```go
type DomainEvent struct {
    Type    string
    SpaceID string
    ActorID string
    TargetID string
}
```

例如：

- `memory.created`
- `memory.updated`
- `memory.deleted`
- `anniversary.created`
- `time_capsule.opened`

然后由 notification service 订阅这些事件。这样后续换成 WebPush、极光、个推、FCM 或厂商通道时，不需要改业务 handler。

## 当前实施进度

更新时间：2026-06-28

### 已完成：前端回忆编辑逻辑收敛

已完成内容：

1. 新增 `apps/web/lib/memoryApi.ts`，集中封装回忆 create/update/delete/setCover 等接口调用。
2. 新增 `apps/web/components/memories/useMemoryEditor.ts`，集中管理回忆编辑、删除、AI 润色、图片处理和保存状态。
3. `MemoryCitySheet` 和 `MemoryCard` 已改为复用统一编辑 hook，减少两处入口的业务逻辑重复。
4. `MemoryArchive`、`ProvinceMap` 等入口继续通过统一缓存发布逻辑刷新 summary 和 city detail。

当前状态：

- 回忆编辑主链路已经完成第一轮拆分。
- UI 展示组件职责明显变轻。
- `ProvinceMap.tsx` 已继续完成数据、相机、选中城市三类 hook 的第一轮拆分。

### 已完成：地图组件拆分

新增文件：

1. `apps/web/components/ProvinceMap/useProvinceMapData.ts`
2. `apps/web/components/ProvinceMap/useMapCamera.ts`
3. `apps/web/components/ProvinceMap/useCitySelection.ts`
4. `apps/web/components/ProvinceMap/ProvinceMapCanvas.tsx`
5. `apps/web/components/ProvinceMap/ProvinceMapOverlay.tsx`
6. `apps/web/components/ProvinceMap/CityListPanel.tsx`

主要变化：

- `useProvinceMapData` 集中管理回忆 summary、城市详情缓存、城市素材、城市边界加载，以及回忆和地标图的 API 写操作。
- `useMapCamera` 集中管理地图缩放、拖拽、frame 缩放比例、滚轮缩放和拖拽后点击吞掉逻辑。
- `useCitySelection` 集中管理选中城市、移动端 sheet 模式、点亮动效、hover 预览和长按预览。
- `ProvinceMapCanvas` 接管 SVG 地图、城市区块、轨迹线、城市 marker 和 hover 预览。
- `CityListPanel` 接管桌面端城市列表。
- `ProvinceMapOverlay` 接管缩放控制、桌面回忆卡和移动端 sheet。
- `ProvinceMap.tsx` 主要保留地图几何计算、路线计算、状态组合和子组件装配。

当前状态：

- 地图的数据层、相机交互层、城市选择层、主要渲染层已经从主组件中拆出。
- 后续如继续压缩主组件，可把地图几何和路线计算下沉为 `useProvinceMapGeometry`。

### 已完成：后端 service/repository 分层

已完成模块：

1. `memory`
2. `anniversary`
3. `timecapsule`
4. `whisper`
5. `settings`
6. `auxiliary_items`
7. `auth`
8. `admin_auth`
9. `middleware/permission`
10. `admin`
11. `photo_sync`
12. `backup`
13. `create_admin`
14. 默认空间 seed
15. 环境管理员 seed

主要变化：

- 后端已引入 GORM，并保留 `db.DB` 作为迁移、测试和少量动态 SQL 边界的底层连接。
- 新增 `backend/repositories/`，数据库读写集中进入 repository。
- 新增 `backend/services/`，业务规则、事务编排、权限规则和响应数据组装逐步从 handler 移出。
- `handlers/backup.go` 已从 600 多行收缩为薄 handler，导入/导出编排进入 `BackupService`，动态恢复 SQL 进入 `BackupRepository`。
- `jobs/photo_sync.go` 不再直接持有 `db.DB`，改为通过 GORM-backed `PhotoSyncRepository` 查询和更新。
- `cmd/create_admin.go`、`db/seed.go`、`db/admin_seed.go` 已改为走 account repository/service，不再手写业务 SQL。
- `backend/handlers/photo_records.go` 已删除，照片记录收集逻辑已迁移到 repository/service 边界。

当前仍保留 SQL 的合理边界：

- `backend/db/sqlite.go`：schema 创建、字段补齐、索引创建属于迁移层，继续使用 SQL 更直接。
- `backend/handlers/backup_test.go`：测试数据准备和断言继续使用 SQL，便于精确验证数据库状态。
- `backend/repositories/backup_repo.go`：备份恢复需要动态表名和动态列，已隔离在 repository 内，并通过 GORM transaction/exec 执行。
- `backend/handlers/admin.go`：`logAuditAction` 保留 `db.DB` fallback，仅用于测试或混合初始化场景下 `db.Gorm == nil` 的兼容。

### 已完成：服务层与 repository 单元测试

新增文件：

- `backend/services/service_test.go`
- `backend/repositories/photo_sync_repo_test.go`

覆盖内容：

1. `MemoryService`
   - 创建回忆时默认 visibility 为 `both`。
   - 上传后照片 key 会进入数据库记录。
   - 写操作后会清理回忆缓存。
   - 非创建者不能改核心字段。
   - 非创建者可以写 partner note，并记录 author。
   - 触发 `memory.created`、`memory.updated` 事件。
2. `TimeCapsuleService`
   - 未开启胶囊达到 3 个时阻止继续创建，且不会先上传照片。
   - 未到开启日期时禁止打开。
   - 到期胶囊打开后会标记 `is_opened = 1`。
   - 触发 `time_capsule.opened` 事件。
3. `BackupService`
   - 非管理员导入会替换当前空间。
   - 导入时会重写备份中的媒体 URL。
   - 返回需要清理缓存的空间范围。
4. `AnniversaryService`
   - 创建、更新、删除会发布对应 domain event。
   - 非创建者禁止更新和删除。
   - 替换照片时只删除不再引用的旧照片。
   - 写操作后会清理纪念日缓存。
5. `SettingService`
   - 缺省设置会从环境变量兜底。
   - 已保存设置优先于环境变量默认值。
   - 辅助事项可创建、更新、按 kind 查询和删除。
6. `AccountService`
   - 登录校验空间密码并返回用户、空间和 token。
   - 密码长度规则会阻止过短密码。
   - 修改空间密码后新密码可登录。
   - 管理员创建、重复创建、错误登录和正确登录规则已覆盖。
7. `PhotoSyncRepository`
   - 能筛出 data URL、本地 fallback URL 和代理本地 URL。
   - 不会把已是 CDN 的照片列入待同步。
   - 更新照片位置时会校验原 URL，避免覆盖并发变化。

### Go 接口使用策略

当前后端没有把每个 service/repository 都抽成接口，这是有意的：

- repository 目前基本都是 GORM 的单实现封装，直接注入 concrete struct 更少样板、更容易追踪 SQL 边界。
- 接口优先放在调用方真正需要替换实现的边界，例如 `events.Publisher`、上传/删除函数类型、后续 notification sender、storage client。
- 测试优先使用真实 repository + in-memory SQLite 验证事务、约束和动态 SQL；外部副作用再用小接口或函数类型替身隔离。
- 后续抽 S3/OSS storage interface 是合理方向，因为它隔离外部对象存储副作用，并且能明显降低照片同步、删除、备份相关测试成本。

### 已完成：缓存失效集中化

新增文件：

- `backend/cache/invalidation.go`

主要变化：

- 新增 `ClearMemorySpace`、`ClearAnniversarySpace`、`ClearCityAssetsSpace`、`ClearTimeCapsuleSpace`、`ClearAdmin`、`ClearSpace`。
- 原先散落在 handler、service、backup import 中的缓存 key 规则已集中到 `cache` 包。
- `MemoryService`、`AnniversaryService`、`TimeCapsuleService` 和备份导入流程已改为调用统一缓存失效函数。

### 已完成：domain event 模型

新增文件：

- `backend/events/events.go`

主要变化：

- 新增 `DomainEvent`、`Publisher`、`PublisherFunc`、`NoopPublisher`、`Dispatcher`。
- 定义事件类型：
  - `memory.created`
  - `memory.updated`
  - `memory.deleted`
  - `anniversary.created`
  - `anniversary.updated`
  - `anniversary.deleted`
  - `time_capsule.created`
  - `time_capsule.updated`
  - `time_capsule.opened`
  - `time_capsule.deleted`
  - `whisper.created`
  - `whisper.replied`
  - `whisper.deleted`
- `MemoryService`、`AnniversaryService`、`TimeCapsuleService`、`WhisperService` 已支持注入 publisher。
- 默认 publisher 为 no-op，不改变当前 API 行为；后续通知服务可以订阅 service 层事件，不需要把推送逻辑写回 handler。

### 已完成：回忆照片 payload 元数据传递

主要变化：

- `apps/web/lib/photoPayload.ts` 新增 `PhotoPayload` 类型和 `uploadedPhotosPayload` helper。
- `apps/web/lib/memoryApi.ts` 支持创建回忆时显式传入完整照片 payload。
- `useMemoryEditor` 在新建回忆和替换照片时保留上传返回的 `key`、`width`、`height`、`mimeType`。
- `AddMemoryPanel` 已复用同一 helper，避免归档页新增入口丢失照片尺寸信息。
- 编辑回忆并替换照片时同步传 `coverImage`，让后端能把新照片首图设为封面记录。

当前状态：

- 前端上传返回的对象 key 和图片元数据会进入后端 `PhotoInput`，再写入 `memory_photos`。
- 默认城市图或历史 URL 仍通过 `photoPayload` 补空 key 和默认 MIME，不改变现有兼容行为。

### 已完成：S3/OSS storage interface 与文件职责拆分

新增文件：

- `backend/storage/storage.go`
- `backend/storage/compat.go`
- `backend/storage/keys.go`
- `backend/storage/upload.go`
- `backend/storage/delete.go`
- `backend/storage/local.go`
- `backend/jobs/photo_sync_test.go`

主要变化：

- 新增 `ObjectStorage` 接口，覆盖上传、直传签名、删除、URL/key 解析、本地 fallback 上传等对象存储能力。
- 新增 `S3Storage` 实例，S3 client 不再直接放在 `storage` 包级变量中；`s3.go` 现在只保留 S3 客户端构造和实例状态。
- 原来集中的 `s3.go` 已按职责拆分：兼容 wrapper、URL/key 解析、上传/签名、删除、本地 fallback 分别落到独立文件。
- `Default`/`SetDefault` 保留默认实例和测试替换点。
- 原包级函数保留为兼容 wrapper，降低迁移风险。
- `handlers/upload.go`、`handlers/image_upload.go`、`handlers/photo_cleanup.go`、`handlers/setting.go`、`handlers/store.go`、`jobs/photo_sync.go` 已迁移到 `ObjectStorage` 调用。
- `photo_sync` 新增 fake storage 测试，验证 job 走注入存储而不是硬编码全局 S3 函数。

当前状态：

- 照片上传、删除和后台同步已具备 fake storage 测试能力。
- 备份 URL 重写仍通过兼容 wrapper 使用默认 storage，后续多存储配置时再继续显式注入。

### 当前验证结果

已重新执行并通过：

```bash
npm run typecheck -w @map-of-us/web
cd backend && go test -count=1 ./...
npm run lint -w @map-of-us/web
```

验证结论：

- 前端 TypeScript 类型检查通过。
- 后端所有 Go 测试通过。
- 前端 ESLint 检查通过。
- 当前迁移没有破坏现有 API 响应形状和前端编译。

### 剩余建议

优先级从高到低：

1. 后续可继续拆 `useProvinceMapGeometry`，把地图投影、城市坐标和路线计算从 `ProvinceMap.tsx` 下沉。
2. 将 `events.Publisher` 接入通知服务或异步队列，实现 WebPush/厂商推送时只订阅事件，不改业务 service。
3. 继续把备份 URL 重写和 `photo_sync` 编排下沉到显式 service/storage 注入边界。
4. 持续补充 service/repository 的边界测试，例如错误注入、事务回滚和并发覆盖场景。

## 结论

当前文档中的核心规划目标已经完成第一轮落地：

1. 前端回忆编辑逻辑已收敛。
2. `ProvinceMap.tsx` 已完成数据、相机、选择状态和主要渲染层拆分。
3. 后端已引入 service/repository 分层。
4. 关键服务层测试已补齐第一批。
5. 缓存失效规则已集中。
6. domain event 模型已准备好，后续通知不需要重新污染 handler。
7. 回忆照片保存链路已保留上传对象 key、尺寸和 MIME 元数据。
8. `AnniversaryService`、`SettingService`、`AccountService`、`PhotoSyncRepository` 已补上核心单元测试。
9. S3/OSS storage 已完成第一阶段接口化，上传、删除和照片同步可使用 fake storage 测试。

下一轮不建议继续做大范围横向重构，优先拆地图渲染层、接入事件 publisher，或继续下沉备份/photo sync 的显式注入边界。
