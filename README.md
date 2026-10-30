# TypeWord · 字里行间

离线运行的本地英语单词学习程序，用「中文释义 → 英文拼写」的方式练习，界面取自旧式打字机与纸张的质感。数据全部保存在本机 SQLite，不需要账号、网络或任何在线 API。

## 功能

- 单词新增、编辑、删除、搜索与分类筛选（操作列固定可见）
- 每个词条可在「练习池 / 听写池」中分别勾选，只有当前池勾选的词条参与对应模式；词库默认只列出当前池已勾选且分组未暂停的词条，工具栏可一键切回全部
- 练习入口先选节奏：无尽模式（按权重持续出题）、复习临期（只练已到复习时间的单词，清完即结束）或听写模式（隐藏中文释义，自动播放读音，只凭听写拼写），练习中也能随时更换模式
- 听写池拥有独立的学习状态：听写答题只更新听写池的权重、正确率与下次复习，不影响练习进度；反过来练习也不会改写听写状态
- 学习模式：翻卡查看单词全部信息（释义、音标、例句、备注、学习数据），方向键 / 空格前后翻页，带 3D 翻页动画与真实翻纸录音；浏览不写入进度，并记住上次翻到的词卡
- 学习模式右侧可开启「翻卡自动朗读」与「只听模式」：翻卡自动读单词；只听模式隐藏释义、例句与学习数据，可随时展开完整词卡，两项设置均持久化
- 学习范围独立于练习勾选：可按词条或整组选择是否出现在翻卡中，单词同时可被练习但不在翻卡、或反之
- 自定义练习分组：整组暂停 / 恢复，分组右侧的 + 可批量加入或移出单词，删除分组时保留词条与学习进度
- 首次启动自动导入 `public/seed_words.json`（当前收录 78 个词条）
- 汉译英答题，大小写不敏感，支持多个可接受答案
- 「我不会」选项：立即揭示答案，按答错记录并安排稍后重练
- 答错后可标记「手滑打错了」：撤销本次判错并按跳过处理，不计入正确率与复习安排
- 随机位置字母提示，提示位置与数量可注入随机函数
- 答对 / 答错 / 使用提示的即时反馈与键盘音效
- 环境音：内置雨声、咖啡馆、壁炉、鸟鸣、夏夜虫鸣与风声六种离线循环音，可从侧边栏或设置页单选播放，支持独立音量与淡入淡出；切换页面不中断，重启后恢复上次选择。音源与许可见 `public/ambient/CREDITS.md`
- 单词朗读：学习模式词卡、独立词卡页、首页贴条、词库操作列、练习反馈例句均可朗读；答对或揭示答案后，等反馈音效播完再自动朗读单词；切换下一题或离开页面会立即打断。优先使用 WebView2 的本地英文语音，没有时自动改用 Windows 系统语音（SAPI），全程离线
- 朗读设置拆分总开关与「答对后自动朗读」，支持朗读语速、朗读音量与语音口音（自动 / 美音 / 英音）；两种语音后端都没有英文语音时朗读入口自动隐藏，设置项置灰并提示安装英文语音包
- 练习快捷键 S / Ctrl+Space 重播当前单词；听写模式另有「重播读音」按钮
- 按答题结果调整权重、稳定度、复习间隔与下次复习时间
- 指数遗忘曲线（艾宾浩斯式保持率 `R = e^(-t/S)`）+ 逾期加成 + 新词加成计算有效抽题权重
- 加权随机抽题，最近 3 题冷却
- 学习状态、设置与复习日志持久化
- 今日书桌、基础统计与错题回顾；首页「单词贴条」从词库随机抽词，每 10 秒翻一张，主标题同步换一句随笔（44 条文案随机轮播），贴条可打开独立的单张词卡页（与学习模式互不混用）
- 错题重练：统计页一键进入，按当时错题快照逐词复习，完成页显示本组报告并支持只重练本次错题
- 统计页新增未来七天到期预测与记忆保持率曲线（指数遗忘曲线可视化）
- 词卡标记：收藏 / 稍后再看 / 已掌握，学习模式内切换，词库页可按标记筛选
- 自动备份：桌面版每日首次启动生成 SQLite 快照，设置页可立即备份、查看并恢复，保留最近 12 份每日快照
- 跨午夜与窗口重新可见时自动刷新今日数据；首页与统计页日期不再过期
- 学习范围整组切换支持撤销与保存中禁用；批量勾选与移组使用事务写入
- JSON 导入 / 导出（含学习进度、标记与听写池状态），导入前可选择新建分组并放入本次新增词条，导入按钮旁的 ? 提供字段说明与示例
- Windows NSIS 安装包（仅 lite）

## 技术栈

