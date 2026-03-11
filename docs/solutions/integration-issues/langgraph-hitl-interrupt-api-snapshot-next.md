---
title: LangGraph HITL Interrupt API — Use snapshot.next Instead of GraphInterrupt
date: 2026-03-11
category: integration-issues
tags:
  - langgraph
  - hitl
  - interrupt
  - pipelines
components:
  - backend/app/api/v1/pipelines.py
  - backend/app/pipelines/nodes.py
  - backend/tests/test_pipelines.py
severity: high
---

# LangGraph HITL Interrupt API — 使用 snapshot.next 替代 GraphInterrupt

## 问题描述

LangGraph 升级到 1.1.0+ 后，`interrupt()` 函数不再抛出 `GraphInterrupt` 异常。依赖 `try/except GraphInterrupt` 检测 HITL 暂停的代码完全失效：

- 流水线在发现去重冲突时应暂停，但被标记为 "completed"
- Resume 逻辑无法检测到流水线是否在 `hitl_dedup` 节点等待输入
- 测试中 `pytest.raises(GraphInterrupt)` 断言失败

```
FAILED tests/test_pipelines.py::test_dedup_conflict_interrupt
  - Failed: DID NOT RAISE <class 'langgraph.errors.GraphInterrupt'>
```

## 根因

LangGraph 变更了 `interrupt()` 的行为：不再抛出异常，而是将中断状态写入 `StateSnapshot.next`，列出等待输入的节点名称。`ainvoke()` 正常返回到中断点，不会传播异常。

## 解决方案

### API 层

```python
# pipelines.py — 检测中断
result = await pipeline.ainvoke(initial_state, config=config)
snapshot = pipeline.get_state(config)
if snapshot and snapshot.next:
    _running_tasks[thread_id]["status"] = "interrupted"
    _running_tasks[thread_id]["result"] = result
else:
    _running_tasks[thread_id]["status"] = "completed"
    _running_tasks[thread_id]["result"] = result
```

### 状态查询

```python
if snapshot and snapshot.next:
    data["interrupted_at"] = list(snapshot.next)
    data["conflicts"] = state.get("conflicts", [])
```

### 测试

```python
# 不再使用 pytest.raises(GraphInterrupt)
await graph.ainvoke(initial, config=config)
snapshot = graph.get_state(config)
assert "hitl_dedup" in snapshot.next
```

## 预防策略

- 锁定 LangGraph 版本并记录使用的版本
- HITL 场景的测试必须断言 `snapshot.next`
- 升级 LangGraph 时检查 changelog 中 interrupt 相关变更
- 在流水线文档中记录预期的中断行为
