# FastAPI 安全加固最佳实践 (2026)

**研究日期**: 2026-03-16
**项目背景**: Omelette 为 FastAPI 后端，SQLAlchemy async + SQLite，REST + SSE API，面向科研人员本地/内网部署。当前有 API Key 中间件，无 rate limiting。

---

## 1. slowapi 在 FastAPI 中的最新集成方式

### 1.1 版本兼容性 (2026)

| 组件 | 版本 | 说明 |
|------|------|------|
| slowapi | 0.1.9 (2024-02) | 最新稳定版，Python 3.7–3.x |
| limits | >=2.3 | 底层限流引擎 |
| FastAPI | >=0.115.0 | 完全兼容 |

slowapi 适配 Starlette/FastAPI，无已知 2026 年兼容性问题。文档仍标注 "alpha quality"，但 PyPI 显示已在生产环境处理百万级请求。

### 1.2 基础配置

```python
# backend/app/main.py
from fastapi import FastAPI, Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(...)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)
```

### 1.3 全局默认限流 + 路由级覆盖

```python
# 全局默认：所有路由 120/min
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["120/minute"],
    storage_uri="memory://",  # 或 "redis://localhost:6379"
)

# 路由级限流
@app.post("/chat/stream")
@limiter.limit("30/minute")
async def chat_stream(request: Request, ...):
    ...

# 豁免特定路由
@app.get("/health")
@limiter.exempt
async def health():
    return {"status": "ok"}
```

### 1.4 关键约束

- **必须显式传入 `request`**：`async def myendpoint(request: Request)`，否则 limiter 无法工作
- **WebSocket 不支持**：当前版本不处理 WebSocket 限流
- **测试时禁用**：`Limiter(..., enabled=False)` 或 `limiter.enabled = False`

### 1.5 生产环境推荐配置

```python
# backend/app/middleware/rate_limit.py
import os
from slowapi import Limiter
from slowapi.util import get_remote_address

def _get_identifier(request) -> str:
    """优先用 X-Forwarded-For（反向代理后），否则用 remote_address"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return get_remote_address(request)

limiter = Limiter(
    key_func=_get_identifier,
    default_limits=["120/minute"],
    storage_uri=os.getenv("RATE_LIMIT_STORAGE_URI", "memory://"),
    enabled=os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true",
)
```

---

## 2. 限流方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **slowapi** | 与 FastAPI 集成好、装饰器简洁、支持 Redis/Memcached | WebSocket 不支持、需显式传 request | 推荐，Omelette 首选 |
| **fastapi-limiter** | Redis 原生、支持更多高级策略 | 依赖 Redis、社区较小 | 已有 Redis 且需复杂限流 |
| **自定义中间件** | 完全可控、无额外依赖 | 需自行实现滑动窗口、存储 | 极简场景 |
| **nginx limit_req** | 应用层无侵入、性能好 | 按 IP 粗粒度、无法按 API Key | 作为第一道防线 |

### 推荐组合

- **应用层**: slowapi（按 IP/API Key 细粒度）
- **反向代理**: nginx `limit_req_zone` 作为兜底（如 1000 req/s 全局）

```nginx
# nginx 示例
limit_req_zone $binary_remote_addr zone=api:10m rate=100r/s;
location /api/ {
    limit_req zone=api burst=50 nodelay;
    proxy_pass http://127.0.0.1:8000;
}
```

---

## 3. 生产环境错误处理

### 3.1 目标

- 生产环境：不向客户端暴露 traceback、文件路径、内部异常信息
- 开发环境：保留详细错误便于调试
- 所有异常：完整记录到日志

### 3.2 实现方式

```python
# backend/app/main.py
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings

logger = logging.getLogger("omelette")


async def production_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """生产环境：返回通用 500，内部详情仅写日志"""
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "code": 500,
            "message": "Internal server error",
            "data": None,
        },
    )


async def debug_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """开发环境：返回详细错误（便于调试）"""
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "code": 500,
            "message": str(exc),
            "detail": "".join(__import__("traceback").format_exception(type(exc), exc, exc.__traceback__)),
            "data": None,
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    """注册异常处理器"""
    handler = debug_exception_handler if settings.app_debug else production_exception_handler
    app.add_exception_handler(Exception, handler)
    # HTTPException 保持 FastAPI 默认，无需覆盖
```