| 层     | 技术                                        |
| ----- | ----------------------------------------- |
| 桌面容器  | Tauri 2                                   |
| 前端    | React 18、TypeScript、Vite 6、React Router 6 |
| 状态    | Zustand 5                                 |
| 校验    | Zod 3                                     |
| 本地数据库 | SQLite（`rusqlite` bundled）                |
| 语音    | Web Speech API、Windows SAPI（`windows` crate） |
| 单元测试  | Vitest 3                                  |
| 端到端测试 | Playwright                                |

学习算法全部位于 `src/domain/` 的纯函数中，React 组件只负责展示与交互。时间与随机数均以参数注入，便于测试。

## 快速开始

### 环境

- Node.js 20+
- Rust stable
- Windows 构建还需 WebView2 Runtime（Windows 10/11 通常已内置）与 C/C++ 工具链；安装包为不携带 WebView2 的轻量版，目标机器需已有 WebView2 Runtime（0.1.3 另归档了一个内置 WebView2 的完整版）
- 本仓库验证环境：Node 24.19、Rust 1.99.1（`x86_64-pc-windows-gnu`）、GCC 16.2.0、Tauri CLI 2.12.4

```bash
npm install
```

### 浏览器开发

```bash
npm run dev
```

浏览器模式使用 `localStorage` 模拟数据库，方便调试界面与运行 E2E。它不是正式数据存储；桌面端始终使用 SQLite。

### 桌面开发

```bash
npm run tauri dev
```

## 测试

```bash
npm test          # Vitest：166 个单元测试
npm run test:e2e  # Playwright：32 个完整 UI 流程
cargo test --manifest-path src-tauri/Cargo.toml   # Rust：21 个测试（20 运行 + 1 个需真实语音的忽略项）
npm run typecheck
```

E2E 默认使用端口 `4174` 启动 Vite，并自动清除浏览器存储后重跑。首次运行前需安装 Chromium：`npx playwright install chromium`。

## Windows 打包

```bash
npm run build
npx tauri build --bundles nsis
```

产物位于 `src-tauri/target/release/bundle/nsis/`。**今后的版本只发布轻量版（lite）**：默认配置 `webviewInstallMode` 为 `{"type": "skip"}`，构建产物 `TypeWord_<version>_x64-setup.exe` 即轻量版，不携带 WebView2，要求目标机器已安装 WebView2 Runtime。0.2.7 起内置约 7.6 MB 的离线环境音，安装包约 10 MB；此前的 0.2.6 约 1.9 MB。0.2.7 的产物为 `TypeWord_0.2.7_x64-setup.exe`。

每个版本的发布目录同时提供 `TypeWord_<version>_使用指南.txt`；源文件为 [`docs/使用指南.txt`](docs/使用指南.txt)，功能变化时同步更新并复制为版本化文件名。

从 0.2.6 重新打包版起，使用指南还会随安装包嵌入程序安装目录：`bundle.resources` 把 `src-tauri/resources/使用指南.txt` 安装为 `<安装目录>\使用指南.txt`。`npm run build` 会先执行 `npm run sync:guide`，把 `docs/使用指南.txt` 自动同步到 `src-tauri/resources/使用指南.txt`，因此只需维护文档源文件；版本化 TXT 仍照常与安装包并列交付。

0.1.3 是唯一同时提供内置 WebView2 完整版的版本，作为历史归档保留，安装包未随本仓库提供：

| 文件                                           | 大小       | 说明                                         |
| -------------------------------------------- | -------- | ------------------------------------------ |
| `TypeWord_0.1.3_x64-setup-with-webview2.exe` | 约 210 MB | 内置 WebView2 Evergreen 离线安装器，离线机器可直接安装      |
| `TypeWord_0.1.3_x64-setup-lite.exe`          | 约 1.8 MB | 不携带 WebView2，体积小，要求目标机器已有 WebView2 Runtime |

如需复现 0.1.3 完整版，把 `webviewInstallMode` 临时改为 `{"type": "offlineInstaller", "silent": true}` 再构建。不能通过 `tauri build --config` 覆盖：配置为深合并，`skip` 会保留基配置的 `silent` 字段，导致 schema 校验失败。

本项目使用 GNU 工具链打包。若 Rust 默认使用 MSVC，可安装 `x86_64-pc-windows-gnu` target 并把 MinGW-w64 的 `bin` 放入 `PATH`：

```bash
rustup target add x86_64-pc-windows-gnu
export PATH="/path/to/mingw64/bin:$PATH"
```

首次打包时 Tauri 会从 GitHub 下载 NSIS 工具。网络不可达时可设置镜像（示例）：

```bash
export TAURI_BUNDLER_TOOLS_GITHUB_MIRROR="https://ghfast.top/https://github.com"
```

## 数据与离线运行

