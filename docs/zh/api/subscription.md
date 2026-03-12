# Subscription API

路径：`/api/v1/projects/{project_id}/subscriptions`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /feeds | 常用学术 RSS 模板 |
| GET | / | 列表 |
| POST | / | 创建 |
| GET | /{sub_id} | 获取 |
| PUT | /{sub_id} | 更新 |
| DELETE | /{sub_id} | 删除 |
| POST | /{sub_id}/trigger | 手动触发更新 |
| POST | /check-rss | 检查 RSS |
| POST | /check-updates | 检查 API 更新 |

## 说明

订阅模块用于增量文献更新（RSS / API 检索）。创建订阅后可定期或手动触发，检查新文献并导入项目。
