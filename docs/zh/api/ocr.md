# OCR API

OCR 模块 API，用于对已下载 PDF 进行文本提取与分块。

**基础路径：** `/api/v1/projects/{project_id}/ocr`

---

## 端点概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/process` | 对指定或待处理文献执行 OCR |
| GET | `/stats` | 获取 OCR 统计信息 |

---

## POST /process

对项目内文献执行 OCR 文本提取。支持 pdfplumber（原生）与 PaddleOCR（扫描版）。

**查询参数**

| 参数名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `paper_ids` | list[int] | null | 指定文献 ID 列表；为空则处理所有 `pdf_downloaded` 状态文献 |
| `force_ocr` | bool | false | 是否强制重新 OCR（覆盖已有结果） |
| `use_gpu` | bool | true | 是否使用 GPU（PaddleOCR） |

**响应**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "processed": 5,
    "failed": 0,
    "total": 5
  }
}
```

**示例**

```bash
# 处理所有待 OCR 文献
curl -X POST "http://localhost:8000/api/v1/projects/1/ocr/process"

# 处理指定文献并强制重做
curl -X POST "http://localhost:8000/api/v1/projects/1/ocr/process?paper_ids=1&paper_ids=2&force_ocr=true"
```

---

## GET /stats

返回项目内 OCR 相关统计。

**响应**

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "pending": 10,
    "metadata_only": 5,
    "pdf_downloaded": 3,
    "ocr_complete": 80,
    "indexed": 50,
    "error": 2,
    "total_chunks": 1200
  }
}
```

- `pending`, `metadata_only`, `pdf_downloaded`, `ocr_complete`, `indexed`, `error`：各状态文献数量
- `total_chunks`：项目内分块总数

**示例**

```bash
curl "http://localhost:8000/api/v1/projects/1/ocr/stats"
```

---

## 错误码

| 状态码 | 说明 |
|--------|------|
| 404 | 项目不存在 |
