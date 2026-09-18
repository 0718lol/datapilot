# packages/shared

前后端共享类型层（规划中）。

当前 M0 的 TS 类型定义在 `apps/web/src/api/types.ts`（与后端 Pydantic schema 手工对齐）。
M1 起接入 OpenAPI 自动生成：

```bash
# 后端启动后导出 OpenAPI JSON，再生成 TS 类型
openapi-typescript http://localhost:8000/openapi.json -o packages/shared/schema.ts
```
