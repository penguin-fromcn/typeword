# TypeWord 分阶段实施报告

各阶段均按约定输出：修改文件、实现功能、运行测试、测试结果、已知限制、下一阶段。以下为最终归档版本，测试数字以交付时的全量回归为准。

## 阶段 0 · 目录扫描与工程初始化

**修改文件**

- `package.json`、`package-lock.json`、`tsconfig.json`、`vite.config.ts`、`index.html`
- `src/main.tsx`、`src/App.tsx`、`src/components/Layout.tsx`
- `src/styles/tokens.css`、`src/styles/globals.css`、`src/styles/animations.css`

**实现功能**

- 扫描现有目录，确认仅有需求文档与词表 `.docx`，从零初始化 Tauri 2 + React + TypeScript + Vite 工程
- 固定依赖：Zustand、Zod、Vitest、Playwright、React Router
- 建立纸张/油墨配色、衬线标题、等宽标签的打字机视觉变量与 HashRouter 导航骨架

**运行测试**

- `npm run typecheck`
- `npm run build`

**测试结果**

- 通过。TypeScript 无错误，生产构建成功。

**当前限制**

- 尚无数据库、领域算法与业务页面。

**下一阶段**

- 建立 SQLite schema、migration 与 Tauri 仓储。

## 阶段 1 · SQLite 数据库与仓储抽象

**修改文件**

- `src-tauri/src/db.rs`、`src-tauri/src/lib.rs`、`src-tauri/src/main.rs`
- `src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`、`src-tauri/capabilities/default.json`
- `src/services/repository/types.ts`、`index.ts`、`tauriRepository.ts`、`webRepository.ts`
- `src/domain/types.ts`

**实现功能**

- `words`、`review_logs`、`settings` 三表与索引，启动时执行幂等 migration
- 单词状态完整字段：`weight`、`stabilityDays`、`intervalDays`、`easeFactor`、`repetitions`、`consecutiveCorrect`、`attemptCount`、`correctCount`、`wrongCount`、`hintCount`、`lastReviewedAt`、`nextReviewAt`
- Tauri 命令层覆盖 CRUD、答题提交、日志、设置、导入与导出
- 答题提交使用真实 SQLite 事务，同时更新单词并写入 `review_logs`
- 浏览器开发使用等价 localStorage 仓储，生产环境按运行时自动选择 Tauri 仓储

**运行测试**

- `cargo test --manifest-path src-tauri/Cargo.toml`
- `npm test`

**测试结果**

- 通过。Rust 数据库测试覆盖建表、CRUD、事务回滚、种子幂等导入、日志查询等 7 项。

**当前限制**

- 数据库为单连接加互斥锁，面向单窗口桌面应用；未做多进程并发写入。
- 仅在 Windows 验证构建。

**下一阶段**

- 解析初始词表，完成词库管理页面。

## 阶段 2 · 初始词库、校验与单词 CRUD

**修改文件**

- `src/domain/schemas.ts`、`wordFactory.ts`、`wordNormalizer.ts`、`constants.ts`
- `src/services/seedService.ts`、`bootstrapService.ts`、`importExportService.ts`、`fileService.ts`
- `src/features/words/WordListPage.tsx`、`WordTable.tsx`、`WordEditor.tsx`、`wordStore.ts`
- `public/seed_words.json`
- `tests/unit/wordNormalizer.test.ts`

**实现功能**

- 从需求文档整理出 78 条种子词，写入符合 Zod schema 的 `public/seed_words.json`
- 首次启动导入种子；`seed_imported` 标记保证不会重复导入
- 种子缺失或非法时给出可见提示，且不阻塞启动
- 单词新增、编辑、删除、搜索、分类筛选与重复词检测（按标准化英文）
- 导入逐条校验，坏记录跳过并汇总问题，不中断整批

**运行测试**

- `npm test`
- Playwright 词库 CRUD 流程（后续纳入 E2E）

**测试结果**

- 通过。标准化测试 8 项；CRUD 与搜索流程在浏览器 E2E 中通过。

**当前限制**

- 词表由 `.docx` 一次性整理，运行时不支持直接导入 Word 文件。
- 删除为即时操作，无回收站。

**下一阶段**

- 实现纯函数学习算法与可注入的时间/随机数。

## 阶段 3 · 核心算法（纯函数）

**修改文件**

- `src/domain/answerEvaluator.ts`、`hintGenerator.ts`、`weightCalculator.ts`、`scheduler.ts`、`statistics.ts`
- `src/domain/random.ts`、`src/utils/date.ts`、`src/utils/random.ts`
- `tests/unit/answerEvaluator.test.ts`、`hintGenerator.test.ts`、`weightCalculator.test.ts`、`scheduler.test.ts`、`statistics.test.ts`

**实现功能**

- 汉译英答案归一化与判定：大小写、首尾空格、多可接受答案、短语空格保留规则
- 随机位置字母提示，可注入随机函数；记录提示次数
- 答对：无提示 `weight × 0.65`，有提示 `weight × 0.82`；稳定度、间隔、下次复习时间与难度系数按规则调整
- 答错：`weight × 2.2`、`stabilityDays × 0.35`、10 分钟后复习、连对清零、难度系数下降
- 有效权重：

  ```text
  R = exp(-elapsedDays / stabilityDays)
  forgettingFactor = 1 + (1 - R)
  overdueFactor = 到期后随逾期增长
  newWordFactor = 新词 1.4
  effectiveWeight = clamp(weight × forgettingFactor × overdueFactor × newWordFactor, 0.1, 20)
  ```

- 加权随机抽题、最近 3 题冷却、到期 / 全部 / 分类三种选题模式
- 统计聚合：累计答题、正确率、连对、错题、每日活动

**运行测试**

- `npm test`

**测试结果**

- 通过。答案判定 16、提示 15、权重 27、调度 21、统计 14 等纯函数测试全部通过；算法不依赖 React 或全局随机。

**当前限制**

- 调度采用题述的指数遗忘模型，不是 FSRS；冷却固定为最近 3 题。
- 抽题最终仍受当前词库规模与分类过滤影响。

**下一阶段**

- 将算法接入学习页面与数据库事务。

## 阶段 4 · 学习流程与持久化

**修改文件**

- `src/services/studyService.ts`
- `src/features/study/StudyPage.tsx`、`StudyCard.tsx`、`AnswerInput.tsx`、`HintDisplay.tsx`、`studyStore.ts`
- `src-tauri/src/db.rs`（答题事务完善）

**实现功能**

- 汉译英答题、提交判定、正误反馈、跳过与自动下一题设置
- 提示按钮与快捷键；提示后答对按 `0.82` 计算
- 每道题提交即写入数据库：单词状态 + 复习日志同一事务
- 最近题目冷却、本次会话统计与进度
- 键盘操作：`Enter` 提交/下一题、`Esc` 跳过、`H` 提示、`/` 聚焦输入框
- 修复 React StrictMode 下重复启动会话导致首题编号为「第 2 题」的问题，并修正分类模式选题

**运行测试**

- Playwright：答错 → 重试答对 → 刷新持久化 → 统计与错题表
- Playwright：额外提示 → 有提示答对权重变化
- `cargo test`

**测试结果**

- 通过。桌面端实测权重 `6.60 → 4.29`，词库 `1/2`、正确率 `50%`；重启后数据保持。

**当前限制**

