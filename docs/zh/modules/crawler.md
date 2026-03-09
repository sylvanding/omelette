# PDF 爬取模块

多通道下载：Unpaywall → arXiv → 直链回退。

## 功能

- **Unpaywall：** 开放获取链接（需 UNPAYWALL_EMAIL）
- **arXiv：** 预印本 PDF
- **直链：** 回退
- **异步任务：** 进度与重试

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/projects/{id}/crawler/start` | 启动爬取 |
| GET | `/projects/{id}/crawler/stats` | 统计 |