### 3.3 在 main.py 中挂载

```python
# 在 app = FastAPI(...) 之后
register_exception_handlers(app)
```

### 3.4 注意点

- `RequestValidationError` 的 `detail` 可能包含文件路径，生产环境应过滤
- 避免在 `task["error"]`、SSE 消息中直接 `str(e)`，生产环境用 `"Processing failed"` 等通用文案

---

## 4. 文件上传安全

### 4.1 PDF 魔数校验

PDF 文件头为 `%PDF-`（5 字节），版本号紧跟其后（如 `%PDF-1.4`）。

```python
PDF_MAGIC = b"%PDF-"

def is_valid_pdf_content(content: bytes) -> bool:
    """校验 PDF 魔数"""
    return len(content) >= 5 and content[:5] == PDF_MAGIC
```

### 4.2 MIME type 校验

- 仅依赖 `Content-Type` 不可靠，客户端可伪造
- 建议：魔数为主，MIME 为辅（用于早期快速拒绝）

```python
ALLOWED_PDF_MIME = frozenset({
    "application/pdf",
    "application/x-pdf",  # 部分客户端使用
})

def validate_pdf_upload(
    content: bytes,
    content_type: str | None,
    filename: str | None,
    max_bytes: int = 50 * 1024 * 1024,
) -> None:
    """上传前校验，不通过则 raise HTTPException"""
    if not content:
        raise HTTPException(status_code=422, detail="File is empty")
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {max_bytes // (1024*1024)}MB limit")
    if not is_valid_pdf_content(content):
        raise HTTPException(status_code=422, detail="Invalid PDF: magic bytes mismatch")
    if content_type and content_type.split(";")[0].strip().lower() not in ALLOWED_PDF_MIME:
        raise HTTPException(status_code=422, detail="Content-Type must be application/pdf")
    if filename and not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=422, detail="Filename must end with .pdf")
```

### 4.3 文件名安全（路径遍历防护）

```python
from pathlib import Path

def safe_pdf_filename(filename: str | None) -> str:
    """只保留 basename，去除路径和危险字符"""
    name = Path(filename or "upload.pdf").name
    # 去除 .. 和路径分隔符
    if ".." in name or "/" in name or "\\" in name:
        return "upload.pdf"
    return name
```

### 4.4 在 upload 端点中的完整流程

```python
# 在 for upload_file in files: 循环内
content = await upload_file.read()
validate_pdf_upload(
    content=content,
    content_type=upload_file.content_type,
    filename=upload_file.filename,
    max_bytes=MAX_FILE_SIZE_MB * 1024 * 1024,
)
safe_filename = safe_pdf_filename(upload_file.filename)
saved_name = f"{uuid.uuid4().hex}_{safe_filename}"
# 写入前再次校验路径
saved_path = (project_pdf_dir / saved_name).resolve()
if not str(saved_path).startswith(str(project_pdf_dir.resolve())):
    raise HTTPException(status_code=400, detail="Invalid path")
saved_path.write_bytes(content)
```

---

## 5. FastAPI CORS 生产配置

### 5.1 原则

- 生产环境：**显式列出**允许的 origins，禁止 `["*"]` + `allow_credentials=True`
- 开发环境：可放宽为 `["http://localhost:3000", "http://127.0.0.1:3000"]`

### 5.2 推荐配置

```python
# backend/app/main.py
from app.config import settings

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,  # 从 CORS_ORIGINS 环境变量解析
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=600,
)
```

### 5.3 环境变量示例

```bash
# .env.production
CORS_ORIGINS=https://omelette.example.com,https://www.omelette.example.com

# .env.development
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173
```

### 5.4 动态子域（可选）