- 会话进度属于当前页面状态；每道题结果已持久化，中途关闭不会丢失已答题。
- 无跨设备同步。

**下一阶段**

- 完成打字机视觉细节与本地音效。

## 阶段 5 · 打字机 UI 与音效

**修改文件**

- `src/components/Button.tsx`、`Modal.tsx`、`Toast.tsx`、`Toggle.tsx`、`Icons.tsx`、`EmptyState.tsx`、`LoadingState.tsx`
- `src/services/audioService.ts`
- `scripts/generate-audio.mjs`、`public/audio/*.wav`
- 各页面样式与 `src/styles/*`

**实现功能**

- 纸张网格背景、打字机字体层级、印章式按钮、打孔纸卡片、侧栏编号导航
- 按键、退格、提交、正确、错误音效；音量与开关可调
- 使用 Web Audio 合成回退；音频缺失或播放失败不会阻塞答题
- 动效尊重 `prefers-reduced-motion`

**运行测试**

- `npm run typecheck`、`npm run build`
- Playwright 全流程（含静音浏览器参数）

**测试结果**

- 通过。浏览器与 Tauri WebView 中均无控制台错误，缺失音频不影响提交。

**当前限制**

- 音效为脚本合成的短 WAV，不是真实机械键盘录音。
- 无语音朗读。

**下一阶段**

- 补齐统计、设置、导入导出、完整测试与 Windows 打包。

## 阶段 6 · 统计、设置、导入导出、测试与打包

**修改文件**

- `src/features/dashboard/DashboardPage.tsx`、`src/features/statistics/StatisticsPage.tsx`、`statisticsStore.ts`
- `src/features/settings/SettingsPage.tsx`、`src/stores/settingsStore.ts`、`src/stores/uiStore.ts`
- `src/services/importExportService.ts`
- `tests/e2e/app.spec.ts`、`playwright.config.ts`
- `src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/build.rs`、`src-tauri/src/lib.rs`、`src-tauri/icons/*`
- `README.md`、`docs/STAGE_REPORTS.md`

**实现功能**

- 今日书桌：到期数量、今日目标、累计数据、快捷入口
- 统计页：累计答题、正确率、连对、错题列表与最近记录
- 设置页：音效开关/音量、自动下一题、每日目标、词库导入导出、恢复初始词库、重置进度、数据库路径
- 修复 Tauri CSP 未允许同源 `fetch` 导致首次种子导入失败的问题
- 修复 GNU 工具链下桌面构建与测试资源清单问题
- 生成应用图标与 NSIS 安装包

**运行测试**

- `npm run typecheck`
- `npm test`：7 个测试文件、118 项
- `npm run test:e2e`：4 项完整流程
- `cargo test`：7 项
- `npx tauri build --bundles nsis`
- 桌面真机：首次启动种子导入、CRUD、答题、权重、重启持久化

**测试结果**

- 全部通过。
- 首次启动导入 78 词，`seed_imported=true`；重启后 79 词（含手工验证词），无重复种子，权重 `4.29`、答题 `1/2` 保持。
- 安装包：`src-tauri/target/release/bundle/nsis/TypeWord_0.1.0_x64-setup.exe`（约 1.8 MB）。

**当前限制**

- 仅在 Windows 10/11 完成真机与打包验证。
- NSIS 安装包已构建，未执行最终用户的交互式安装/卸载流程。
- SQLite 未加密；多窗口并发写入未专门优化。

**下一阶段**

- 交付完成。后续可按需扩展：更多词表、朗读、备份策略与安装包签名，但均不属于本期范围。

## 版本更新 0.1.1 · 答题「我不会」

**修改文件**

- `src/features/study/studyStore.ts`：新增 `giveUp` 状态转移
- `src/features/study/StudyPage.tsx`：答题操作与反馈界面
- `src/components/Icons.tsx`：新增问号图标
- `tests/e2e/app.spec.ts`：新增「我不会」E2E 流程
- `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`：版本升至 0.1.1

**实现功能**

- 答题界面新增「我不会」按钮，点击后立即显示标准答案
- 按答错规则处理：权重 × 2.2、稳定度 × 0.35、10 分钟后复习、连对清零、写入复习日志
- 反馈区使用 `NOT YET` 标记，并显示「（我不会）」；仍可点「再试一次」进行记忆强化
- 原有「跳过」保留：只记录跳过日志，不改变学习状态与统计

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`

**测试结果**

- 通过。118 项单元测试、5 项 E2E 全部通过；「我不会」流程验证权重 3.00 → 6.60、答题 0/1、10 分钟后重练。

**当前限制**

- 「我不会」与普通答错在统计中都计入错题，未单独分类。

**下一阶段**

- 保持当前版本，按需收集使用反馈。

## 版本更新 0.1.2 · 词条编辑入口与释义修正

**修改文件**

- `src/features/words/WordTable.tsx`：操作列改为固定的「编辑 / 删除」文字按钮
- `src/features/words/WordListPage.tsx`：补充编辑入口提示
- `src/styles/globals.css`：操作列吸附右侧并增加分隔阴影
- `public/seed_words.json`：修正 `be taken back` 释义
- `tests/e2e/app.spec.ts`：新增编辑入口可见性与释义修正测试
- `README.md`、`docs/STAGE_REPORTS.md`、版本号文件

**实现功能**

- 词条编辑此前已存在，但宽表格把「操作」列挤出可视区；现在操作列固定在表格右侧，编辑/删除始终可见
- 操作按钮由纯图标改为带文字的按钮，降低发现成本
- `be taken back` 释义修正为「大吃一惊；惊呆；被吓了一跳」，备注提示勿按字面理解
- 已同步修正现有本地数据库中的该词条，学习进度保持不变

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`

**测试结果**

- 通过。118 项单元测试、6 项 E2E 全部通过；新测试确认编辑按钮在视口内，且可修改 `be taken back` 的释义并持久化。

**当前限制**

- 操作列占用的宽度固定，极窄窗口下表格仍需横向滚动，但编辑按钮始终可见。

**下一阶段**

- 保持当前版本，按使用反馈继续调整。

## 版本更新 0.1.3 · 出题范围、分组与安装包修复

**修改文件**

- `src-tauri/tauri.conf.json`：WebView2 改为 `offlineInstaller` + `silent`；版本升至 0.1.3
- `src-tauri/migrations/002_word_groups.sql`（新增）：`word_groups` 表
- `src-tauri/src/db.rs`：`enabled` / `group_id` 增量迁移、分组 CRUD、导入保留勾选与分组、迁移与分组测试
- `src-tauri/src/lib.rs`：分组命令注册与错误文案
- `src/domain/types.ts`、`wordFactory.ts`、`schemas.ts`：词条勾选与分组字段
- `src/domain/scheduler.ts`：`isWordSelectable` / `filterSelectableWords`
- `src/domain/statistics.ts`、`src/features/statistics/statisticsStore.ts`：待复习与今日数据只统计当前勾选范围
- `src/features/study/studyStore.ts`：抽题前过滤未勾选词条与暂停分组
- `src/features/words/*`：`GroupBar`（新增）、勾选框、分组标签、编辑分组选择、批量勾选
- `src/features/study/StudyPage.tsx`、`src/styles/globals.css`：释义放大、词形变化标注
- `src/services/repository/*`、`src/services/importExportService.ts`、`src/components/Icons.tsx`
- `tests/unit/*`、`tests/e2e/app.spec.ts`、`playwright.config.ts`
- `README.md`、版本号文件

