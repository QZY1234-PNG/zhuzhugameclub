# 养猪场电竞静态网站

前台从 `data/content.json` 读取已发布内容，图片存放在 `assets/uploads/`，不依赖原 ChatGPT 网站、数据库或访客浏览器缓存。保留分类、4:3 封面、详情图片缩放拖动及客服图片。

## 后台编辑和发布

1. 打开网站的 `admin.html`，编辑单子、上传图片并保存草稿。
2. 在 GitHub 创建细粒度个人访问令牌（Fine-grained personal access token）：仅选择 `QZY1234-PNG/zhuzhugameclub`，赋予 **Contents: Read and write**。无需 Workflow 权限。
3. 在后台临时填写 Token，点击“发布到 GitHub”。图片和内容会作为一个提交写入 `main`，触发 Pages 自动部署。
4. 点击“查看部署进度”，成功后刷新前台，其他设备即可看到新内容。

Token 不写入代码、浏览器存储或导出备份，每次点击发布后输入框立即清空。后台是公开的本地草稿编辑器，访问编辑器不代表拥有发布权限，GitHub 校验发布权限。仓库内容已变化时阻止覆盖，请备份草稿、刷新后台并核对后再发布。

草稿仅保存在当前浏览器。导出备份包括单子、首页图片和客服设置；导入仅修改草稿。旧版只含单子数组的备份也可导入。不要清理草稿前忘记发布或导出。

## GitHub Pages

仓库 Settings → Pages → Source 选择 **GitHub Actions**。`.github/workflows/pages.yml` 在 main 更新后部署。第一次启用 Pages 如未配置此设置，需要仓库管理员设置。

默认地址： https://qzy1234-png.github.io/zhuzhugameclub/

原 `chatgpt.site` 链接属于另一套托管，GitHub Pages 发布不会更新该链接。
