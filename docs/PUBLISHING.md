# GitHub 发布说明

## 仓库信息

- 可选名称：`gamebanana-mod-journal`，也可以继续使用现有仓库名称。
- 简介：绝区零、原神、鸣潮、星穹铁道本周新作榜采集器，支持登录会话和独立 HTML 展示页。
- 可选标签：`gamebanana`、`zenless-zone-zero`、`genshin-impact`、`wuthering-waves`、`honkai-star-rail`、`python`、`edge-extension`、`mod`。

GitHub 仓库的 About 简介需在创建或编辑仓库时填写，修改本地 README 不会自动更新该字段。

## 上传文件

源码、`edge-extension/`、`web/`、`tests/`、`docs/`、README、LICENSE 和来源说明应保留在仓库中。

`results/`、`data/`、`logs/`、`work/`、`__pycache__/` 是本地数据，可留在电脑上，无需上传。使用 Git 提交时由 `.gitignore` 排除；网页拖拽上传时，请手动排除这些目录。

使用整理好的上传副本时，把副本目录内的文件和子目录上传到仓库根目录，不要只上传压缩包或多套一层项目文件夹。

首次创建仓库可以沿用本项目自带的 README 和 MIT LICENSE，不必另选模板。

## 展示截图

建议准备两张 PNG 或 JPG：

1. **展示页**：包含标题、新作榜标识、几张卡片、浏览量和点赞数，建议宽度 1280–1920 像素，保存为 `docs/screenshots/gallery.png`。
2. **采集面板**：包含快速榜入口、完成状态和导出按钮，裁掉账号信息，保存为 `docs/screenshots/collector.png`。

截图采用可公开展示且允许用于项目介绍的内容，保留来源和作者说明；也可使用自行制作、明确标注的演示数据。无需提供 Mod 压缩包或视频。

图片准备好后，在 README 功能介绍后加入：

```markdown
![展示页](docs/screenshots/gallery.png)
![采集面板](docs/screenshots/collector.png)
```

当前尚未添加展示截图，README 也未插入未存在的图片链接。

## 代码许可证

本项目已采用 [MIT 许可证](../LICENSE)，版权声明为 `Copyright (c) 2026 偷瓜ing`。

MIT 允许使用、修改、分发和商业使用，要求保留版权声明与许可证文本，不要求衍生项目公开源码。

第三方 Mod、预览图片、商标和字体使用各自的授权条件，来源记录在 `THIRD_PARTY_NOTICES.md`。

参考：[GitHub 许可证说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)、[MIT 条款](https://choosealicense.com/licenses/mit/)。