若需支持 `https://*.example.com`：

```python
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://.*\.example\.com",
    allow_credentials=True,
    ...
)
```

---

## 6. 依赖审计工具

### 6.1 pip-audit（推荐）

- 使用 PyPI Advisory Database + OSV
- 支持 `requirements.txt`、`pyproject.toml`、当前环境
- 支持 `--fix` 自动升级

```bash
# 安装
pip install pip-audit

# 审计当前环境
pip-audit

# 审计 requirements 文件
pip-audit -r requirements.txt

# 审计 pyproject.toml
pip-audit -r pyproject.toml

# 自动修复
pip-audit --fix

# JSON 输出（CI）
pip-audit -r pyproject.toml --format json
```

### 6.2 safety

- 曾广泛使用，现维护不活跃
- 商业版功能更多，开源版数据源有限
- **建议**：以 pip-audit 为主，safety 可作为补充（若仍在使用）

```bash
pip install safety
safety check -r requirements.txt
```

### 6.3 npm audit（前端）

```bash
cd frontend
npm audit
npm audit fix
```

### 6.4 CI 集成示例

```yaml
# .github/workflows/security.yml
jobs:
  pip-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install pip-audit
      - run: pip-audit -r backend/pyproject.toml --format json
```

---

## 7. FastAPI 应用安全 Checklist（OWASP Top 10 相关）

| OWASP 类别 | 检查项 | 状态/建议 |
|------------|--------|------------|
| **A01:2021 访问控制** | API Key / JWT 认证 | 已有 ApiKeyMiddleware，生产需设置 API_SECRET_KEY |
| | 路径遍历防护 | 校验 `pdf_path`、`saved_filename` 在允许目录内 |
| **A02:2021 加密失败** | 敏感配置不落日志 | 过滤 API key、token、密码 |
| | HTTPS | 生产必须 HTTPS，反向代理终止 TLS |
| **A03:2021 注入** | SQL 注入 | SQLAlchemy 参数化，LIKE 需转义 `%`、`_` |
| | 命令注入 | 避免 `os.system`、`subprocess` 拼接用户输入 |
| **A04:2021 不安全设计** | Rate limiting | 使用 slowapi |
| | 错误信息 | 生产不暴露 traceback |
| **A05:2021 安全配置** | DEBUG 关闭 | `APP_DEBUG=False` |
| | CORS 白名单 | 显式 `allow_origins` |
| **A06:2021 易受攻击组件** | 依赖审计 | `pip-audit`、`npm audit` 纳入 CI |
| **A07:2021 认证失败** | API Key 校验 | 已实现，需确保 exempt 路径合理 |
| **A08:2021 数据完整性** | 文件上传校验 | 魔数 + MIME + 大小 + 文件名 |
| **A09:2021 日志与监控** | 异常日志 | 所有 500 记录完整 traceback |
| **A10:2021 SSRF** | 外部 URL 请求 | 校验 crawler、Unpaywall 等调用的 URL |

### 7.1 快速验证脚本

```bash
# 1. 依赖审计
cd backend && pip-audit -r pyproject.toml

# 2. 检查敏感配置
grep -r "api_key\|secret\|password" app/ --include="*.py" | grep -v "settings\."

# 3. 确认 CORS 非通配符
grep -A5 "CORSMiddleware" app/main.py
```

---

## 附录：Omelette 落地建议

基于当前代码与 `docs/security/SECURITY-AUDIT-2025-03-11.md`：

1. **Rate limiting**：新增 `slowapi`，按 Phase5 计划对 `/chat/stream`、`/writing/review-draft/stream` 等做差异化限流
2. **错误处理**：增加 `Exception` 全局 handler，按 `APP_DEBUG` 切换响应内容
3. **PDF 上传**：在 `upload.py` 增加魔数校验，并完善 `safe_filename` 逻辑
4. **CORS**：确认生产环境 `CORS_ORIGINS` 仅包含可信前端域名
5. **CI**：在 GitHub Actions 中加入 `pip-audit` 步骤