- 数据库文件：`%APPDATA%\com.typeword.app\typeword.sqlite3`
- 设置页会显示实际路径，并可一键复制
- 所有词条、学习状态、复习日志与设置均在该文件中；关闭程序不会丢失
- 取消勾选词条或暂停分组只改变出题范围，不删除词条、不清空学习进度；统计中的「待复习」也只计算当前勾选范围
- 学习范围的勾选（`studyEnabled`）与练习勾选、分组暂停互不影响；翻卡只读，不改变权重、复习时间或复习日志
- 「手滑打错了」会删除本次错误日志并按跳过重新记录，单词权重与复习计划回到作答前状态；跳过记录不计入统计
- 卸载或迁移前建议先在设置页导出 JSON 备份
- 不存在任何网络请求（除读取安装包内静态资源）；无登录、云同步、AI 翻译

浏览器开发模式的数据在 `localStorage` 中，与桌面端数据库互不影响。

## 初始词库

初始词库位于 [`public/seed_words.json`](public/seed_words.json)。

- 仅在数据库中尚无 `seed_imported` 标记时自动导入一次，之后升级或重启不会重复导入
- 若文件缺失或格式不合法，程序仍可启动并手动添加单词，错误会显示在启动提示中
- 替换后重新 `npm run build` / `npx tauri build`，全新安装即使用新词表
- 已安装旧版本时，可在设置页使用「恢复初始词库」补入缺失词条，不会重置已有进度

每个词条至少需要 `word`（英文）与 `meanings`（至少一个中文释义）；`category` 默认「核心词汇」，`difficulty` 默认 `2`（1–5），`acceptedAnswers`、`phonetic`、`exampleSentence`、`notes`、`tags` 可选：

```json
[
  {
    "word": "reflection",
    "meanings": ["反射", "倒影", "反映", "深思"],
    "acceptedAnswers": [],
    "category": "名词",
    "tags": ["n."],
    "difficulty": 3,
    "notes": "reflect v. 反射；反映；深思"
  }
]
```

## 目录结构

```text
src/
  domain/        纯函数：答案判定、提示、权重、遗忘曲线、抽题、统计、Zod schema
  services/      仓储抽象（Tauri SQLite / Web localStorage）、种子导入、JSON 导入导出、音效
  stores/        Zustand 设置与 UI 状态
  features/      今日书桌、练习、学习模式、词库、统计、设置
  components/    通用打字机风格组件
  styles/        设计变量、全局样式与动画
src-tauri/
  src/db.rs      SQLite schema、migration、CRUD、答题事务与复习日志
  src/tts.rs     Windows SAPI 语音目录与异步朗读（独立线程持有 COM 对象）
  src/lib.rs     Tauri 命令、数据库初始化、文件导出与语音命令桥接
tests/
  unit/          Vitest 纯函数测试
  e2e/           Playwright UI 流程测试
public/
  seed_words.json
  audio/         按键、提交、正确、错误、翻页音效（翻页为 CC0 录音，来源见 public/audio/CREDITS.md）
  ambient/       雨声、咖啡馆、壁炉、鸟鸣、夏夜虫鸣与风声六种 OGG 循环音
                 （来源与许可见 public/ambient/CREDITS.md）
```

## 核心算法摘要

- 初始权重 `3.0`，稳定度 `1` 天，难度系数 `2.3`
- 无提示答对：`weight × 0.65`，稳定度上升，复习时间延后
- 有提示答对：`weight × 0.82`，稳定度小幅上升
- 答错：`weight × 2.2`，`stabilityDays × 0.35`，10 分钟后重现，连对数清零，难度系数下降，并写入复习日志
- 有效权重：
  ```text
  R = exp(-elapsedDays / stabilityDays)
  forgettingFactor = 1 + (1 - R)
  overdueFactor = 到期后随逾期时间增长
  newWordFactor = 新词 1.4，否则 1
  effectiveWeight = clamp(weight × forgettingFactor × overdueFactor × newWordFactor, 0.1, 20)
  ```
- 抽题使用可注入随机函数，并按最近 3 题做冷却

## 已知限制

- 仅在 Windows 10/11 上完成打包与真机验证；macOS / Linux 未验证
- 浏览器模式仅用于开发与测试，数据存于 `localStorage`
- JSON 导入 / 导出包含词条的练习勾选与学习范围状态，但不包含分组名称与归属；导入时可为本次新增词条新建分组，换机后其余词条仍需重新分组
- 目前没有释义朗读、云同步、账号体系；这些不在本项目范围内
- SQLite 文件未加密，请自行保护本机账户与备份文件
- 音效为本机静态 WAV；文件缺失时自动回退到 Web Audio，不阻塞答题
- 环境音为本机静态 OGG（约 7.6 MB）；不联网，雨声为 CC BY 3.0，其余为 CC0 / Public Domain，署名要求见 `public/ambient/CREDITS.md` 与使用指南

## 许可证

代码以 [MIT](LICENSE) 许可证开源。`public/audio/` 与 `public/ambient/` 下的音效、环境音按各自目录中的 `CREDITS.md` 授权，不适用 MIT；雨声为 CC BY 3.0，再分发时请保留作者署名与编辑说明。