**实现功能**

- 安装包内置 WebView2 Evergreen 离线安装器并静默执行，安装过程不再联网下载，规避 `-2147024769` 下载器安装失败
- 0.1.3 同时提供两个安装包：`TypeWord_0.1.3_x64-setup-with-webview2.exe`（约 210 MB，内置离线安装器）与 `TypeWord_0.1.3_x64-setup-lite.exe`（约 1.8 MB，需目标机器已有 WebView2 Runtime）
- 练习页面其他释义字号提升至 17–21px；答完后的词形变化使用带强调边框、底色与标签的独立卡片展示
- 词库支持逐条勾选 / 取消勾选；表头复选框可批量勾选当前筛选结果
- 支持新建、重命名、删除分组，并可整组暂停 / 恢复；单词可归入分组，词库列表显示分组标签
- 出题与「待复习」仅计算勾选词条以及启用分组内的词条；暂停分组优先于单词勾选
- 删除分组只解除归属，词条、复习日志与学习进度全部保留
- 旧数据库自动增量迁移：新增 `enabled` 默认 1、`group_id` 默认空，不改动任何既有词条与日志

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- 生产库副本迁移演练（SQLite backup 后执行迁移）

**测试结果**

- 通过。123 项单元测试、7 项 E2E、9 项 Rust 数据库测试全部通过
- 生产库副本（78 个词条、407 条复习日志）迁移后数量不变，`enabled` 全部为 1、`group_id` 为空，`integrity_check` 为 ok，无外键违规
- E2E 覆盖勾选单词、暂停分组、恢复分组与出题范围联动

**当前限制**

- 离线 WebView2 安装器使完整版安装包增大约 210 MB；轻量版不含 WebView2，在未安装 Runtime 的机器上无法启动
- JSON 导入 / 导出包含勾选状态，但不含分组名称与归属
- 暂停分组优先于单词勾选：组内单词即使单独勾选也不会出题

**下一阶段**

- 后续版本只发布 lite 版安装包；仓库默认 `webviewInstallMode` 为 `{"type": "skip"}`，内置 WebView2 的完整版仅保留 0.1.3 归档，不再更新
- 保持当前版本，按使用反馈继续调整。

## 版本更新 0.1.4 · 分组加词、手滑撤销与导入帮助

**修改文件**

- `src/features/words/GroupWordsModal.tsx`（新增）、`GroupBar.tsx`、`WordListPage.tsx`、`wordStore.ts`：分组单词批量管理
- `src/features/study/studyStore.ts`、`StudyPage.tsx`：作答前快照、`skipped` 阶段与「手滑打错了」
- `src/services/repository/types.ts`、`webRepository.ts`、`tauriRepository.ts`：`undoReview` 撤销接口
- `src-tauri/src/db.rs`、`src-tauri/src/lib.rs`：`undo_review` 事务、命令注册与测试
- `src/features/words/ImportGuideModal.tsx`（新增）、`WordListPage.tsx`：导入格式说明
- `src/styles/globals.css`：分组管理弹窗、跳过反馈、导入说明样式
- `tests/e2e/app.spec.ts`、`README.md`、版本号文件

**实现功能**

- 每个分组右侧新增「+」按钮，打开管理弹窗；支持搜索、全选当前、清空当前，批量把单词加入本组或移出本组
- 批量归属只修改 `groupId` 与 `updatedAt`，词条权重、复习日志、正确率等学习进度保持不变；勾选其他分组的单词会移入当前分组
- 打字答错后可选择「手滑打错了」：在同一事务内删除本次错误日志、恢复作答前的单词状态，并写入一条跳过日志
- 手滑后会话计数回滚（已作答、错题、连击恢复原值），反馈显示 SKIPPED，本题不计入正确率与复习安排；「我不会」不提供该选项
- 「导入 JSON」旁新增问号按钮，弹窗说明两种根结构、必填 / 可选字段、完整示例，以及进度字段、重复词条与分组不参与导入的规则

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- 生产数据库只读检查（未修改）

**测试结果**

- 通过。123 项单元测试、10 项 E2E、10 项 Rust 数据库测试全部通过
- E2E 覆盖分组批量加入 / 移出、手滑撤销后日志与词条状态、导入格式说明弹窗
- 生产库只读检查：78 个词条、1 个分组（topic1）、0 个分组归属、563 条复习日志；E2E 全部使用 localStorage，未写入生产库

**当前限制**

- 手滑撤销只针对刚提交的这一次打字作答；点「再试一次」后再次提交，会以最后一次作答为准
- 撤销依赖本机写入；若答错后立即退出应用，原错误记录会保留
- JSON 导入 / 导出仍不包含分组；一个单词只能属于一个分组

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包。

## 版本更新 0.1.5 · 贴条轮播与导入分组

**修改文件**

- `src/features/dashboard/WordSlip.tsx`（新增）、`DashboardPage.tsx`：首页贴条随机轮播与整卡翻页动画
- `src/components/ImportOptionsModal.tsx`（新增）、`Toggle.tsx`：导入前分组询问弹窗
- `src/features/words/wordStore.ts`、`WordListPage.tsx`、`src/features/settings/SettingsPage.tsx`：导入分组写入、结果展示与两处入口接入
- `src/services/importExportService.ts`：拆分读取与写入步骤，便于建组后再导入
- `src/features/words/ImportGuideModal.tsx`、`src/styles/globals.css`：说明文案与弹窗 / 翻页样式
- `tests/e2e/app.spec.ts`、`README.md`、`docs/使用指南.txt`（新增）、版本号文件

**实现功能**

- 首页「单词贴条」不再固定显示 vanity，而是从当前词库随机抽词，每 10 秒切换一次，且不会连续重复同一词条
- 切换时整张纸条以顶边为轴翻下再翻开；长单词与短语自动缩小字格并允许换行，系统开启「减少动态效果」时回退为瞬时切换
- 导入 JSON 选中文件后先弹出「导入设置」：可勾选「创建新分组并放入」，分组名默认取文件名，导入前确认后才写库
- 本次新增词条会归入新分组；已有同名词条保留原分组与学习进度，不会被这次导入搬动
- 导入结果与提示会显示新建的分组；若没有新增词条，则不留下空分组
- 设置页的批量导入入口使用同一套分组询问流程；导入格式说明同步更新
- 新增 TXT 使用指南（`docs/使用指南.txt`），打包时复制为 `TypeWord_0.1.5_使用指南.txt` 放在安装包同目录

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- 生产数据库只读检查（未修改）

**测试结果**

- 通过。123 项单元测试、11 项 E2E、10 项 Rust 数据库测试全部通过
- E2E 新增首页贴条轮播用例，并扩展 JSON 导入用例覆盖建组、结果提示与表格分组显示
- 页面实测：贴条随机切换、整卡翻页、长短语排版与导入设置弹窗显示正常
- 最终只读复核：235 个词条、2 个分组（topic1、topic2）、112 个分组归属、566 条复习日志；均为用户正常使用产生的真实数据，E2E 与页面检查使用 localStorage，未写入生产库

**当前限制**

