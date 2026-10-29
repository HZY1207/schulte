# 座舱专注力训练

面向飞行员的舒尔特方格专注力训练，纯静态站点，零构建，手机与桌面浏览器均可直接游玩。

## 功能

- 四种模式：基础、交替、双序列、抗干扰
- 5×5 / 6×6 / 7×7 三档难度，连续两局 S/A 自动升档、连续两局 C 自动降档
- 可选压力模式：STALL / TCAS / GPWS / WINDSHEAR 告警，2 秒内确认
- 五套主题，HUD 右侧色点切换，偏好保存在本机
- 单局 5 分钟上限；结算展示用时、平均反应、错误、正确率与评级
- 最近 10 局用时柱状图，CSV 导出（iOS 以文本弹层替代下载）
- PWA：可添加到主屏幕，离线可开局

## 本地预览

不要直接双击 `index.html`（Service Worker 在 `file://` 下不可用）。任选一种静态服务器：

```bash
python -m http.server 8080
```

然后访问 `http://localhost:8080/`。

## 部署到 GitHub Pages

仓库根目录即站点根目录，所有路径均为相对路径。

```bash
git init
git add index.html css js icons manifest.json sw.js .nojekyll README.md
git commit -m "schulte trainer: initial release"
git branch -M main
git remote add origin https://github.com/HZY1207/schulte.git
git push -u origin main
```

然后在 GitHub 仓库 **Settings → Pages** 中选择：

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/ (root)**
- 点击 **Save**

站点地址：`https://hzy1207.github.io/schulte/`

## 更新版本

修改任意静态资源后，同时把 `sw.js` 中的 `CACHE_VERSION` 改成新值（例如 `v1.0.1`），再提交推送。新的 Service Worker 会清理旧缓存并接管页面。

## 数据说明

主题、偏好与训练成绩只写入浏览器 `localStorage`，不会上传到任何服务器。清除浏览器站点数据会一并删除成绩。
