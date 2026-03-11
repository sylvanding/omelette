---
title: Test Database Pollution — Use tempfile.mkdtemp for Isolated Test DB
date: 2026-03-11
category: test-failures
tags:
  - pytest
  - conftest
  - database
  - sqlite
components:
  - backend/conftest.py
  - .github/workflows/ci.yml
severity: medium
---

# 测试数据库污染 — 使用 tempfile.mkdtemp 隔离测试数据库

## 问题描述

测试运行后在项目根目录和 `backend/` 下残留 `.db` 文件：

```
./test_omelette.db
./backend/test.db
./backend/test_omelette.db
```

这些文件不在 git 跟踪中（`.gitignore` 已包含 `*.db`），但会干扰本地开发环境，且可能导致测试之间互相影响。

## 根因

`conftest.py` 中 `DATABASE_URL` 使用相对路径：

```python
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_omelette.db")
```

`sqlite:///./test_omelette.db` 中的 `./` 是相对于 pytest 运行目录的，会在当前目录创建数据库文件。

## 解决方案

```python
# conftest.py
import os
import tempfile

_test_data_dir = tempfile.mkdtemp(prefix="omelette_test_")
_test_db_path = os.path.join(_test_data_dir, "test_omelette.db")

os.environ.setdefault("APP_ENV", "testing")
os.environ.setdefault("LLM_PROVIDER", "mock")
os.environ.setdefault("DATABASE_URL", f"sqlite:///{_test_db_path}")
os.environ.setdefault("DATA_DIR", _test_data_dir)
```

CI 中同样修复：
```yaml
# ci.yml
DATABASE_URL: "sqlite:///${{ runner.temp }}/omelette-test.db"
```

## 预防策略

- 测试数据库路径始终使用 `tempfile.mkdtemp()` 或 `tempfile.TemporaryDirectory`
- 确保 `DATABASE_URL` 在任何 DB 相关导入之前设置
- `.gitignore` 中保持 `*.db` 规则
- CI 中使用 `runner.temp` 或等效的临时目录