- 翻页动画固定在 10 秒间隔；标签页隐藏或窗口失焦时计时仍会继续
- 分组只对本次新增词条生效；已存在的同名词条不会被移动到新分组
- JSON 导出仍不包含分组名称与归属

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.1.6 · 学习模式翻卡

**修改文件**

- `src/domain/cardDeck.ts`（新增）、`src/domain/types.ts`、`wordFactory.ts`、`schemas.ts`：学习范围筛选、翻卡步进与 `studyEnabled` 字段
- `src/features/learn/LearnPage.tsx`、`StudyScopeModal.tsx`、`StudyScopeChip.tsx`（新增）：翻卡页面、范围选择弹窗与分组快捷勾选
- `src/App.tsx`、`src/components/Layout.tsx`、`Icons.tsx`、`src/features/dashboard/DashboardPage.tsx`：`/learn` 路由、侧边栏「学习」入口与首页「翻卡学习」按钮
- `src/services/audioService.ts`、`public/audio/page-turn.wav`、`page-turn-back.wav`：前进 / 后退翻页音效与 Web Audio 回退
- `src/features/words/wordStore.ts`、`src/features/words/ImportGuideModal.tsx`：批量设置学习范围、导入格式说明补充 `studyEnabled`
- `src/services/importExportService.ts`、`src/services/repository/webRepository.ts`、`tauriRepository.ts`：学习范围导入导出与两端仓储
- `src-tauri/src/db.rs`：`study_enabled` 列与索引、迁移、读写及导入保留逻辑
- `src/styles/globals.css`：翻卡页面、3D 翻页动画、范围选择与响应式样式
- `tests/unit/cardDeck.test.ts`（新增）、`tests/unit/importExport.test.ts`、`tests/e2e/app.spec.ts`、`README.md`、`docs/使用指南.txt`、版本号文件

**实现功能**

- 新增「学习模式」：以整张卡片展示词条全部信息，包括释义、音标、备用拼写、例句、备注、标签、分类、难度、所属分组，以及权重、间隔、复习时间、正确率、连对、稳定度、易度、答题 / 提示次数等学习数据
- 键盘操作：`→` / `↓` / `PageDown` / 空格翻到下一张，`←` / `↑` / `PageUp` 翻到上一张；首尾循环；输入框聚焦时不拦截按键
- 翻卡带 3D 翻页动画与翻页声（前进 / 后退两个音效），受全局音效开关控制，系统「减少动态效果」时回退为无动画切换
- 学习范围独立于练习勾选与分组暂停：每个词条新增 `studyEnabled`，可选择单个词条、整个分组、「未分组」或全部；分组快捷勾选会一次设置组内全部词条
- 翻卡只读：浏览不会写入复习日志，也不会改变权重、复习时间或正确率
- 旧数据库自动迁移，`study_enabled` 默认 1，升级后全部词条默认出现在翻卡中，已有学习进度不受影响
- JSON 导入 / 导出包含学习范围；导入合并已有词条时保留其原有学习范围与练习勾选
- 首页快捷入口与侧边栏「学习」导航接入；学习范围按钮显示「已选 / 总数」并区分全选、部分选中、未选

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- 生产数据库只读检查（未修改）

**测试结果**

- 通过。129 项单元测试、12 项 E2E、11 项 Rust 数据库测试全部通过
- E2E 新增学习模式用例：独立选择词条与分组、键盘前后翻页与循环、翻卡不写入日志、练习勾选与分组暂停不受影响
- 页面实测：1440 宽桌面、范围选择弹窗、960 最小窗口与 390 宽窄屏布局正常，翻页动画与移动端按钮排列可用
- 生产库只读抽查：235 个词条、2 个分组、112 个分组归属、575 条复习日志；均为真实使用数据，E2E 与页面检查使用 localStorage，未写入生产库。旧库尚未含 `study_enabled` 列，首次启动 0.1.6 时迁移并默认全部纳入学习范围

**当前限制**

- 学习模式按当前词库顺序翻卡，暂不支持自定义排序或仅看未掌握词条
- 翻卡不记录浏览轨迹，也没有「已读 / 未读」标记
- 学习范围只保存在本机；JSON 可带走该状态，但分组归属仍不随导入导出迁移

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.1.7 · 翻页音效换成真实录音

**修改文件**

- `src/services/audioService.ts`：翻页声改用真实录音资源，重写 Web Audio 回退的纸声合成
- `public/audio/page-turn.wav`、`page-turn-back.wav`：替换为真实翻纸录音处理后的前进 / 后退音效
- `public/audio/CREDITS.md`（新增）：音效来源、许可与处理说明
- `README.md`、`docs/使用指南.txt`、版本号文件

**实现功能**

- 0.1.6 的翻页声由程序合成，起始能量集中、噪声感明显；本版换成真实翻纸录音
- 原始素材为 Freesound 的 Paper Page Flip（作者 OnlyOz，CC0 1.0），截取、去低频、归一化并加淡入淡出
- 前进音效 0.60 秒；后退音效由同一素材降速、降低音量处理，长 0.64 秒，两者听感有区别
- Web Audio 回退改为低频受限的纸声包络，避免资源缺失时又回到刺耳噪声
- 翻页声仍受设置页「打字机音效」总开关与音量控制；不改动翻卡逻辑与学习数据

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- 浏览器实测两个翻页音频请求均返回 206，无加载错误
- 生产数据库只读检查（未修改）

**测试结果**

- 通过。129 项单元测试、12 项 E2E、11 项 Rust 数据库测试全部通过
- 浏览器验证 `page-turn.wav` 与 `page-turn-back.wav` 均能加载并播放，控制台无音效缺失告警
- 生产库只读抽查：235 个词条、2 个分组、112 个分组归属、575 条复习日志；0.1.6 首次运行已添加 `study_enabled` 列，计数不变

**当前限制**

- 翻页声目前只有一组录音的两种速度，尚无独立音量滑杆；需要更轻时可调低全局音效音量
- 音效取自预览文件，未使用原始高码率 WAV；对短促 UI 音效已足够

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.1.8 · 首页文案与贴条同步轮播

**算法确认**

- 现有调度算法已经使用艾宾浩斯式指数遗忘曲线：`src/domain/weightCalculator.ts` 的 `calculateRetention()` 返回 `exp(-elapsedDays / stabilityDays)`，保持率再参与 `forgettingFactor = 1 + (1 - R)`，与逾期加成、新词加成共同决定有效抽题权重
- 因此本版未改动抽题与权重算法，首页与 README 中的“遗忘曲线”描述与实际实现一致

**修改文件**

- `src/features/dashboard/dashboardQuotes.ts`（新增）：44 条两行文案池与不重复随机选择器
- `src/features/dashboard/WordSlip.tsx`：每 10 秒轮播时触发 `onRotate` 回调
- `src/features/dashboard/DashboardPage.tsx`：主标题接入文案轮播，与单词贴条共用同一次计时回调
- `src/styles/globals.css`：标题两行淡入上浮动画与「减少动态效果」回退
- `tests/unit/dashboardQuotes.test.ts`（新增）、`tests/e2e/app.spec.ts`
- `README.md`、`docs/使用指南.txt`、版本号文件

**实现功能**

