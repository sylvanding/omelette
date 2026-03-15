# Deployment Guide / 部署指南

## 环境要求

| 组件 | 最低版本 | 推荐 |
|------|----------|------|
| Python | 3.12+ | 3.12 (conda) |
| Node.js | 20+ | 24.x |
| GPU (可选) | CUDA 12+ | 用于 embedding 和 MinerU |
| 操作系统 | Linux x86_64 | Ubuntu 22.04+ |

## 安装步骤

### 1. 后端环境

```bash
# 创建 conda 环境
conda create -n omelette python=3.12 -y
conda activate omelette

# 安装依赖
cd backend
pip install -e ".[dev]"

# 复制配置文件
cp .env.example .env
# 编辑 .env 填入你的配置
```

### 2. 前端环境

```bash
cd frontend
npm install
```

### 3. MinerU PDF 解析引擎（可选）

MinerU 需要独立的 conda 环境，参考 `docs/guides/mineru-setup.md`。

```bash
conda create -n mineru python=3.12 -y
conda activate mineru
pip install mineru
MINERU_MODEL_SOURCE=modelscope mineru-models-download
```

> **注意**：模型下载需要一定时间（约 5-10GB），推荐使用 ModelScope 镜像加速。

## 环境变量配置

### 必须配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `LLM_PROVIDER` | LLM 提供商 | `aliyun`, `volcengine`, `mock` |
| `ALIYUN_API_KEY` 或 `VOLCENGINE_API_KEY` | API 密钥 | `sk-xxx` |
| `APP_SECRET_KEY` | 应用密钥（生产环境必须修改） | 随机字符串 |

### 安全相关

| 变量 | 默认值 | 生产建议 |
|------|--------|----------|
| `APP_DEBUG` | `false` | **必须为 false** |
| `APP_SECRET_KEY` | `change-me-...` | **必须修改** |
| `API_SECRET_KEY` | 空（禁用认证） | 设置非空值启用 API Key 认证 |
| `CORS_ORIGINS` | `localhost:3000` | 限定为实际域名 |

### 可选配置

| 变量 | 说明 |
|------|------|
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar API Key（提高引用图谱请求限制） |
| `UNPAYWALL_EMAIL` | Unpaywall 邮箱（PDF 下载） |
| `HF_ENDPOINT` | HuggingFace 镜像（国内用户设为 `https://hf-mirror.com`） |
| `HTTP_PROXY` / `HTTPS_PROXY` | 网络代理 |

## 启动服务

### 开发模式

```bash
# 后端
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# 前端（另一终端）
cd frontend
npm run dev

# MinerU（如需，另一终端）
conda activate mineru
mineru-api --host 0.0.0.0 --port 8010
```

### 生产模式

```bash
# 后端
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4

# 前端构建
cd frontend
npm run build
# 使用 nginx 或其他静态文件服务器部署 dist/
```

## 安全建议

1. **始终设置 `APP_DEBUG=false`** — 避免在错误响应中暴露内部信息
2. **修改 `APP_SECRET_KEY`** — 使用 `python -c "import secrets; print(secrets.token_urlsafe(32))"` 生成
3. **设置 `API_SECRET_KEY`** — 启用 API Key 认证，所有请求需携带 `X-API-Key` 头
4. **使用 nginx 反向代理** — 提供 HTTPS、额外的 rate limiting 和静态文件服务
5. **配置 CORS** — 生产环境限定 `CORS_ORIGINS` 为实际前端域名
6. **Rate Limiting** — 应用内置 slowapi 限流（120 req/min），nginx 可提供额外限流层

## 常见问题

### 模型下载失败
国内用户设置 `HF_ENDPOINT=https://hf-mirror.com`，或通过代理下载。

### GPU 内存不足
Embedding 模型默认使用 GPU，可通过 `CUDA_VISIBLE_DEVICES` 指定设备。

### MinerU 解析超时
调整 `MINERU_TIMEOUT` 环境变量（默认 300 秒）。
