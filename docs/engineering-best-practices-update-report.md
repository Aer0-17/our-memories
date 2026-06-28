# 工程最佳实践规划更新报告

更新时间：2026-06-28

关联文档：`docs/engineering-best-practices-review.md`

## 本次目标

完成工程最佳实践审查文档中的规划目标，并整理本次更新报告。

## 已完成更新

### 前端

1. 回忆编辑逻辑收敛
   - 新增 `apps/web/lib/memoryApi.ts`
   - 新增 `apps/web/components/memories/useMemoryEditor.ts`
   - `MemoryCitySheet`、`ProvinceMap/MemoryCard` 已复用统一编辑 hook。

2. 地图组件拆分
   - 新增 `apps/web/components/ProvinceMap/useProvinceMapData.ts`
   - 新增 `apps/web/components/ProvinceMap/useMapCamera.ts`
   - 新增 `apps/web/components/ProvinceMap/useCitySelection.ts`
   - 新增 `apps/web/components/ProvinceMap/ProvinceMapCanvas.tsx`
   - 新增 `apps/web/components/ProvinceMap/ProvinceMapOverlay.tsx`
   - 新增 `apps/web/components/ProvinceMap/CityListPanel.tsx`
   - `ProvinceMap.tsx` 主要保留地图几何、路线计算、状态组合和子组件装配；数据、相机、选择状态和主要渲染层已下沉。

3. 回忆照片 payload 元数据传递
   - 新增 `uploadedPhotosPayload`，把上传返回的 `key/width/height/mimeType` 保留下来。
   - `memoryApi.createMemory` 支持显式照片 payload，新建回忆不再只能从 URL 字符串反推。
   - `useMemoryEditor` 和 `AddMemoryPanel` 已在保存链路传递完整照片 payload。
   - 编辑回忆替换照片时同步传 `coverImage`，让后端封面记录指向新照片。

### 后端

1. service/repository 分层
   - 新增 `backend/repositories/`
   - 新增 `backend/services/`
   - memory、anniversary、timecapsule、whisper、settings、auth、admin、backup、photo_sync 等模块已完成第一轮分层。

2. 服务层与 repository 单元测试
   - 新增 `backend/services/service_test.go`
   - 新增 `backend/repositories/photo_sync_repo_test.go`
   - 覆盖 `MemoryService`、`TimeCapsuleService`、`BackupService` 的关键规则。
   - 已补 `AnniversaryService`、`SettingService`、`AccountService` 的权限、缓存、事件和核心业务规则。
   - 已补 `PhotoSyncRepository` 的待同步照片筛选和条件更新规则。

3. 缓存失效集中化
   - 新增 `backend/cache/invalidation.go`
   - 回忆、纪念日、城市素材、时间胶囊、后台缓存清理入口已统一。

4. domain event 模型
   - 新增 `backend/events/events.go`
   - service 层已支持注入 publisher，默认 no-op，为后续通知服务预留事件订阅点。

5. Go 接口策略明确
   - 不为每个 service/repository 预先抽接口，单实现 GORM repository 继续使用 concrete struct。
   - 接口优先用于调用方需要替换实现的副作用边界，例如事件发布、通知、对象存储、上传/删除。
   - S3/OSS storage 已按这个策略完成第一阶段接口化。

6. S3/OSS storage interface 与文件职责拆分
   - 新增 `backend/storage/storage.go`，定义 `ObjectStorage`、`Default`、`SetDefault`。
   - `backend/storage/s3.go` 新增 `S3Storage`，S3 client 从包级变量迁入实例字段。
   - `backend/storage/s3.go` 进一步瘦身为客户端构造；兼容 wrapper、URL/key 解析、上传/签名、删除、本地 fallback 已拆到 `compat.go`、`keys.go`、`upload.go`、`delete.go`、`local.go`。
   - 上传、照片删除、设置/素材旧图删除、`photo_sync` job 已迁移到 `ObjectStorage`。
   - 新增 `backend/jobs/photo_sync_test.go`，用 fake storage 覆盖同步上传和清理分支。

## 验证结果

已通过：

```bash
npm run typecheck -w @map-of-us/web
cd backend && go test -count=1 ./...
npm run lint -w @map-of-us/web
```

## 剩余风险

1. `ProvinceMap.tsx` 后续还可继续拆 `useProvinceMapGeometry`，把地图投影、城市坐标和路线计算下沉。
2. event publisher 尚未接入实际通知服务。
3. 备份 URL 重写和 `photo_sync` 编排仍可继续下沉到更显式的 service/storage 注入边界。
