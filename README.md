# 采购智能哨兵 ProcureSentinel

管理层采购决策驾驶舱 Demo（Stage1）。纯前端，无后端。

## 运行
**必须用本地服务器打开，切勿直接双击 `index.html`**（`file://` 下浏览器会拦截 JSON 加载导致白屏）：
```bash
python -m http.server 8000
# 访问 http://localhost:8000/
```

## 测试
```bash
npm test
```

## 数据口径
横向=公开行情快照，纵向=拟真合成。接入 ERP 即实时运行。
