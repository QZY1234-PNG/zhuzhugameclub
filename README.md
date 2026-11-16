# 养猪场电竞静态网页

这是可直接部署到 GitHub Pages 的静态版本，包含：

- `index.html`：网站前台
- `admin.html`：后台管理（默认密码：`admin123`）
- 图片上传、4:3 卡片封面、详情图片查看、滚轮缩放和鼠标拖动
- `.github/workflows/pages.yml`：GitHub Pages 自动发布流程

## 使用方式

打开 `admin.html` 进入后台。GitHub Pages 是纯静态托管，后台数据会保存在当前浏览器的 `localStorage` 中；同一台设备、同一个浏览器刷新前台即可看到更新。若要让多台设备共享后台数据，请继续使用带云端数据库的版本。
