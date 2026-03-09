# OCR 解析模块

pdfplumber 文本提取，PaddleOCR GPU 扫描版。

## 功能

- **pdfplumber：** 数字版 PDF 文本提取
- **PaddleOCR：** GPU 加速扫描版
- **结构化输出：** chunk 类型、章节、页码

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/projects/{id}/ocr/process` | 执行 OCR |
| GET | `/projects/{id}/ocr/stats` | 统计 |
