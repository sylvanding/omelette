# Projects API

路径：`/api/v1/projects`

## 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /projects | 列表（分页） |
| POST | /projects | 创建 |
| GET | /projects/{id} | 获取 |
| PUT | /projects/{id} | 更新 |
| DELETE | /projects/{id} | 删除 |
| POST | /projects/{id}/pipeline/run | 运行完整流程（爬取→OCR→索引） |
| POST | /projects/{id}/pipeline/paper/{paper_id} | 对单篇论文运行流程 |

## 请求体（创建/更新）

```json
{
  "name": "我的研究",
  "description": "可选描述",
  "domain": "可选领域",
  "settings": {}
}
```
