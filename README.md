# Mod Journal · GameBanana 多游戏采集器

绝区零、原神、鸣潮、崩坏：星穹铁道的本周新作榜采集器，支持浏览器登录会话和独立 HTML 展示页导出。

扩展采用白色面板、滑动游戏选择按钮和四款游戏的独立配色。弹窗与页面内采集面板都可以切换游戏；每款游戏的断点与导出文件分别保存。

## 功能与统计范围

- 默认收录北京时间本周一 00:00 至采集开始时刻发布的新 Mod，按采集时的累计点赞选出前十。列表缺少点赞字段时，补查该作品的总点赞数。
- 老 Mod 的更新不算新作，默认榜单不包含老 Mod；不足十个时输出实际数量。
- 为入选作品补充图片、浏览量、作者和下载链接，支持 HTML、JSON、CSV、TXT 导出。
- 展示页支持搜索、排序、图片轮播、修改标题和导入下一期数据。

点赞数取自各列表页的读取时刻，详情指标可能稍后变化；结果是采集时可见数据的排行，并非官方冻结榜单。

## 选择采集方式

| 方式 | 可见范围 | 结果位置 |
|---|---|---|
| Edge 扩展 | 当前浏览器登录会话可见的内容 | 手动点击导出，保存到 Edge 下载位置 |
| Python | 未登录公开接口返回的内容，可能少于登录后 | 自动保存到 `results/运行时间/` |

### Edge 扩展

1. 打开 `edge://extensions`，启用开发人员模式。
2. 选择“加载解压缩的扩展”，加载本项目的 `edge-extension` 文件夹。
3. 打开并登录 GameBanana，例如 [绝区零](https://gamebanana.com/mods/games/19567)、[原神](https://gamebanana.com/mods/games/8552)、[鸣潮](https://gamebanana.com/mods/games/20357) 或 [星穹铁道](https://gamebanana.com/mods/games/18366) 页面。
4. 点击扩展图标，选择游戏，再点击“打开采集面板”和“采集本周新作”。不必停留在所选游戏的页面，在任意 GameBanana 页面均可采集。
5. 保留标签页，完成后点击 HTML、JSON、CSV 或 TXT 保存结果。

每周重新采集请点击“采集本周新作”；“继续上次”保留上次的模式和时间范围。更新扩展后，在扩展管理页刷新扩展，再刷新 GameBanana 页面。

采集中暂时不能切换游戏，请先停止并等待进度保存。切换后可继续该游戏上次的任务；旧版绝区零断点也可以继续，其他游戏不会读取旧版绝区零断点。HTML、JSON、CSV、TXT 的导出文件名都带游戏标识。

扩展请求使用当前站点登录会话，不读取或导出 Cookie。采集期间保持同一账号和内容筛选设置。“试抓 20 条”是旧口径的小样本，不能作为完整新作榜。

### Python

需要 Python 3.11 或更高版本，无需安装第三方依赖。在项目目录运行：

```powershell
python crawler.py                 # 默认：本周新作榜
python crawler.py --resume        # 继续上次任务
python crawler.py --game genshin  # 原神
python crawler.py --game wuwa     # 鸣潮
python crawler.py --game hsr      # 星穹铁道
python crawler.py --game hsr --resume # 继续星穹铁道的断点
python crawler.py --scope all     # 包含老 Mod 的本周获赞榜，较慢
python crawler.py --max-mods 20   # 最新 20 条试抓
```

Windows 下也可双击 `run.cmd` 或 `resume.cmd`。按 Ctrl+C 可停止并保存进度；需要系统代理时追加 `--system-proxy`。

Python 的绝区零断点继续保存在 `data/checkpoint.json`，其他游戏分别保存在 `data/genshin/`、`data/wuwa/` 和 `data/hsr/`；新输出目录带游戏前缀。

## 展示页

导出的 HTML 可直接打开，图片和下载需要网络；部分内容仍要求登录 GameBanana。

- “目录 → 导入采集结果”：导入新版 JSON，更新本期内容并保留自定义标题。
- “目录 → 编辑这一期”：修改标题、简介、动态效果和已采集分级图片的显示设置。
- “保存当前页面”：保存当前数据与设置。

四款游戏沿用同一展示模板，封面英文游戏名与默认标题、简介和配色跟随游戏变化。跨游戏导入时，默认文案会更新，用户自定义的标题继续保留。无游戏标识的旧版 JSON 按绝区零处理。

网页排序只调整本期已入选内容。重新采集需要运行采集器，已下载的 HTML 不会自动更新。

`preview.cmd` 打开 `results/` 中最新的 HTML；没有结果时会提示先采集。扩展导出的 HTML 可直接从下载位置打开。

默认展示配置在 `web/config.json`；修改展示模板或默认配置后运行 `python showcase.py`，同步扩展模板。

四款游戏的 ID 与展示默认值统一定义在 `games.json`。修改游戏配置后也需运行 `python showcase.py`，重新生成 `edge-extension/games.js` 和 `edge-extension/showcase.js`；请编辑源文件，不直接修改生成文件。

## 代码与测试

| 路径 | 用途 |
|---|---|
| `crawler.py` | Python 采集入口、筛选、统计和导出 |
| `games.json`、`games.py` | 共用游戏配置及 Python 读取入口 |
| `edge-extension/` | 使用浏览器登录会话的采集扩展 |
| `edge-extension/panel.js` | 弹窗和页面采集面板共用的界面 |
| `media.py` | 图片、指标和下载文件信息整理 |
| `web/`、`showcase.py` | 共享展示模板及扩展模板生成 |
| `tests/` | 时间边界、分页、去重和导出验证 |

```powershell
python -m unittest discover -s tests -v
node --test tests/test_edge_core.cjs tests/test_collector.cjs tests/test_popup.cjs
```

Node.js 仅用于 JavaScript 测试。`data/`、`logs/`、`results/` 为本地运行数据，已由 `.gitignore` 排除。

## 许可证与来源

代码采用 [MIT 许可证](LICENSE)。截图准备要求见 [发布说明](docs/PUBLISHING.md)。

Mod、预览图片及第三方资源不属于本项目的代码授权范围，来源见 [资源说明](THIRD_PARTY_NOTICES.md)。