- 首页主标题「把遗忘，交给曲线。」改为轮播文案，文案池共 44 条，主题围绕记忆、词语、时间与复习
- 主标题与右侧单词贴条共用同一个 10 秒计时回调，两者在同一次渲染中切换；首屏保留原始标题
- 每次从文案池随机抽取下一条，不会连续重复；跳过贴条切换的场景，文案也保持不动
- 标题两行依次淡入上浮，字体与行高固定，切换前后页面高度不变；系统开启「减少动态效果」时改为直接显示
- 贴条与文案仍每 10 秒轮播，原有翻页动画、词库随机抽词逻辑与学习数据均未改变

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- 页面实测：1440×960 桌面、390 宽窄屏与轮播前后排版
- 生产数据库只读检查（未修改）

**测试结果**

- 通过。134 项单元测试、12 项 E2E、11 项 Rust 数据库测试全部通过
- E2E 首页用例扩展为单词贴条与主标题同步轮播，验证 2 秒内均未变化、10 秒后两者同时更新
- 页面实测：桌面两行标题轮播前后高度均为 129.9px；390 宽窄屏无横向溢出，标题轮播正常
- 生产库只读抽查：235 个词条、2 个分组（topic1、topic2）、162 个词条归入 topic2、0 个未分组、575 条复习日志；均为真实使用数据，E2E 与页面检查使用 localStorage，未写入生产库
- 同一只读复核发现：生产库当前学习范围为 0 / 235（更新前备份中为 235 / 235），学习进度与复习日志未受影响；本版未改动该状态，如非有意清空，可在学习页「选择学习范围」中点击「全部选中」后保存

**当前限制**

- 文案池固定为本地 44 条，暂不支持用户自定义
- 标题轮播跟随单词贴条的 10 秒节奏；词库只有 1 个词条时贴条不切换，标题也保持当前文案
- 计时在窗口失焦或标签页隐藏时仍会继续

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.1.9 · 首页文案随机起始

**修改文件**

- `src/features/dashboard/dashboardQuotes.ts`：新增 `randomQuoteIndex()`，首次进入与轮播都从文案池随机抽取
- `src/features/dashboard/DashboardPage.tsx`：文案初值改为随机索引，不再固定第一条
- `tests/unit/dashboardQuotes.test.ts`、`tests/e2e/app.spec.ts`：覆盖随机起始并移除固定首句断言
- `README.md`、`docs/使用指南.txt`、版本号文件

**实现功能**

- 首页文案改为完全随机播放：首次打开页面也从 44 条随笔中随机抽取，不再固定从「把遗忘，交给曲线。」开始
- 之后每次切换仍在当前文案之外的 43 条中随机抽取，不会连续出现同一条
- 主标题与单词贴条继续共用同一个 10 秒计时回调，同一次渲染切换；翻页动画、减少动态效果回退与学习数据均未改变

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- 生产数据库只读检查（未修改）

**测试结果**

- 通过。135 项单元测试、12 项 E2E、11 项 Rust 数据库测试全部通过
- 单元测试覆盖首次随机索引的边界；E2E 继续验证 2 秒内标题与贴条均不变、10 秒后两者同步更新
- 生产库只读复核：236 个词条、2 个分组、162 个词条归入 topic2、1 个未分组（检查期间用户新增）、577 条复习日志；学习进度随正常使用增长，本版未写入生产库

**当前限制**

- 文案池固定为本地 44 条，暂不支持用户自定义
- 随机只保证不连续重复，短期内仍可能出现相隔一条的重复
- 词库只有 1 个词条时贴条不切换，标题也保持当前文案

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.2.0 · 错题重练、复习预测、词卡标记与自动备份

**修改文件**

- Rust 数据层：`src-tauri/src/db.rs` 新增 `mark` 字段迁移、`set_word_mark`、备份快照/列表/恢复与恢复前安全快照；`src-tauri/src/lib.rs` 注册 `set_word_mark`、`create_backup`、`list_backups`、`get_backup_dir`、`restore_backup`
- 前端数据层：`src/domain/types.ts`、`src/services/repository/*`、`src/features/words/wordStore.ts` 支持词卡标记、备份接口与 `wordIds` 会话快照
- 练习与统计：`src/features/study/studyStore.ts`、`StudyPage.tsx`、`src/features/statistics/StatisticsPage.tsx`、`src/domain/statistics.ts` 支持错题模式、完成报告、七天到期预测与保持率曲线
- 学习与词库：`src/features/learn/LearnPage.tsx` 支持预览指定词条与标记切换；`WordListPage.tsx`、`WordTable.tsx` 支持标记筛选与徽标
- 首页与设置：`DashboardPage.tsx`、`WordSlip.tsx` 支持打开贴条词卡；`SettingsPage.tsx` 增加备份列表、立即备份与恢复确认
- 体验修复：`App.tsx`、`useDailyRefresh.ts`、`Modal.tsx`、`StudyPage.tsx` 等覆盖跨午夜刷新、焦点捕获与实时状态播报
- 测试与文档：`tests/unit/*`、`tests/e2e/app.spec.ts`、`README.md`、`docs/使用指南.txt`、版本号文件

**实现功能**

- 错题重练：统计页快捷入口按当前错题生成有限会话快照，逐词复习；完成页展示计划/作答/对错数据与本次错词，可只重练本次错题或全部错题
- 复习预测：统计页绘制未来七天到期柱状图与记忆保持率 SVG 曲线，按当前可练习词条计算
- 词卡标记：收藏 / 稍后再看 / 已掌握，数据库迁移、导入导出、学习模式切换、词库筛选与徽标全链路支持，且不影响学习进度
- 自动备份：桌面版每日首次启动 VACUUM INTO 快照，保留最近 12 份每日备份；设置页可立即备份、列表查看与恢复，恢复前生成 pre-restore 安全快照，恢复使用附加库单事务写入并做完整性检查
- 首页贴条可直接打开对应词卡；学习范围整组切换支持 5 秒撤销与保存中禁用；跨午夜/窗口重新可见自动刷新；单词语料贴条持续轮播；设置版本号来自构建版本

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`

**测试结果**

- 通过。140 项单元测试、14 项 E2E、14 项 Rust 数据库测试全部通过
- 新增 E2E：学习模式标记词卡并在词库筛选；设置页备份后删除词条，再恢复备份还原
- 备份恢复 Rust 测试覆盖标记、分组、复习日志与设置往返，以及备份目录外路径拒绝
- 生产库只读复核：236 个词条、2 个分组、577 条复习日志，`quick_check` 为 ok；当前尚未包含 `mark` 列，首次启动 0.2.0 时会自动迁移，本次检查未修改生产库

**当前限制**

- 每日自动备份只在桌面版首次启动时生成；浏览器开发模式仅提供手动备份
- 每日快照固定保留最近 12 份，手动备份不会自动清理，需自行删除
- 错题重练按进入时的错题快照出题，本次新答错的词会在完成页单独列出，需要再练一轮
- 未来七天预测基于当前下次复习时间，练习过程中会随进度变化

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.2.1 · 学习模式记忆阅读位置

**修改文件**

- `src/features/learn/LearnPage.tsx`：阅读位置写入设置键 `learn_last_word_id`，进入页面时读取并恢复；恢复完成前显示加载态，避免先闪出第一张卡
- `tests/e2e/app.spec.ts`：新增“学习模式记住当前词卡，切换模式与重新打开后继续”用例
- `README.md`、`docs/使用指南.txt`、版本号文件

**实现功能**

- 学习模式翻到任意词卡后切换页面、从练习返回，或关闭软件重新进入，都会回到上次翻到的那张词卡
- 保存的位置若已不在学习范围或已被删除，则回退到当前范围的第一张卡
- 位置仅保存在本地设置中，不写入复习日志，不影响权重与复习计划

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`

