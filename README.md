# zhenghe-md.github.io

郑鹤的个人网站 — 写作、项目、跑步、演讲、TIL。

线上地址：<https://zhenghe-md.github.io/>

## 这个站点是怎么工作的

- **HTML 是所有内容的第一手稿。** 每个页面都是一个独立、可直接打开的 `.html` 文件，
  从共享的样式表与 web component 中获得导航和页脚，不做任何逐页复制。
- **文件夹即事实来源。** 索引器只读不写内容页，只负责生成聚合页。
- **没有服务端、没有数据库、没有前端框架。**

## 目录

```
index.html            首页
writing/<slug>/       长文（49 篇已从 Hexo 迁移）
til/<slug>/           TIL 短文
projects/ talks/ about/ running/
assets/               css / js / fonts / img / vendor
scripts/build.mjs     内容索引器（唯一的构建步骤）
scripts/filter-activities.jq   跑步数据过滤规则
docs/                 设计文档与迁移类目映射表
```

## 本地构建与预览

```bash
node scripts/build.mjs        # 生成 _site/
cd _site && python3 -m http.server 8901
```

`_site/` 不提交进仓库；GitHub Action 在每次推送 main 时构建并部署。

## 写一篇新文章

在 `writing/<slug>/index.html` 新建页面，头部带上索引器读取的元数据：

```html
<meta name="date" content="2026-07-19">
<meta name="category" content="思考">        <!-- 思考 或 实践，可省略 -->
<meta name="summary" content="一句话摘要。">
<meta name="mathjax" content="true">          <!-- 需要公式时才加 -->
<meta name="legacy" content="/blog/2026/07/19/slug/">  <!-- 旧链接转发桩，可省略 -->
```

正文放进 `<div class="prose">`。图片与本页放在同一目录，用相对路径引用。
TIL 页面同理，另外把正文包在 `<!-- til:body -->` / `<!-- /til:body -->` 之间，
`/til/` 流会直接内联这段内容。

## 跑步数据

`running/data.json` 由 `.github/workflows/sync-running.yml` 每日从
`running_page` 已发布的 `activities.json` 拉取并过滤（跑步、≥3 km、配速 ≤8 min/km、按日去重）。
全程无需任何凭据，不触碰上游的 Keep 登录。

## 旧链接转发

`/blog/...` 的 53 个转发桩由索引器自动生成（49 篇文章 + 首页/关于/分类/标签）。

**目前它们还没有生效**：`ZhengHe-MD/blog` 仓库自己发布了一个 GitHub Pages
project site 占用 `zhenghe-md.github.io/blog/`，而 project site 的路由优先级
高于 user site，因此旧链接仍然落在旧的 Hexo 博客上。

解决方式：到 `ZhengHe-MD/blog` 的 **Settings → Pages → Unpublish site**
取消发布（REST API 的 `DELETE /repos/:owner/:repo/pages` 会返回 422，只能在界面操作）。
取消后本仓库的转发桩立即接管，无需再改动代码。

## 待办（需作者补充）

- `about/index.html` — 工作经历与教育背景（旧 resume 仓库不在本地，已留占位注释）
- `talks/index.html` — 演讲列表（标题/场合/日期/视频/幻灯片）
- `docs/category-mapping.md` — 49 篇文章的 思考/实践 归类，请评审
- Giscus 评论 — 需先在仓库开启 Discussions 并安装 giscus app，再填入 repo/category ID
