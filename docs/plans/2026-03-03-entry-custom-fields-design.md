# 条目自定义键值对（仅按 value 搜索）设计

## 1. 背景
当前系统已支持：
- 条目基础字段：`keyword`、`note_text`、可选 `icon_path`
- 条目正文多图：`entry_images`
- 搜索命中：`keyword` 与 `note_text`

本次新增需求：
- 支持每个条目添加多组“自定义键值对”，value 可为文本或图片。
- 前端默认提供 `wechat_id:text` 一行输入 UI。
- `wechat_id` 不强制填写；若 value 为空，不写入数据库。
- 搜索时自定义字段只按 **value** 命中，不按 key 命中。

## 2. 目标与非目标
### 2.1 目标
- 支持同一条目存储多组字段（text/image）。
- 支持新增、编辑、删除自定义字段。
- 搜索可命中字段 value（文本与图片路径字符串）。
- 保持现有条目和 API 的兼容性。

### 2.2 非目标
- 不做按 key 搜索。
- 不做字段级权限、复杂校验规则模板。
- 不做字段级排序拖拽（仅简单顺序）。

## 3. 方案选择
已评估方案：
1. `entry_fields` 关系表（推荐）
2. `entries.extra_fields` JSON 列
3. 固定列扩展（如单独 `wechat_id`）

最终选择：**关系表**。

原因：
- 能稳定支持多字段、多类型（text/image）扩展。
- 查询和更新语义清晰，便于后续维护。
- 能在 SQL 层直接做 value 搜索，而无需复杂 JSON 解析。

## 4. 数据模型
新增表：`entry_fields`

- `id` INTEGER PRIMARY KEY
- `entry_id` INTEGER NOT NULL
- `field_key` TEXT NOT NULL
- `field_type` TEXT NOT NULL CHECK (`text` or `image`)
- `text_value` TEXT
- `image_path` TEXT
- `sort_order` INTEGER NOT NULL DEFAULT 0

约束语义：
- `field_type = text` 时使用 `text_value`。
- `field_type = image` 时使用 `image_path`。
- 空 value 字段不入库（由业务层过滤）。

## 5. API 变更
### 5.1 创建与更新
`POST /api/entries` 与 `PUT /api/entries/:id` 增加 `fields`：

- 文本字段：
  - `{ "key": "wechat_id", "type": "text", "textValue": "xxx" }`
- 图片字段：
  - `{ "key": "profile_qr", "type": "image", "imagePath": "images/xxx.png" }`

入库前规则：
- `key` 必填（去空白后非空）。
- `type` 仅允许 `text` / `image`。
- `text` 若 `textValue` 为空，则该字段直接忽略（不报错、不入库）。
- `image` 若 `imagePath` 缺失或非法，返回 `400`。

### 5.2 查询
- `GET /api/entries/:id` 返回 `fields` 数组。
- `GET /api/search` 继续返回列表摘要，字段详情不展开。

## 6. 搜索策略（最终确认版）
搜索词 `q` 命中条件：
- `entries.keyword LIKE '%q%'`
- `entries.note_text LIKE '%q%'`
- `entry_fields.text_value LIKE '%q%'`（文本字段）
- `entry_fields.image_path LIKE '%q%'`（图片字段路径）

明确不支持：
- `field_key` 搜索。

## 7. 前端交互
编辑区新增“自定义键值对”模块：
- 初始默认一行：`wechat_id` + `text` + 空值输入。
- 用户可新增/删除多行字段。
- 每行可选择类型：
  - `text`：输入文本 value
  - `image`：选择图片并上传后写入 `imagePath`
- 保存时仅提交有效字段。

详情回填：
- 若条目已有字段，按返回值渲染。
- 若条目无字段，展示默认空行 `wechat_id:text`（仅 UI 默认，不入库）。

## 8. 错误处理与兼容性
- `fields` 非数组：`400`。
- 字段 `key` 为空：`400`。
- 非法 `type`：`400`。
- `image` 字段路径非法：`400`。
- 旧数据（无字段）读取、更新、搜索应保持可用。
- 更新字段采用“整组替换”策略，移除字段时同步清理关联图片文件（失败记日志，不阻断）。

## 9. 验收标准
- 可创建带文本字段与图片字段的条目。
- 默认 `wechat_id` 未填时不写库。
- 可更新/删除字段并正确回填。
- 搜索可命中字段 value，不会因 key 命中。
- 现有基础功能（图标、正文图片、关键词/正文搜索）无回归。
