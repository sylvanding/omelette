---
title: CI Failures — Crawler Test Unpaywall Config + VitePress Docs Dead Links
date: 2026-03-12
category: build-errors
severity: medium
components:
  - backend/tests/test_crawler.py
  - backend/app/services/crawler_service.py
  - docs/plans/
tags:
  - ci
  - pytest
  - monkeypatch
  - vitepress
  - docs
  - unpaywall
  - relative-links
related_issues: []
status: resolved
---

# CI Failures — Crawler Test Unpaywall Config + VitePress Docs Dead Links

## Symptom

**Failure 1: Backend tests**

```
FAILED tests/test_crawler.py::test_get_channels_direct_first - AssertionError: assert ('unpaywall',) in [('direct',), ('arxiv',)]
FAILED tests/test_crawler.py::test_get_channels_priority_order - AssertionError: assert ['arxiv'] == ['unpaywall', 'arxiv']
```

**Failure 2: VitePress dead link**

```
Found dead link ./docs/brainstorms/2026-03-12-frontend-ux-robustness-brainstorm in file plans/2026-03-12-feat-frontend-ux-robustness-upgrade-plan.md
```

## Root Cause

**Failure 1:** `CrawlerService._get_channels()` in `backend/app/services/crawler_service.py` adds the Unpaywall channel only when `settings.unpaywall_email` is non-empty. In CI, `unpaywall_email` is empty (no `.env` file), so Unpaywall is never added. The two tests assumed Unpaywall would always be present when a DOI exists but didn't mock the setting.

**Failure 2:** VitePress resolves relative links from the current file's directory. The plan file lives at `docs/plans/2026-03-12-...md`. A link like `docs/brainstorms/...` resolves to `docs/plans/docs/brainstorms/...`, which doesn't exist. The correct path is `../brainstorms/...`.

## Solution

**Fix 1: Backend tests** — add `monkeypatch.setattr(settings, "unpaywall_email", "test@example.com")` to both tests:

```diff
 def test_get_channels_direct_first(tmp_path, monkeypatch):
     monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
+    monkeypatch.setattr(settings, "unpaywall_email", "test@example.com")
     service = CrawlerService()
```

```diff
 def test_get_channels_priority_order(tmp_path, monkeypatch):
     monkeypatch.setattr(settings, "pdf_dir", str(tmp_path))
+    monkeypatch.setattr(settings, "unpaywall_email", "test@example.com")
     service = CrawlerService()
```

**Fix 2: VitePress dead link** — change links to file-relative paths:

```diff
-origin: docs/brainstorms/2026-03-12-frontend-ux-robustness-brainstorm.md
+origin: ../brainstorms/2026-03-12-frontend-ux-robustness-brainstorm.md
```

## Verification

```bash
# Backend tests
cd backend && pytest tests/test_crawler.py::test_get_channels_direct_first tests/test_crawler.py::test_get_channels_priority_order -v

# VitePress build
cd docs && npm run docs:build
```

Both pass without errors.

## Prevention Strategies

1. **Always mock environment-dependent settings in tests.** When code branches on a setting (e.g. `if settings.unpaywall_email`), tests must `monkeypatch` that setting explicitly rather than relying on `.env`.
2. **Use file-relative paths in VitePress docs.** From `docs/plans/` to `docs/brainstorms/`, use `../brainstorms/...`, not `docs/brainstorms/...`.
3. **VitePress build in CI catches dead links.** The existing `docs-build` CI job validates this automatically.

## Related

- [test-database-pollution-tempfile-mkdtemp](../test-failures/test-database-pollution-tempfile-mkdtemp.md) — another environment-dependent test issue
