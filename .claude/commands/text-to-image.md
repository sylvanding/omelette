调用 Token Plan 文生图 API，根据描述生成图像。

用户需求：$ARGUMENTS

## 执行步骤

1. 从用户需求中提取 prompt（图像描述）、model（默认 qwen-image-2.0）、size（默认 1024*1024）。

2. 调用 API 生成图像（使用 Bash 工具执行 curl）：

```
curl -s -X POST "https://token-plan.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation" \
  -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<模型>",
    "input": {
      "messages": [{"role":"user","content":[{"text":"<prompt>"}]}]
    },
    "parameters": {"size":"<尺寸>"}
  }'
```

3. 从返回 JSON 的 output.choices[*].message.content[*].image 提取图像 URL。

4. 用 curl -s -o "generated_$(date +%Y%m%d_%H%M%S).png" "<URL>" 下载到当前目录。

5. 向用户展示生成的图片文件路径。

## 可用模型

- qwen-image-2.0（默认）— 通用，擅长中文文本渲染
- qwen-image-2.0-pro — 质量更高
- wan2.7-image — 多风格，默认出 4 张
- wan2.7-image-pro — 支持 4K

## 可用尺寸

1024*1024、720*1280、1280*720。wan2.7-image-pro 额外支持 2048*2048。