**测试结果**

- 通过。140 项单元测试、15 项 E2E、14 项 Rust 数据库测试全部通过
- 新增 E2E 覆盖：翻到第二张卡，切换到练习再返回仍为同一张；整页刷新后仍为同一张

**当前限制**

- 阅读位置为全局记录，不按分类或分组分别记忆

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.2.2 · 独立词卡页、词库只看勾选与练习模式选择

**修改文件**

- `src/features/learn/WordReaderCard.tsx`（新增）：从学习模式抽出只读词卡组件，标记切换内置
- `src/features/learn/WordCardPage.tsx`（新增）、`src/App.tsx`、`src/features/dashboard/DashboardPage.tsx`、`WordSlip.tsx`：新增 `/card/:wordId` 路由，贴条跳转到独立词卡页
- `src/features/learn/LearnPage.tsx`：移除 `?word=` 预览分支，复用 `WordReaderCard`，阅读位置逻辑保持不变
- `src/features/words/WordListPage.tsx`：默认只显示已勾选词条，新增「只看勾选」切换、空状态与计数
- `src/features/study/StudyPage.tsx`：进入练习先选「无尽模式 / 复习临期」，支持练习中更换模式；到期复习完成页区分「已清空」与「本来无到期」
- `src/styles/globals.css`：独立词卡页、模式选择页、词库筛选按钮与页头样式
- `tests/e2e/app.spec.ts`：更新学习模式标记、勾选/分组与阅读位置用例，新增 3 个 E2E
- `README.md`、`docs/使用指南.txt`、版本号文件

**实现功能**

- 首页贴条改为打开独立词卡页；页面只展示这一张卡，可正常标记，不加入翻卡队列，也不改变学习模式上次翻到的位置
- 词库默认只列出勾选词条，显示勾选数量并可一键切换全部；取消勾选后立即从默认视图移出，空结果提供切换与清除筛选入口
- 练习入口先选模式：无尽模式沿用原加权随机练习；复习临期复用到期模式，只出 `nextReviewAt` 已到的词，清完即结束；练习页右上角可随时更换模式并保留当前题目
- 首页「复习到期」与统计页「只练这些错题」仍直接进入对应模式，不经过选择页
- 到期复习完成页显示本次实际复习题数与正确率，不再误报为「没有到期单词」

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`

**测试结果**

- 通过。140 项单元测试、18 项 E2E、14 项 Rust 数据库测试全部通过
- 新增 E2E：贴条进入独立词卡页且无学习范围面板；词库默认只看勾选并可切换全部；练习入口选择无尽模式、更换模式后再进入复习临期
- 生产库只读复核，未写入真实学习数据

**当前限制**

- 「只看勾选」只在当前页面会话内有效，离开词库后恢复默认勾选视图
- 练习入口不记忆上次模式，每次从侧边栏进入都先显示选择页
- 单张词卡页只展示当前词，不提供上一张 / 下一张；连续翻卡请进入学习模式

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.2.3 · 单词朗读

**修改文件**

- `src/services/speechService.ts`（新增）：封装系统 `speechSynthesis`，优先本机 en-US / en-GB 语音，含超时保护与 `stop()`
- `src/services/audioService.ts`：`playSource` 改为 Promise，记录反馈音效完成时刻，新增 `waitForFeedback()`
- `src/components/SpeakButton.tsx`（新增）：受设置控制的朗读按钮，支持 chip / row 两种样式
- `src/features/learn/WordReaderCard.tsx`：单词旁朗读按钮，卸载时停止发音
- `src/features/words/WordTable.tsx`：每行操作列加入朗读按钮
- `src/features/study/StudyPage.tsx`：答对 / 揭示答案后等反馈音效结束再朗读；自动下一题等朗读结束再计时；反馈区可手动重播
- `src/features/study/studyStore.ts`：开始、下一题、再试一次、跳过、手滑撤销与重置时立即打断朗读
- `src/components/Layout.tsx`：路由切换时停止朗读
- `src/stores/settingsStore.ts`、`src/features/settings/SettingsPage.tsx`：新增「单词朗读」开关，默认开启
- `src/styles/globals.css`：朗读按钮与反馈区喇叭样式
- `tests/unit/speech.test.ts`（新增）、`tests/e2e/app.spec.ts`：新增 3 项单元测试与 3 项 E2E
- `README.md`、`docs/使用指南.txt`、版本号文件

**实现功能**

- 学习模式词卡、独立词卡页与词库操作列都能手动朗读单词
- 练习答对或揭示答案后，先等待反馈音效真正播放结束，再朗读标准答案；避免两个声音重叠
- 朗读过程中切下一题、再试一次、跳过、手滑撤销、切换页面或关闭开关，都会立即取消当前发音
- 开启自动下一题时，切换延迟从朗读结束后开始计算，不会把单词读一半就切走
- 系统没有英文语音时，朗读按钮自动隐藏，设置项置灰并给出说明
- 语音完全离线，使用 WebView2 暴露的系统语音，不发起网络请求

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`

**测试结果**

- 通过。143 项单元测试、21 项 E2E、14 项 Rust 数据库测试全部通过
- 新增 E2E：反馈音效结束前不朗读、下一题立即打断；自动下一题等待朗读结束；词库与独立词卡手动朗读

**当前限制**

- 发音质量取决于 Windows 已安装的英文语音包，程序不内置音频文件
- 朗读语速固定为 0.9，暂不提供逐词调节；中文释义不朗读
- 朗读与打字机音效共用系统音频输出，音量不单独控制

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.2.4 · 听写模式、翻卡声音与朗读设置

**修改文件**

- `src/services/speechService.ts`：新增口音偏好（自动 / 美音 / 英音）、语速与音量配置；可用性改为可订阅状态，语音列表变化时自动刷新
- `src/hooks/useSpeechAvailability.ts`（新增）：用 `useSyncExternalStore` 暴露实时语音可用性
- `src/components/SpeakButton.tsx`：按语音可用性显示或隐藏，支持自定义标签与读屏文案
- `src/App.tsx`：把设置中的语速、音量与口音同步到朗读服务
- `src/stores/settingsStore.ts`：新增「答对后自动朗读」、朗读语速、朗读音量、语音口音、翻卡自动朗读、只听模式及对应迁移解析与限幅
- `src/features/settings/SettingsPage.tsx`：朗读总开关与自动朗读拆分，新增语速 / 音量滑杆、口音选择、试听按钮与无语音说明
- `src/domain/types.ts`、`src/domain/scheduler.ts`、`src/features/study/studyStore.ts`：新增听写模式
- `src/features/study/StudyPage.tsx`：听写题面、自动播放与重播；S / Ctrl+Space 快捷键；反馈例句朗读；打开模式选择页时停止朗读并暂停自动跳题
- `src/features/learn/LearnPage.tsx`、`WordReaderCard.tsx`：翻卡自动朗读、只听模式、例句朗读按钮、细节展开
- `src/features/dashboard/WordSlip.tsx`：贴条朗读按钮，轮播或卸载时停止朗读
- `src/features/words/WordTable.tsx`：操作列文字包裹，窄屏可收为图标
- `src/styles/globals.css`：模式选择、听写题面、只听模式、翻卡声音、按钮不换行与窄屏操作列样式
- `tests/unit/speech.test.ts`、`tests/e2e/app.spec.ts`：新增口音选择单元测试与 7 项 E2E
- `README.md`、`docs/使用指南.txt`、版本号文件（`package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock`、`tauri.conf.json`）

