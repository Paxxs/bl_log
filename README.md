# bl_log

一个本地关键词备注网页服务。

- 本地存储：SQLite 单文件 + 本地图片目录
- 支持内容：关键词、备注文本、可选头像图标、多张正文图片
- 支持搜索：按关键词和备注正文做包含匹配

## 运行环境

- Bun 1.3+

## 安装与启动

```bash
bun install
bun run start
```

浏览器打开：`http://127.0.0.1:3000`

## 开发模式

```bash
bun run dev
```

## 测试

```bash
bun run test
```

## 本地数据目录

运行后自动创建：

- `data/app.db`：SQLite 数据文件
- `data/icons/`：条目头像图标
- `data/images/`：条目正文图片
