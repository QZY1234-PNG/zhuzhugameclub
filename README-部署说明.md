# 养猪场电竞网站源代码

## 文件说明

- `worker/index.js`：完整网站源代码，包含前台、后台、API 和图片查看器
- `dist/server/index.js`：构建后的 Worker 部署入口
- `scripts/build.sh`：构建脚本
- `scripts/validate-artifact.mjs`：构建产物校验脚本
- `.openai/hosting.json`：原站点配置，包含 D1 绑定名 `DB`

## Cloudflare Workers 部署

1. 创建一个 Cloudflare D1 数据库。
2. 创建一个 Worker，将 `dist/server/index.js` 作为 Worker 入口部署。
3. 在 Worker 设置中添加 D1 绑定：
   - Variable name：`DB`
   - 选择刚刚创建的 D1 数据库
4. 发布 Worker。
5. 后台地址为：`你的域名/admin.html`
6. 后台默认密码：`admin123`

数据库表会在第一次访问时自动创建，包含单子和首页图片设置。

## 本地重新构建

```bash
bash scripts/build.sh
node scripts/validate-artifact.mjs
```

## 重要提示

后台图片会自动压缩后保存。卡片封面建议使用 4:3 图片，例如 800×600 或 1200×900。