**实现功能**

- 新增听写模式：隐藏中文释义，题目出现后自动播放单词；可用按钮、S 或 Ctrl+Space 重播；无可用英文语音时按钮置灰并提示
- 学习模式可开启翻卡自动朗读与只听模式；只听模式隐藏释义、例句、标记与学习数据，可临时展开完整词卡，两项设置持久化
- 朗读设置拆分：「单词朗读」控制各处入口，「答对后自动朗读」可单独关闭；新增语速、音量与口音
- 首页贴条、练习反馈例句与独立词卡例句均可朗读；贴条轮播、切换页面或打开模式选择页会停止发音
- 没有可用英文语音时朗读按钮自动隐藏，设置项置灰；语音列表恢复后界面会自动恢复
- 修复打开「更换模式」后朗读仍在继续、自动下一题在背后推进的问题：进入选择页立即停止朗读并取消倒计时，返回后恢复
- 修复窄屏下按钮文字换行；窗口较窄时词库操作列自动收为图标按钮

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`

**测试结果**

- 通过。145 项单元测试、28 项 E2E、14 项 Rust 数据库测试全部通过
- 新增 E2E：切换模式停止朗读并暂停自动跳题；无英文语音时隐藏入口并禁用听写；听写模式自动播放与快捷键重播；翻卡自动朗读；只听模式隐藏与展开；首页贴条朗读及离场停止；窄屏操作列图标化
- 生产库只读复核，未写入真实学习数据

**当前限制**

- 听写模式与翻卡自动朗读依赖 Windows 已安装的英文语音包，程序不内置语音
- 朗读音色由系统语音决定，语速与音量可调，但无法改变音色
- 听写模式不显示中文释义，仍需保留字母提示与输入框；不会自动判定同音词

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.2.5 · Windows 系统语音回退

**修改文件**

- `src-tauri/src/tts.rs`（新增）：在独立线程中持有 `ISpVoice`，通过 `mpsc` 接收枚举 / 朗读 / 停止命令；SAPI 异步朗读、流号与 `GetStatus` 轮询判断结束，支持随时打断
- `src-tauri/src/lib.rs`：新增 `tts_list_voices`、`tts_speak`、`tts_stop` 命令与 `TtsState` 管理，超时自动停止
- `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`：为 Windows 引入 `windows` crate 的 Speech / COM 特性
- `src/services/speechService.ts`：双后端选择——优先本地 Web Speech 语音，否则使用 SAPI；在线 Web Speech 语音不再优先于本地系统语音；统一超时与打断逻辑
- `src/hooks/useSpeechAvailability.ts`：新增 `useSpeechBackend`，向设置页暴露当前后端
- `src/features/settings/SettingsPage.tsx`：SAPI 回退说明与两种后端均不可用时的安装提示
- `tests/unit/speechFallback.test.ts`（新增）：6 项后端选择与打断单元测试
- `README.md`、`docs/使用指南.txt`、版本号文件（`package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock`、`tauri.conf.json`）

**实现功能**

- 修复部分电脑提示「没有可用语音」：WebView2 只枚举 OneCore 语音（本机仅有中文 Huihui / Kangkang / YaoYao），传统 SAPI 中却存在 `Microsoft Zira` 等英文语音，此前完全看不到
- WebView2 没有本地英文语音时，自动改用 Windows SAPI；SAPI 英文语音目录与语言 LCID 由 Rust 端读取，语速映射到 SAPI 刻度，音量映射为 0–100
- 朗读在专门线程运行，切换下一题、离开页面或再次点击朗读会立即打断；程序设置 6 秒起的超时保护，后端异常不会卡住答题
- 在线 Web Speech 语音不再优先于本地 SAPI，保持完全离线；两种后端均无英文语音时，设置页提示到 Windows 语音设置安装英文语音包并重启
- 口音偏好、语速与音量对 SAPI 后端同样生效

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo test --manifest-path src-tauri/Cargo.toml speaks_with_a_real_sapi_voice -- --ignored`

**测试结果**

- 通过。151 项单元测试、28 项 E2E、19 项 Rust 测试全部通过；另有 1 项真实 SAPI 朗读测试默认忽略，手动运行时 2.14 秒内完成枚举、选声、异步朗读与结束检测
- 新增单元测试覆盖：WebView2 仅中文时回退 SAPI；仅有在线英文语音时优先本地 SAPI；存在本地英文语音时不调用 SAPI；语速 / 音量 / 口音透传；双后端不可用；朗读中立即停止
- 生产库只读复核，未写入真实学习数据

**当前限制**

- 音色由系统已安装的语音包决定，程序不内置音频，也不能改变音色
- 未安装任何英文 SAPI 语音的电脑仍需手动安装英文语音包；程序只能给出提示
- 首次枚举系统语音在部分电脑上可能有短暂延迟，朗读入口会稍后出现

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新

## 版本更新 0.2.6 · 听写独立池与分组感知的「只看勾选」

**修改文件**

- `src-tauri/src/db.rs`：新增 `WordState` 嵌套状态与 `dictation_enabled` / `dictation_state` 列；启动时 `ALTER TABLE` 迁移，旧词条按当前练习勾选补齐听写勾选；新增 `set_words_dictation_enabled`；导入替换时保留本机听写勾选与状态；重置进度同时重置听写状态；备份恢复对旧备份的听写列做兼容回退
- `src-tauri/src/lib.rs`：注册 `set_words_dictation_enabled` 命令
- `src/domain/studyPools.ts`（新增）：池状态读取、勾选标记、按池投影单词、把听写结果合并回 `dictationState`
- `src/domain/scheduler.ts`：`filterSelectableWords` / `isWordSelectable` 接受池参数；`selectNextWord` 支持 `stateOf` 从指定池计算有效权重
- `src/domain/types.ts`、`src/domain/wordFactory.ts`、`src/domain/weightCalculator.ts`：`StudyPool`、`dictationEnabled`、`dictationState` 与状态归一化
- `src/services/importExportService.ts`、`src/domain/schemas.ts`：导入导出包含听写勾选与听写状态；旧文件缺失字段时回退
- `src/services/repository/*`：接口与 Tauri / Web 两种实现支持听写勾选写入与旧数据归一化
- `src/features/study/studyStore.ts`、`StudyPage.tsx`：按模式选择出题池与状态，听写答题只写回听写状态；模式选择页分别显示两池词数
- `src/features/words/wordStore.ts`、`WordListPage.tsx`、`WordTable.tsx`：新增「练习池 / 听写池」切换；勾选、全选、权重、正确率与下次复习随当前池显示；「只看勾选」改为同时排除被暂停分组的词条
- `src/features/words/GroupBar.tsx`、`ImportGuideModal.tsx`、`src/styles/globals.css`：文案、导入字段说明与池切换样式
- `tests/unit/studyPools.test.ts`（新增）、`tests/unit/scheduler.test.ts`、`tests/unit/importExport.test.ts`、`tests/unit/helpers.ts`、`tests/e2e/app.spec.ts`
- `README.md`、`docs/使用指南.txt`、版本号文件（`package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock`、`tauri.conf.json`）

**实现功能**

- 听写模式拥有独立出题池：在词库切换到「听写池」后单独勾选，听写答题只更新听写池的权重、正确率与下次复习，练习池进度保持不变；练习答题也不会改写听写状态
- 词库表格、全选与计数都跟随当前池；两个池的勾选互不影响
- 「只看勾选」现在同时考虑单词复选框与分组开关：被暂停分组的词条会从默认列表排除，空白页区分「没有勾选」与「勾选被分组暂停」
- 分组暂停对练习与听写同时生效；升级自动迁移现有词条，默认沿用练习勾选，原学习进度不变

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`

**测试结果**

- 通过。162 项单元测试、31 项 E2E、21 项 Rust 测试通过；另 1 项真实 SAPI 朗读测试默认忽略
- 新增单元测试覆盖：双池状态读取与勾选独立、按池投影与合并、调度按指定池权重选题、分组暂停同时排除两池、导入导出保留听写字段
- 新增 E2E 覆盖：听写池独立勾选不影响练习池、听写答题只改听写状态、分组暂停时「只看勾选」隐藏组内词条
- 生产库只读复核，未写入真实学习数据

**当前限制**

- 统计页的答题量与正确率来自复习日志，练习与听写都会记录；待复习与复习预测仍按练习池统计
- JSON 导入更新同名单词时保留本机听写勾选与状态，完整听写进度迁移请使用 SQLite 备份恢复
- 听写模式仍依赖系统英文语音

**下一阶段**

- 按使用反馈继续调整，后续版本只发布 lite 安装包
- 每个版本随安装包交付 `TypeWord_<version>_使用指南.txt`，功能变化时同步更新；从 0.2.6 重新打包版起，指南同时嵌入安装目录（`<安装目录>\使用指南.txt`）

**追加打包（同日）**

- 将《使用指南》嵌入 0.2.6 安装包：`bundle.resources` 把 `src-tauri/resources/使用指南.txt` 安装为 `<安装目录>\使用指南.txt`；`npm run build` 先通过 `scripts/sync-guide.mjs` 同步 `docs/使用指南.txt`
- 使用指南「安装」一节补充安装目录内指南位置；重新生成 `TypeWord_0.2.6_x64-setup.exe`（功能与版本号不变），并更新并列的 `TypeWord_0.2.6_使用指南.txt`
- 验证：生成的 installer.nsi 含指南安装与卸载条目，安装包 FileVersion / ProductVersion 均为 0.2.6；未运行安装器；生产库只读复核未变化

## 版本更新 0.2.7 · 环境音

**修改文件**

- `public/ambient/`（新增）：六段可循环环境音 `rain.ogg`、`coffee-shop.ogg`、`fireplace.ogg`、`birds.ogg`、`summer-night.ogg`、`wind.ogg`，取自 Blanket，共约 7.6 MB；`CREDITS.md` 记录作者、来源、许可与编辑说明
- `src/services/ambientSoundService.ts`（新增）：曲目清单、`parseAmbientSound`、单 `<audio>` 元素播放服务与可取消的淡入淡出
- `src/components/AmbientSoundControl.tsx`（新增）：设置页选择器与侧边栏入口弹窗
- `src/components/Icons.tsx`、`src/components/Layout.tsx`：新增 music / rain / coffee / bird / moon / wind 图标与侧边栏「环境音」按钮
- `src/App.tsx`：随设置同步环境音播放状态
- `src/stores/settingsStore.ts`：新增 `ambientSound`、`ambientVolume`，键名 `ambient_sound`、`ambient_volume`，非法值回退关闭、音量截断到 0–1
- `src/features/settings/SettingsPage.tsx`、`src/styles/globals.css`：环境音面板、选项网格、音量条、来源许可折叠区与窄屏适配
- `tests/unit/ambientSound.test.ts`（新增）、`tests/e2e/app.spec.ts`
- `README.md`、`docs/使用指南.txt`、版本号文件（`package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock`、`tauri.conf.json`）

**实现功能**

- 六种离线环境音：雨声、咖啡馆、壁炉、鸟鸣、夏夜虫鸣、风声；单曲循环，单选，可与打字机音效、单词朗读同时使用
- 调节音量时实时生效；切换曲目或关闭时淡出，新曲目淡入，切换页面与答题不会打断
- 选择在设置页与侧边栏弹窗均可完成，刷新或重启后自动恢复；浏览器自动播放限制下会在首次点击或按键时补播
- 设置页可展开查看每段音频的作者、来源与许可；README、使用指南同步补充回退与授权说明

**运行测试**

- `npm run typecheck`
- `npm test`
- `npm run test:e2e`
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`

**测试结果**

- 通过。166 项单元测试、32 项 E2E、21 项 Rust 测试通过；另 1 项真实 SAPI 朗读测试默认忽略
- 新增单元测试覆盖：默认关闭与默认音量、六种曲目识别、非法设置回退、音量截断、曲目元数据与资源路径
- 新增 E2E 覆盖：侧边栏选择咖啡馆、音量滑杆写入设置、刷新后保留、关闭后暂停
- 真实音频验证：Chromium 解码六段 OGG，均为双声道 48 kHz，时长 14.8–129.8 秒，峰值 0.056–0.41；无头静音模式下确认播放时间轴推进；另以可见浏览器实际外放咖啡馆与雨声各约 6 秒，切换与关闭正常
- 生产库只读复核：integrity ok，205 个词条、1084 条复习日志，未写入真实学习数据

**当前限制**

- 环境音为安装包内静态 OGG，不支持自定义导入、定时停止或按曲目分别记忆音量
- 雨声为 CC BY 3.0，分发时需保留 `public/ambient/CREDITS.md` 与设置页署名
- 浏览器自动播放策略下，若启动时未获得用户手势，首次声音会在页面首次点击或按键后开始
- E2E 仅校验播放调用与设置持久化；真实解码与扬声器输出依靠独立的有声验证，不在常规测试套件内

**下一阶段**

- 按使用反馈继续调整；后续版本只发布 lite 安装包
- 每版随安装包交付 `TypeWord_<version>_使用指南.txt`，指南同时嵌入安装目录

**追加打包（同日）**

- `npm run build` 自动把 `docs/使用指南.txt` 同步到 `src-tauri/resources/使用指南.txt`；Tauri 将前端静态资源（含六段 OGG 与 `CREDITS.md`）嵌入可执行文件，安装目录只额外释放指南与 WebView2Loader.dll
- 产物 `src-tauri/target/release/bundle/nsis/TypeWord_0.2.7_x64-setup.exe`，9,693,392 字节（9.24 MiB），FileVersion / ProductVersion 均为 0.2.7，SHA256 `384BC25C5A0E2E0A3C072FF9090DC89467CAF472E5D8DDEC6F0DFD3D4E169805`
- 并列交付 `TypeWord_0.2.7_使用指南.txt`，SHA256 `F0DD92082A89994AB3917456AC9003953A35CCF6AD963A0EDED932BD917530DF`
- 安装脚本包含指南安装与卸载条目；可执行文件中已确认存在 `ambient/rain.ogg`、`ambient/coffee-shop.ogg` 与 `ambient/CREDITS.md` 资源路径；未运行安装器
