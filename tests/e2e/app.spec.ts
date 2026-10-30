import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

const SEARCH_LABEL = '搜索词库';
const ANSWER_LABEL = '英文答案输入框';

async function resetApp(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: '今日书桌' })).toBeVisible();
}

async function openWords(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /词库/ })
    .click();
  await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
}

async function createWord(
  page: Page,
  options: { word: string; meaning: string; category: string; difficulty?: number },
): Promise<void> {
  await openWords(page);
  await page.getByRole('button', { name: '新增单词' }).first().click();

  const dialog = page.getByRole('dialog', { name: '新增词条' });
  await dialog.getByLabel('英文单词').fill(options.word);
  await dialog.getByLabel('中文释义').fill(options.meaning);
  await dialog.getByLabel('分类').fill(options.category);
  if (options.difficulty) {
    await dialog.getByLabel('难度').selectOption(String(options.difficulty));
  }
  await dialog.getByRole('button', { name: '加入词库' }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel(SEARCH_LABEL).fill(options.word);
  await expect(page.locator('.word-table tbody tr').filter({ hasText: options.word })).toBeVisible();
}

async function startStudy(page: Page, category: string, meaning: string): Promise<void> {
  await page.goto(`/#/study?category=${encodeURIComponent(category)}`);
  await expect(page.getByRole('heading', { name: meaning })).toBeVisible();
  await expect(page.locator('.study-progress-text')).toHaveText('第 1 题');
}

async function createWordInGroup(
  page: Page,
  options: { word: string; meaning: string; category: string; groupName: string },
): Promise<void> {
  await openWords(page);
  await page.getByRole('button', { name: '新增单词' }).first().click();

  const dialog = page.getByRole('dialog', { name: '新增词条' });
  await dialog.getByLabel('英文单词').fill(options.word);
  await dialog.getByLabel('中文释义').fill(options.meaning);
  await dialog.getByLabel('分类').fill(options.category);
  await dialog.getByLabel('练习分组').selectOption({ label: options.groupName });
  await dialog.getByRole('button', { name: '加入词库' }).click();
  await expect(dialog).toBeHidden();
}

async function openLearn(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('link', { name: /学习/ })
    .click();
  await expect(page.getByRole('heading', { name: '学习模式' })).toBeVisible();
}

async function mockSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { spoken: [] as string[], cancelled: 0, speaking: false };
    (window as unknown as { __speech: typeof state }).__speech = state;

    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        get speaking() {
          return state.speaking;
        },
        getVoices: () => [{ name: 'Test English', lang: 'en-US', localService: true }],
        speak(utterance: FakeUtterance) {
          state.spoken.push(utterance.text);
          state.speaking = true;
          window.setTimeout(() => {
            state.speaking = false;
            utterance.onend?.();
          }, 2_000);
        },
        cancel() {
          state.cancelled += 1;
          state.speaking = false;
        },
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
}

async function mockAmbientPlayback(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { started: [] as string[], paused: 0 };
    (window as unknown as { __ambient: typeof state }).__ambient = state;
    const originalPlay = HTMLMediaElement.prototype.play;
    const originalPause = HTMLMediaElement.prototype.pause;

    HTMLMediaElement.prototype.play = function () {
      if (!this.src.includes('/ambient/')) return originalPlay.call(this);
      state.started.push(this.src);
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      if (!this.src.includes('/ambient/')) {
        originalPause.call(this);
        return;
      }
      state.paused += 1;
    };
  });
}

async function mockNoEnglishVoice(page: Page): Promise<void> {
  await page.addInitScript(() => {
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      pitch = 1;
      volume = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(text: string) {
        this.text = text;
      }
    }

    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speaking: false,
        getVoices: () => [{ name: 'Microsoft Huihui', lang: 'zh-CN', localService: true }],
        speak() {},
        cancel() {},
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
}

function readSpeechState(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __speech: { spoken: string[]; cancelled: number } }).__speech,
  );
}

test.describe('TypeWord 离线学习流程', () => {
  test('答错后重试答对，权重持久化并写入统计', async ({ page }) => {
    const word = 'e2etestword';
    const meaning = 'E2E 临时测试释义';
    const category = 'E2E-CORE';

    await resetApp(page);
    await createWord(page, { word, meaning, category, difficulty: 3 });
    await startStudy(page, category, meaning);

    const answer = page.getByLabel(ANSWER_LABEL);
    await answer.fill('zzzz');
    await answer.press('Enter');

    await expect(page.locator('.feedback__stamp').filter({ hasText: 'INCORRECT' })).toBeVisible();
    await expect(page.getByRole('button', { name: '再试一次' })).toBeVisible();

    await page.getByRole('button', { name: '再试一次' }).click();
    await expect(answer).toHaveValue('');
    await answer.fill(word);
    await answer.press('Enter');

    await expect(page.locator('.feedback__stamp').filter({ hasText: 'CORRECT' })).toBeVisible();
    const feedback = page.locator('.feedback__grid');
    await expect(feedback).toContainText('6.60');
    await expect(feedback).toContainText('4.29');

    await page.goto('/#/words');
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row).toContainText('4.29');
    await expect(row).toContainText('1/2');

    await page.reload();
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    await expect(
      page.locator('.word-table tbody tr').filter({ hasText: word }),
    ).toContainText('4.29');

    await page.goto('/#/stats');
    await expect(page.getByRole('heading', { name: '统计', exact: true })).toBeVisible();
    await expect(
      page.locator('.stat-card').filter({ hasText: '累计答题' }).locator('.stat-card__value'),
    ).toHaveText('2');
    await expect(
      page.locator('.stat-card').filter({ hasText: '累计正确率' }).locator('.stat-card__value'),
    ).toHaveText('50%');
    await expect(page.locator('.wrong-table')).toContainText(word);
  });

  test('我不会直接揭示答案，并按答错记录与安排重练', async ({ page }) => {
    const word = 'giveuptarget';
    const meaning = '放弃测试释义';
    const category = 'E2E-GIVEUP';

    await resetApp(page);
    await createWord(page, { word, meaning, category, difficulty: 2 });
    await startStudy(page, category, meaning);

    await page.getByRole('button', { name: '我不会' }).click();

    await expect(page.locator('.feedback__stamp').filter({ hasText: 'NOT YET' })).toBeVisible();
    await expect(page.locator('.feedback__copy')).toContainText('已按答错记录');
    const feedback = page.locator('.feedback__grid');
    await expect(feedback).toContainText(word);
    await expect(feedback).toContainText('（我不会）');
    await expect(feedback).toContainText('6.60');
    await expect(feedback).toContainText('10 分钟');
    await expect(page.getByRole('button', { name: '下一题' })).toBeVisible();

    await page.goto('/#/words');
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row).toContainText('6.60');
    await expect(row).toContainText('0/1');
  });

  test('额外提示生效，有提示答对按 0.82 调整权重', async ({ page }) => {
    const word = 'hinttarget';
    const meaning = '提示测试释义';
    const category = 'E2E-HINT';

    await resetApp(page);
    await createWord(page, { word, meaning, category, difficulty: 2 });
    await startStudy(page, category, meaning);

    await expect(page.getByText('已请求额外提示')).toHaveCount(0);
    await page.getByRole('button', { name: '再提示一个字母' }).click();
    await expect(page.getByText('已请求额外提示')).toBeVisible();
    await expect(page.locator('.hint-block__label')).toContainText('2 /');

    const answer = page.getByLabel(ANSWER_LABEL);
    await answer.fill(word);
    await answer.press('Enter');

    await expect(page.locator('.feedback__stamp').filter({ hasText: 'CORRECT' })).toBeVisible();
    await expect(page.locator('.feedback__copy')).toContainText('提示帮了忙');
    const feedback = page.locator('.feedback__grid');
    await expect(feedback).toContainText('3.00');
    await expect(feedback).toContainText('2.46');
  });

  test('词库支持新增、搜索、编辑与删除', async ({ page }) => {
    const word = 'ledgerProbe';
    const category = 'E2E-CRUD';

    await resetApp(page);
    await createWord(page, { word, meaning: '账本探针', category, difficulty: 4 });

    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row).toContainText('账本探针');
    await expect(row).toContainText(category);

    await page.getByRole('button', { name: `编辑 ${word}` }).click();
    const editDialog = page.getByRole('dialog', { name: '编辑词条' });
    await editDialog.getByLabel('中文释义').fill('账本探针已修订');
    await editDialog.getByRole('button', { name: '保存修改' }).click();
    await expect(editDialog).toBeHidden();

    await page.getByLabel(SEARCH_LABEL).fill('已修订');
    await expect(
      page.locator('.word-table tbody tr').filter({ hasText: word }),
    ).toContainText('账本探针已修订');

    await page.getByRole('button', { name: `删除 ${word}` }).click();
    const deleteDialog = page.getByRole('dialog', { name: '删除这个单词？' });
    await deleteDialog.getByRole('button', { name: '确认删除' }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(page.getByText('没有匹配的词条')).toBeVisible();
  });

  test('编辑按钮始终可见，be taken back 释义已修正', async ({ page }) => {
    await resetApp(page);
    await openWords(page);
    await page.getByLabel(SEARCH_LABEL).fill('be taken back');

    const row = page.locator('.word-table tbody tr').filter({ hasText: 'be taken back' });
    await expect(row).toContainText('大吃一惊');
    const editButton = page.getByRole('button', { name: '编辑 be taken back' });
    await expect(editButton).toBeInViewport();

    await editButton.click();
    const editDialog = page.getByRole('dialog', { name: '编辑词条' });
    await expect(editDialog.getByLabel('中文释义')).toHaveValue('大吃一惊\n惊呆\n被吓了一跳');
    await editDialog.getByLabel('中文释义').fill('大吃一惊\n惊呆');
    await editDialog.getByRole('button', { name: '保存修改' }).click();
    await expect(editDialog).toBeHidden();

    await expect(page.locator('.word-table tbody tr').filter({ hasText: 'be taken back' })).toContainText(
      '大吃一惊；惊呆',
    );
  });

  test('单词勾选与分组暂停共同决定出题范围', async ({ page }) => {
    const word = 'e2egroupword';
    const meaning = 'E2E 分组测试释义';
    const category = 'E2E-GROUP';
    const groupName = 'E2E-阅读组';

    await resetApp(page);
    await openWords(page);

    await page.getByRole('button', { name: '新建分组' }).click();
    const groupDialog = page.getByRole('dialog', { name: '新建分组' });
    await groupDialog.getByLabel('分组名称').fill(groupName);
    await groupDialog.getByRole('button', { name: '创建分组' }).click();
    await expect(groupDialog).toBeHidden();
    await expect(page.getByLabel(`启用分组 ${groupName}`)).toBeChecked();

    await page.getByRole('button', { name: '新增单词' }).first().click();
    const editor = page.getByRole('dialog', { name: '新增词条' });
    await editor.getByLabel('英文单词').fill(word);
    await editor.getByLabel('中文释义').fill(meaning);
    await editor.getByLabel('分类').fill(category);
    await editor.getByLabel('练习分组').selectOption({ label: groupName });
    await editor.getByRole('button', { name: '加入词库' }).click();
    await expect(editor).toBeHidden();

    await page.getByLabel(SEARCH_LABEL).fill(word);
    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row).toContainText(groupName);

    await startStudy(page, category, meaning);

    await page.goto('/#/words');
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    const wordToggle = page.getByLabel(`启用 ${word}`);
    await expect(wordToggle).toBeChecked();
    await wordToggle.click();
    await expect(page.locator('.word-table tbody tr').filter({ hasText: word })).toHaveCount(0);
    await page.goto(`/#/study?category=${encodeURIComponent(category)}`);
    await expect(page.locator('.study-end')).toBeVisible();
    await expect(page.getByRole('heading', { name: meaning })).toHaveCount(0);

    await page.goto('/#/words');
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    await page.getByRole('button', { name: /只看勾选/ }).click();
    await page.getByLabel(`启用 ${word}`).check();
    const groupToggle = page.getByLabel(`启用分组 ${groupName}`);
    await groupToggle.uncheck();
    await page.goto(`/#/study?category=${encodeURIComponent(category)}`);
    await expect(page.locator('.study-end')).toBeVisible();
    await expect(page.getByRole('heading', { name: meaning })).toHaveCount(0);

    await page.goto('/#/words');
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(`启用分组 ${groupName}`).check();
    await startStudy(page, category, meaning);
  });

  test('JSON 导入可创建分组，并与导出闭环', async ({ page }) => {
    const word = 'importedterm';
    const groupName = 'E2E-导入组';
    const payload = {
      app: 'TypeWord',
      version: 1,
      words: [
        {
          word,
          meanings: ['导入测试释义'],
          category: 'E2E-IMPORT',
          difficulty: 2,
          tags: ['e2e'],
        },
      ],
    };

    await resetApp(page);
    await openWords(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'typeword-e2e-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(payload), 'utf8'),
    });

    const optionsDialog = page.getByRole('dialog', { name: '导入设置' });
    await expect(optionsDialog).toBeVisible();
    await expect(optionsDialog).toContainText('typeword-e2e-import.json');
    await optionsDialog.getByText('创建新分组并放入', { exact: true }).click();
    await expect(
      optionsDialog.getByRole('checkbox', { name: '创建新分组并放入' }),
    ).toBeChecked();
    await optionsDialog.getByLabel('导入分组名称').fill(groupName);
    await optionsDialog.getByRole('button', { name: '开始导入' }).click();
    await expect(optionsDialog).toBeHidden();

    const reportDialog = page.getByRole('dialog', { name: '导入结果' });
    await expect(reportDialog).toBeVisible();
    await expect(
      reportDialog.locator('.import-report__summary > div').filter({ hasText: '新增' }),
    ).toContainText('1');
    await expect(reportDialog).toContainText(`已创建分组「${groupName}」`);
    await reportDialog.getByRole('button', { name: '知道了' }).click();
    await expect(reportDialog).toBeHidden();

    await page.getByLabel(SEARCH_LABEL).fill(word);
    const importedRow = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(importedRow).toContainText('导入测试释义');
    await expect(importedRow).toContainText(groupName);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出 JSON' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^typeword-\d{4}-\d{2}-\d{2}\.json$/);

    const path = await download.path();
    expect(path).not.toBeNull();
    const content = JSON.parse(await readFile(path as string, 'utf8')) as {
      app: string;
      words: Array<{ word: string; weight: number }>;
    };
    expect(content.app).toBe('TypeWord');
    expect(content.words.some((entry) => entry.word === word)).toBe(true);
    expect(content.words.length).toBeGreaterThan(70);
  });

  test('分组管理弹窗可批量加入与移出单词', async ({ page }) => {
    const word = 'groupassignword';
    const meaning = '分组加词测试释义';
    const category = 'E2E-GROUP-ASSIGN';
    const groupName = 'E2E-批量组';

    await resetApp(page);
    await openWords(page);

    await page.getByRole('button', { name: '新建分组' }).click();
    const groupDialog = page.getByRole('dialog', { name: '新建分组' });
    await groupDialog.getByLabel('分组名称').fill(groupName);
    await groupDialog.getByRole('button', { name: '创建分组' }).click();
    await expect(groupDialog).toBeHidden();

    await createWord(page, { word, meaning, category, difficulty: 2 });

    await page.getByRole('button', { name: `管理分组 ${groupName} 的单词` }).click();
    const manager = page.getByRole('dialog', { name: '管理分组单词' });
    await expect(manager).toBeVisible();
    await manager.getByLabel('搜索分组单词').fill(word);
    await manager.getByLabel(`分组词条 ${word}`).check();
    await manager.getByRole('button', { name: '保存分组' }).click();
    await expect(manager).toBeHidden();

    await page.getByLabel(SEARCH_LABEL).fill(word);
    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row).toContainText(groupName);

    await page.getByRole('button', { name: `管理分组 ${groupName} 的单词` }).click();
    const managerAgain = page.getByRole('dialog', { name: '管理分组单词' });
    await managerAgain.getByLabel('搜索分组单词').fill(word);
    await managerAgain.getByLabel(`分组词条 ${word}`).uncheck();
    await managerAgain.getByRole('button', { name: '保存分组' }).click();
    await expect(managerAgain).toBeHidden();
    await expect(row).not.toContainText(groupName);
  });

  test('答错后可标记手滑，撤销错误并按跳过记录', async ({ page }) => {
    const word = 'slipword';
    const meaning = '手滑测试释义';
    const category = 'E2E-SLIP';

    await resetApp(page);
    await createWord(page, { word, meaning, category, difficulty: 3 });
    await startStudy(page, category, meaning);

    const answer = page.getByLabel(ANSWER_LABEL);
    await answer.fill('slpword');
    await answer.press('Enter');

    await expect(page.locator('.feedback__stamp').filter({ hasText: 'INCORRECT' })).toBeVisible();
    await page.getByRole('button', { name: '手滑打错了' }).click();

    await expect(page.locator('.feedback__stamp').filter({ hasText: 'SKIPPED' })).toBeVisible();
    await expect(page.locator('.feedback__copy')).toContainText('不计入成绩');
    await expect(page.locator('.feedback__grid')).toContainText('slpword');
    await expect(page.locator('.feedback__grid')).toContainText('3.00');
    await expect(
      page.locator('.session-stats div').filter({ hasText: '已作答' }).locator('strong'),
    ).toHaveText('0');

    const logs = await page.evaluate(() => {
      const raw = window.localStorage.getItem('typeword.webdb.v1');
      return raw ? (JSON.parse(raw).logs as Array<{ result: string }>) : [];
    });
    expect(logs.filter((log) => log.result === 'wrong')).toHaveLength(0);
    expect(logs.filter((log) => log.result === 'skipped')).toHaveLength(1);

    await page.goto('/#/words');
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row).toContainText('3.00');
    await expect(row).toContainText('0/0');

    await page.reload();
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    await expect(
      page.locator('.word-table tbody tr').filter({ hasText: word }),
    ).toContainText('0/0');
  });

  test('首页单词贴条与主标题文案每 10 秒同步轮播', async ({ page }) => {
    await resetApp(page);

    const slip = page.locator('.hero__slip .slip-type');
    const title = page.locator('.hero__title');
    await expect(slip).toBeVisible();
    const firstWord = (await slip.innerText()).replace(/\s+/g, '');
    const firstQuote = (await title.innerText()).replace(/\s+/g, '');

    await page.waitForTimeout(2_000);
    expect((await slip.innerText()).replace(/\s+/g, '')).toBe(firstWord);
    expect((await title.innerText()).replace(/\s+/g, '')).toBe(firstQuote);

    await expect
      .poll(async () => (await slip.innerText()).replace(/\s+/g, ''), { timeout: 12_000 })
      .not.toBe(firstWord);

    await expect
      .poll(async () => (await title.innerText()).replace(/\s+/g, ''), { timeout: 2_000 })
      .not.toBe(firstQuote);
  });

  test('导入按钮旁可查看 JSON 格式说明', async ({ page }) => {
    await resetApp(page);
    await openWords(page);

    await page.getByRole('button', { name: '查看导入格式说明' }).click();
    const guide = page.getByRole('dialog', { name: '批量导入格式说明' });
    await expect(guide).toBeVisible();
    await expect(guide).toContainText('"word"');
    await expect(guide).toContainText('"meanings"');
    await expect(guide).toContainText('分组不会随 JSON 导入或导出');

    await guide.getByRole('button', { name: '知道了' }).click();
    await expect(guide).toBeHidden();
  });

  test('学习模式可独立选择词条与分组，翻卡不写入进度', async ({ page }) => {
    const wordA = 'learncardalpha';
    const wordB = 'learncardbeta';
    const wordC = 'learncardgamma';
    const category = 'E2E-LEARN';
    const groupName = 'E2E-翻卡组';

    await resetApp(page);
    await openWords(page);

    await page.getByRole('button', { name: '新建分组' }).click();
    const groupDialog = page.getByRole('dialog', { name: '新建分组' });
    await groupDialog.getByLabel('分组名称').fill(groupName);
    await groupDialog.getByRole('button', { name: '创建分组' }).click();
    await expect(groupDialog).toBeHidden();

    await createWordInGroup(page, {
      word: wordA,
      meaning: '翻卡测试甲',
      category,
      groupName,
    });
    await createWordInGroup(page, {
      word: wordB,
      meaning: '翻卡测试乙',
      category,
      groupName,
    });
    await createWord(page, { word: wordC, meaning: '翻卡测试丙', category });

    await openLearn(page);
    const total = await page.evaluate(() => {
      const raw = window.localStorage.getItem('typeword.webdb.v1');
      return raw ? (JSON.parse(raw).words as unknown[]).length : 0;
    });
    expect(total).toBeGreaterThan(2);

    const scopeButton = page
      .locator('.page-head__actions')
      .getByRole('button', { name: '选择学习范围' });
    await scopeButton.click();
    const scopeDialog = page.getByRole('dialog', { name: '选择学习范围' });
    await expect(scopeDialog).toBeVisible();

    await scopeDialog.getByRole('button', { name: '全部取消' }).click();
    const groupChip = scopeDialog.getByRole('button', {
      name: new RegExp(`${groupName} 学习范围`),
    });
    await groupChip.click();
    await expect(groupChip).toHaveAttribute('aria-pressed', 'true');
    await scopeDialog.getByRole('button', { name: '保存选择' }).click();
    await expect(scopeDialog).toBeHidden();

    await expect(page.locator('.reader-scope__head .panel__count')).toHaveText(`2 / ${total}`);
    await expect(page.locator('.reader-word h1')).toHaveText(wordA);

    await page.locator('.reader-page').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.reader-page')).toHaveClass(/reader-page--next/);
    await expect(page.locator('.reader-word h1')).toHaveText(wordB);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.reader-page')).toHaveClass(/reader-page--previous/);
    await expect(page.locator('.reader-word h1')).toHaveText(wordA);

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('typeword.webdb.v1');
      const database = raw
        ? (JSON.parse(raw) as {
            words: Array<{ word: string; studyEnabled: boolean; weight: number; enabled: boolean }>;
            logs: unknown[];
          })
        : { words: [], logs: [] };
      return {
        logs: database.logs.length,
        alpha: database.words.find((word) => word.word === 'learncardalpha'),
        beta: database.words.find((word) => word.word === 'learncardbeta'),
        gamma: database.words.find((word) => word.word === 'learncardgamma'),
      };
    });
    expect(stored.logs).toBe(0);
    expect(stored.alpha).toMatchObject({ studyEnabled: true, weight: 3, enabled: true });
    expect(stored.beta).toMatchObject({ studyEnabled: true, weight: 3, enabled: true });
    expect(stored.gamma).toMatchObject({ studyEnabled: false, weight: 3, enabled: true });

    await page.goto('/#/words');
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByLabel(SEARCH_LABEL).fill(wordC);
    await expect(page.getByLabel(`启用 ${wordC}`)).toBeChecked();
    await expect(page.getByLabel(`启用分组 ${groupName}`)).toBeChecked();

    await openLearn(page);
    const asideGroupChip = page
      .locator('.reader-group-list')
      .getByRole('button', { name: new RegExp(`${groupName} 学习范围`) });
    await asideGroupChip.click();
    await expect(page.locator('.reader-scope__head .panel__count')).toHaveText(`0 / ${total}`);
    await expect(page.getByRole('heading', { name: '学习范围还是空的' })).toBeVisible();

    await asideGroupChip.click();
    await expect(page.locator('.reader-scope__head .panel__count')).toHaveText(`2 / ${total}`);

    await scopeButton.click();
    const individualDialog = page.getByRole('dialog', { name: '选择学习范围' });
    const selectAllToggle = individualDialog.locator('.scope-summary__actions .text-link');
    if ((await selectAllToggle.innerText()).trim() === '全部选中') {
      await selectAllToggle.click();
    }
    await individualDialog.getByRole('button', { name: '全部取消' }).click();
    const onlyAlpha = individualDialog.locator('.scope-word').filter({ hasText: wordA });
    await onlyAlpha.getByRole('checkbox').check();
    await individualDialog.getByRole('button', { name: '保存选择' }).click();
    await expect(individualDialog).toBeHidden();
    await expect(page.locator('.reader-scope__head .panel__count')).toHaveText(`1 / ${total}`);
    await expect(page.locator('.reader-word h1')).toHaveText(wordA);

    await page.locator('.reader-page').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.reader-word h1')).toHaveText(wordA);
  });

  test('学习模式记住当前词卡，切换模式与重新打开后继续', async ({ page }) => {
    await resetApp(page);
    await openLearn(page);

    const cardTitle = page.locator('.reader-word h1');
    await expect(cardTitle).toBeVisible();
    const firstCard = await cardTitle.innerText();

    await page.locator('.reader-page').click();
    await page.keyboard.press('ArrowRight');
    await expect(cardTitle).not.toHaveText(firstCard);
    const secondCard = await cardTitle.innerText();

    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem('typeword.webdb.v1');
          const settings = raw
            ? (JSON.parse(raw) as { settings?: Record<string, string> }).settings
            : undefined;
          return settings?.learn_last_word_id ?? '';
        }),
      )
      .not.toBe('');

    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /练习/ })
      .click();
    await expect(page.getByRole('heading', { name: '今天怎么练？' })).toBeVisible();

    await openLearn(page);
    await expect(cardTitle).toHaveText(secondCard);

    await page.reload();
    await expect(cardTitle).toHaveText(secondCard);
  });

  test('学习模式可标记词卡，标记持久化并能在词库筛选', async ({ page }) => {
    const word = 'learnmarkstar';
    const meaning = '词卡标记测试';
    const category = 'E2E-MARK';

    await resetApp(page);
    await createWord(page, { word, meaning, category });

    const wordId = await page.evaluate((target) => {
      const raw = window.localStorage.getItem('typeword.webdb.v1');
      const database = raw
        ? (JSON.parse(raw) as { words: Array<{ id: string; word: string }> })
        : { words: [] };
      return database.words.find((item) => item.word === target)?.id ?? '';
    }, word);
    expect(wordId).not.toBe('');

    await page.goto(`/#/card/${encodeURIComponent(wordId)}`);
    await expect(page.getByRole('heading', { name: '词卡', exact: true })).toBeVisible();
    await expect(page.locator('.reader-word h1')).toHaveText(word);
    await expect(page.locator('.reader-scope-panel')).toHaveCount(0);

    const marks = page.getByRole('group', { name: '词卡标记' });
    const starButton = marks.getByRole('button', { name: '收藏' });
    await starButton.click();
    await expect(starButton).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    const storedMark = await page.evaluate((target) => {
      const raw = window.localStorage.getItem('typeword.webdb.v1');
      const database = raw
        ? (JSON.parse(raw) as { words: Array<{ word: string; mark: string }> })
        : { words: [] };
      return database.words.find((item) => item.word === target)?.mark ?? '';
    }, word);
    expect(storedMark).toBe('starred');

    await page.goto('/#/words');
    await page.getByLabel(SEARCH_LABEL).fill(word);
    await expect(page.locator('.word-mark--starred')).toHaveText('收藏');
    await page.getByLabel('按标记筛选').selectOption('starred');
    await expect(page.locator('.word-table tbody tr').filter({ hasText: word })).toBeVisible();
    await page.getByLabel('按标记筛选').selectOption('later');
    await expect(page.locator('.word-table tbody tr').filter({ hasText: word })).toHaveCount(0);
  });

  test('首页单词贴条打开独立词卡页，不进入学习模式', async ({ page }) => {
    await resetApp(page);

    const openButton = page.getByRole('button', { name: /^打开 .+ 的词卡$/ });
    await expect(openButton).toBeVisible();
    const label = await openButton.getAttribute('aria-label');
    const word = label?.replace(/^打开 /, '').replace(/ 的词卡$/, '') ?? '';
    expect(word).not.toBe('');

    await openButton.click();
    await expect(page).toHaveURL(/#\/card\//);
    await expect(page.getByRole('heading', { name: '词卡', exact: true })).toBeVisible();
    await expect(page.locator('.reader-word h1')).toHaveText(word);
    await expect(page.locator('.reader-scope-panel')).toHaveCount(0);
    await expect(page.locator('.tag--accent').filter({ hasText: '预览' })).toHaveCount(0);
  });

  test('词库默认只显示勾选的单词，可切换查看全部', async ({ page }) => {
    const word = 'enabledonlyprobe';

    await resetApp(page);
    await createWord(page, {
      word,
      meaning: '只看勾选测试',
      category: 'E2E-ENABLED',
    });

    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row).toBeVisible();

    await page.getByLabel(`启用 ${word}`).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByText('没有勾选的词条')).toBeVisible();

    const toggle = page.getByRole('button', { name: /只看勾选/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(row).toBeVisible();
    await expect(page.getByLabel(`启用 ${word}`)).not.toBeChecked();

    await toggle.click();
    await expect(row).toHaveCount(0);
  });

  test('听写池可独立勾选，不影响练习池的勾选', async ({ page }) => {
    const word = 'poolswitchprobe';

    await resetApp(page);
    await createWord(page, {
      word,
      meaning: '双池勾选测试',
      category: 'E2E-POOL',
    });

    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(page.getByLabel(`启用 ${word}（练习）`)).toBeChecked();

    await page.getByRole('button', { name: /^听写池/ }).click();
    const dictationToggle = page.getByLabel(`启用 ${word}（听写）`);
    await expect(dictationToggle).toBeChecked();
    await dictationToggle.click();
    await expect(row).toHaveCount(0);

    await page.getByRole('button', { name: /^练习池/ }).click();
    await expect(row).toBeVisible();
    await expect(page.getByLabel(`启用 ${word}（练习）`)).toBeChecked();

    await page.getByRole('button', { name: /^听写池/ }).click();
    await page.getByRole('button', { name: /只看勾选/ }).click();
    await expect(page.getByLabel(`启用 ${word}（听写）`)).not.toBeChecked();

    const stored = await page.evaluate((target) => {
      const raw = window.localStorage.getItem('typeword.webdb.v1');
      const database = raw
        ? (JSON.parse(raw) as {
            words: Array<{ word: string; enabled: boolean; dictationEnabled: boolean }>;
          })
        : { words: [] };
      return database.words.find((item) => item.word === target);
    }, word);
    expect(stored).toMatchObject({ enabled: true, dictationEnabled: false });
  });

  test('听写答题只更新听写池状态，练习权重保持不变', async ({ page }) => {
    const word = 'dictationpoolword';
    const meaning = '听写独立权重测试';
    const category = 'E2E-DICTATION-POOL';

    await mockSpeech(page);
    await resetApp(page);
    await createWord(page, { word, meaning, category });

    await page.getByLabel(SEARCH_LABEL).fill('');
    await page.getByRole('button', { name: /^听写池/ }).click();
    await page.getByLabel('全选当前显示的听写词条').click();
    await page.getByRole('button', { name: /只看勾选/ }).click();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    await page.getByLabel(`启用 ${word}（听写）`).check();
    await expect(page.locator('.word-table tbody tr').filter({ hasText: word })).toBeVisible();

    await page.goto('/#/study');
    await expect(page.getByRole('heading', { name: '今天怎么练？' })).toBeVisible();
    await expect(page.locator('.mode-option--dictation dd').first()).toHaveText('1 个词');
    await page.getByRole('button', { name: '进入听写模式' }).click();
    await expect(page.locator('.dictation-block h1')).toHaveText('听读音，写出单词');

    const answer = page.getByLabel(ANSWER_LABEL);
    await answer.fill('zzzz');
    await answer.press('Enter');
    await expect(page.locator('.feedback__stamp').filter({ hasText: 'INCORRECT' })).toBeVisible();
    const feedback = page.locator('.feedback__grid');
    await expect(feedback).toContainText('3.00');
    await expect(feedback).toContainText('6.60');

    const stored = await page.evaluate((target) => {
      const raw = window.localStorage.getItem('typeword.webdb.v1');
      const database = raw
        ? (JSON.parse(raw) as {
            words: Array<{
              word: string;
              weight: number;
              attemptCount: number;
              dictationState: { weight: number; attemptCount: number; wrongCount: number };
            }>;
          })
        : { words: [] };
      return database.words.find((item) => item.word === target);
    }, word);
    expect(stored?.weight).toBe(3);
    expect(stored?.attemptCount).toBe(0);
    expect(stored?.dictationState.weight).toBeCloseTo(6.6, 6);
    expect(stored?.dictationState.attemptCount).toBe(1);
    expect(stored?.dictationState.wrongCount).toBe(1);

    await page.goto('/#/words');
    await expect(page.getByRole('heading', { name: '词库', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^练习池/ }).click();
    await page.getByLabel(SEARCH_LABEL).fill(word);
    const practiceRow = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(practiceRow).toContainText('3.00');
    await expect(practiceRow).toContainText('0/0');

    await page.getByRole('button', { name: /^听写池/ }).click();
    const dictationRow = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(dictationRow).toContainText('6.60');
    await expect(dictationRow).toContainText('0/1');
  });

  test('只看勾选会排除被暂停分组里的词条', async ({ page }) => {
    const word = 'pausedgroupprobe';
    const meaning = '分组暂停过滤测试';
    const category = 'E2E-PAUSED-GROUP';
    const groupName = 'E2E-暂停组';

    await resetApp(page);
    await openWords(page);

    await page.getByRole('button', { name: '新建分组' }).click();
    const groupDialog = page.getByRole('dialog', { name: '新建分组' });
    await groupDialog.getByLabel('分组名称').fill(groupName);
    await groupDialog.getByRole('button', { name: '创建分组' }).click();
    await expect(groupDialog).toBeHidden();

    await createWordInGroup(page, { word, meaning, category, groupName });

    await page.getByLabel(SEARCH_LABEL).fill(word);
    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row).toBeVisible();
    await expect(page.getByLabel(`启用 ${word}（练习）`)).toBeChecked();

    const groupToggle = page.getByLabel(`启用分组 ${groupName}`);
    await groupToggle.uncheck();
    await expect(row).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '勾选的词被分组暂停' })).toBeVisible();

    await page.getByRole('button', { name: /只看勾选/ }).click();
    await expect(row).toBeVisible();
    await expect(page.getByLabel(`启用 ${word}（练习）`)).toBeChecked();
    await expect(row.locator('.tag--group')).toHaveClass(/is-off/);

    await page.getByRole('button', { name: /^听写池/ }).click();
    await page.getByRole('button', { name: /只看勾选/ }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '勾选的词被分组暂停' })).toBeVisible();

    await groupToggle.check();
    await expect(row).toBeVisible();
  });

  test('练习入口先选模式：无尽模式与复习临期', async ({ page }) => {
    await resetApp(page);

    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /练习/ })
      .click();
    await expect(page.getByRole('heading', { name: '今天怎么练？' })).toBeVisible();

    const endless = page.getByRole('button', { name: '进入无尽模式' });
    const due = page.getByRole('button', { name: /^开始复习 · \d+$/ });
    await expect(endless).toBeEnabled();
    await expect(due).toBeEnabled();

    await endless.click();
    await expect(page.locator('.study-mode')).toContainText('无尽模式');
    await expect(page.locator('.study-card')).toBeVisible();

    await page.getByRole('button', { name: '更换模式' }).click();
    await expect(page.getByRole('heading', { name: '今天怎么练？' })).toBeVisible();
    await expect(page.getByRole('button', { name: '返回当前练习' })).toBeVisible();

    await due.click();
    await expect(page.locator('.study-mode')).toContainText('复习临期');
    await expect(page.locator('.study-card')).toBeVisible();
  });

  test('答对后等反馈音效结束再朗读，切到下一题立即打断', async ({ page }) => {
    const word = 'speechtarget';
    const meaning = '朗读衔接测试';
    const category = 'E2E-SPEECH';

    await mockSpeech(page);
    await resetApp(page);
    await createWord(page, { word, meaning, category });
    await startStudy(page, category, meaning);

    const speechState = () =>
      page.evaluate(
        () =>
          (window as unknown as { __speech: { spoken: string[]; cancelled: number } }).__speech,
      );

    const answer = page.getByLabel(ANSWER_LABEL);
    await answer.fill(word);
    await answer.press('Enter');
    await expect(page.locator('.feedback__stamp').filter({ hasText: 'CORRECT' })).toBeVisible();

    await page.waitForTimeout(150);
    expect((await speechState()).spoken).toEqual([]);

    await expect
      .poll(async () => (await speechState()).spoken, { timeout: 4_000 })
      .toEqual([word]);

    const cancelledBefore = (await speechState()).cancelled;
    await page.getByRole('button', { name: '下一题' }).click();
    await expect(page.locator('.study-progress-text')).toHaveText('第 2 题');
    expect((await speechState()).cancelled).toBeGreaterThan(cancelledBefore);
  });

  test('自动下一题会等朗读结束再切换', async ({ page }) => {
    const word = 'speechautonext';
    const meaning = '自动下一题朗读测试';
    const category = 'E2E-SPEECH-NEXT';

    await mockSpeech(page);
    await resetApp(page);
    await createWord(page, { word, meaning, category });

    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    await page.locator('.toggle').filter({ hasText: '答对后自动下一题' }).click();
    await expect(page.getByRole('checkbox', { name: /答对后自动下一题/ })).toBeChecked();

    await startStudy(page, category, meaning);
    const answer = page.getByLabel(ANSWER_LABEL);
    await answer.fill(word);
    await answer.press('Enter');
    await expect(page.locator('.feedback__stamp').filter({ hasText: 'CORRECT' })).toBeVisible();

    await page.waitForTimeout(1_300);
    await expect(page.locator('.study-progress-text')).toHaveText('第 1 题');
    await expect(page.locator('.study-progress-text')).toHaveText('第 2 题', {
      timeout: 8_000,
    });
  });

  test('词库与独立词卡都可以手动朗读', async ({ page }) => {
    const word = 'speakmanual';
    const meaning = '手动朗读测试';
    const category = 'E2E-SPEAK';

    await mockSpeech(page);
    await resetApp(page);
    await createWord(page, { word, meaning, category });

    await page.getByRole('button', { name: `朗读 ${word}` }).click();
    const speechState = () =>
      page.evaluate(
        () =>
          (window as unknown as { __speech: { spoken: string[]; cancelled: number } }).__speech,
      );
    await expect.poll(async () => (await speechState()).spoken).toEqual([word]);

    const wordId = await page.evaluate((target) => {
      const raw = window.localStorage.getItem('typeword.webdb.v1');
      const database = raw
        ? (JSON.parse(raw) as { words: Array<{ id: string; word: string }> })
        : { words: [] };
      return database.words.find((item) => item.word === target)?.id ?? '';
    }, word);
    expect(wordId).not.toBe('');

    await page.goto(`/#/card/${wordId}`);
    await expect(page.getByRole('heading', { name: '词卡', exact: true })).toBeVisible();
    await page.getByRole('button', { name: `朗读 ${word}` }).click();
    await expect.poll(async () => (await speechState()).spoken).toEqual([word, word]);
  });

  test('切换模式会停止朗读并暂停自动下一题', async ({ page }) => {
    const word = 'chooserpauseword';
    const meaning = '切换模式朗读暂停测试';
    const category = 'E2E-CHOOSER';

    await mockSpeech(page);
    await resetApp(page);
    await createWord(page, { word, meaning, category });

    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    await page.locator('.toggle').filter({ hasText: '答对后自动下一题' }).click();
    await expect(page.getByRole('checkbox', { name: /答对后自动下一题/ })).toBeChecked();

    await startStudy(page, category, meaning);
    const answer = page.getByLabel(ANSWER_LABEL);
    await answer.fill(word);
    await answer.press('Enter');
    await expect(page.locator('.feedback__stamp').filter({ hasText: 'CORRECT' })).toBeVisible();
    await expect
      .poll(async () => (await readSpeechState(page)).spoken, { timeout: 5_000 })
      .toEqual([word]);

    const cancelledBefore = (await readSpeechState(page)).cancelled;
    await page.getByRole('button', { name: '更换模式' }).click();
    await expect(page.getByRole('heading', { name: '今天怎么练？' })).toBeVisible();
    await expect(page.getByRole('button', { name: '返回当前练习' })).toBeVisible();
    expect((await readSpeechState(page)).cancelled).toBeGreaterThan(cancelledBefore);

    await page.waitForTimeout(2_000);
    await expect(page.getByRole('heading', { name: '今天怎么练？' })).toBeVisible();
    await expect(page.getByRole('button', { name: '返回当前练习' })).toBeVisible();

    await page.getByRole('button', { name: '返回当前练习' }).click();
    await expect(page.locator('.study-progress-text')).toHaveText('第 1 题');
    await expect(page.locator('.study-progress-text')).toHaveText('第 2 题', {
      timeout: 10_000,
    });
  });

  test('没有英文语音时隐藏朗读入口并禁用听写模式', async ({ page }) => {
    const word = 'novoiceword';
    const meaning = '无英文语音测试';
    const category = 'E2E-NOVOICE';

    await mockNoEnglishVoice(page);
    await resetApp(page);
    await createWord(page, { word, meaning, category });

    await expect(page.getByRole('button', { name: `朗读 ${word}` })).toHaveCount(0);

    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    const masterToggle = page.getByRole('checkbox', { name: /单词朗读/ });
    await expect(masterToggle).toBeDisabled();
    await expect(page.getByText(/当前没有可用英文语音/)).toBeVisible();
    await expect(page.getByRole('button', { name: '试听' })).toHaveCount(0);
    await expect(page.getByRole('slider', { name: '朗读语速' })).toBeDisabled();
    await expect(page.getByRole('slider', { name: '朗读音量' })).toBeDisabled();
    await expect(page.getByRole('combobox', { name: '语音口音' })).toBeDisabled();

    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /练习/ })
      .click();
    await expect(page.getByRole('heading', { name: '今天怎么练？' })).toBeVisible();
    await expect(page.getByRole('button', { name: '需要可用英文语音' })).toBeDisabled();
    await expect(page.getByText(/听写模式需要系统英文语音/)).toBeVisible();
  });

  test('听写模式隐藏释义、自动播放并支持快捷键重播', async ({ page }) => {
    const word = 'dictationprobe';
    const meaning = '听写模式测试释义';
    const category = 'E2E-DICTATION';

    await mockSpeech(page);
    await resetApp(page);
    await createWord(page, { word, meaning, category });

    await page
      .getByRole('navigation', { name: '主导航' })
      .getByRole('link', { name: /练习/ })
      .click();
    await expect(page.getByRole('heading', { name: '今天怎么练？' })).toBeVisible();
    const dictation = page.getByRole('button', { name: '进入听写模式' });
    await expect(dictation).toBeEnabled();
    await dictation.click();

    await expect(page.locator('.study-mode')).toContainText('听写模式');
    await expect(page.locator('.dictation-block h1')).toHaveText('听读音，写出单词');
    await expect(page.locator('.study-card').getByText(meaning)).toHaveCount(0);
    await expect(page.locator('.dictation-meta')).toContainText('读音已自动播放');
    await expect(page.locator('.shortcut-panel')).toContainText('重播读音');

    await expect
      .poll(async () => (await readSpeechState(page)).spoken.length, { timeout: 5_000 })
      .toBeGreaterThan(0);
    const firstWord = (await readSpeechState(page)).spoken[0];

    await page.getByRole('button', { name: '重播读音' }).click();
    await expect
      .poll(async () => (await readSpeechState(page)).spoken)
      .toEqual([firstWord, firstWord]);

    await page.keyboard.press('Control+Space');
    await expect
      .poll(async () => (await readSpeechState(page)).spoken)
      .toEqual([firstWord, firstWord, firstWord]);

    await page.locator('.dictation-block h1').click();
    await page.keyboard.press('s');
    await expect
      .poll(async () => (await readSpeechState(page)).spoken)
      .toEqual([firstWord, firstWord, firstWord, firstWord]);
  });

  test('学习模式翻卡自动朗读并可随翻页切换', async ({ page }) => {
    await mockSpeech(page);
    await resetApp(page);
    await openLearn(page);

    const wordHeading = page.locator('.reader-word h1');
    await expect(wordHeading).toBeVisible();
    const first = (await wordHeading.textContent()) ?? '';
    expect(first).not.toBe('');

    await page.locator('.toggle').filter({ hasText: '翻卡自动朗读' }).click();
    await expect(page.getByRole('checkbox', { name: /翻卡自动朗读/ })).toBeChecked();
    await expect
      .poll(async () => (await readSpeechState(page)).spoken, { timeout: 5_000 })
      .toEqual([first]);

    await page.getByRole('button', { name: '下一张词卡' }).click();
    await expect(wordHeading).not.toHaveText(first);
    const second = (await wordHeading.textContent()) ?? '';
    expect(second).not.toBe('');
    await expect
      .poll(async () => (await readSpeechState(page)).spoken, { timeout: 5_000 })
      .toEqual([first, second]);
  });

  test('学习模式只听模式隐藏细节、自动朗读并可展开', async ({ page }) => {
    await mockSpeech(page);
    await resetApp(page);
    await openLearn(page);

    const wordHeading = page.locator('.reader-word h1');
    await expect(wordHeading).toBeVisible();
    const word = (await wordHeading.textContent()) ?? '';
    expect(word).not.toBe('');

    await page.locator('.toggle').filter({ hasText: '只听模式' }).click();
    await expect(page.getByRole('checkbox', { name: /只听模式/ })).toBeChecked();

    const card = page.locator('.reader-page');
    await expect(card).toHaveClass(/reader-page--listen/);
    await expect(card.locator('.reader-meanings')).toBeHidden();
    await expect(card.locator('.reader-stats')).toBeHidden();
    await expect(card.locator('.reader-marks')).toBeHidden();
    await expect(page.locator('.reader-listen')).toContainText('已隐藏');
    await expect
      .poll(async () => (await readSpeechState(page)).spoken, { timeout: 5_000 })
      .toEqual([word]);

    await page.getByRole('button', { name: '显示完整词卡' }).click();
    await expect(card.locator('.reader-meanings')).toBeVisible();
    await expect(card.locator('.reader-stats')).toBeVisible();
    await expect(page.getByRole('button', { name: '收起完整词卡' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: '学习模式' })).toBeVisible();
    await expect(page.locator('.reader-page')).toHaveClass(/reader-page--listen/);
    await expect(page.locator('.reader-listen')).toBeVisible();
  });

  test('首页贴条可朗读，打开词卡后停止朗读', async ({ page }) => {
    await mockSpeech(page);
    await resetApp(page);

    const speakButton = page.locator('.slip-actions').getByRole('button', { name: /^朗读 / });
    await expect(speakButton).toBeVisible();
    const label = await speakButton.getAttribute('aria-label');
    const word = label?.replace(/^朗读 /, '') ?? '';
    expect(word).not.toBe('');

    await speakButton.click();
    await expect
      .poll(async () => (await readSpeechState(page)).spoken, { timeout: 5_000 })
      .toEqual([word]);

    const cancelledBefore = (await readSpeechState(page)).cancelled;
    await page.getByRole('button', { name: /^打开 .+ 的词卡$/ }).click();
    await expect(page).toHaveURL(/#\/card\//);
    await expect
      .poll(async () => (await readSpeechState(page)).cancelled, { timeout: 5_000 })
      .toBeGreaterThan(cancelledBefore);
  });

  test('窄屏下操作列收为图标且按钮文字不换行', async ({ page }) => {
    const word = 'narrowlayoutprobe';
    const meaning = '窄屏布局测试';
    const category = 'E2E-NARROW';

    await page.setViewportSize({ width: 960, height: 900 });
    await resetApp(page);
    await createWord(page, { word, meaning, category });

    const addButton = page.getByRole('button', { name: '新增单词' }).first();
    await expect(addButton).toBeVisible();
    const whiteSpace = await addButton.evaluate((element) => getComputedStyle(element).whiteSpace);
    expect(whiteSpace).toBe('nowrap');

    const row = page.locator('.word-table tbody tr').filter({ hasText: word });
    await expect(row.locator('.row-action__label').first()).toBeHidden();
    const editButton = page.getByRole('button', { name: `编辑 ${word}` });
    await expect(editButton).toBeVisible();
    const box = await editButton.boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(30);
  });

  test('设置页可生成备份，删除词条后恢复备份能还原', async ({ page }) => {
    const word = 'backuprestoreword';
    const meaning = '备份恢复测试';
    const category = 'E2E-BACKUP';

    await resetApp(page);
    await createWord(page, { word, meaning, category });

    await page.goto('/#/settings');
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();
    await page.getByRole('button', { name: '立即备份' }).click();

    const backupItem = page.locator('.backup-list li').first();
    await expect(backupItem).toContainText('手动');
    await expect(backupItem).toContainText(/typeword-backup-\d{4}-\d{2}-\d{2}-\d+\.sqlite3/);

    await page.goto('/#/words');
    await page.getByLabel(SEARCH_LABEL).fill(word);
    await page.getByRole('button', { name: `删除 ${word}` }).click();
    const deleteDialog = page.getByRole('dialog', { name: '删除这个单词？' });
    await deleteDialog.getByRole('button', { name: '确认删除' }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(page.getByText('没有匹配的词条')).toBeVisible();

    await page.goto('/#/settings');
    await page.locator('.backup-list li').first().getByRole('button', { name: '恢复' }).click();
    const restoreDialog = page.getByRole('dialog', { name: '恢复这份备份？' });
    await restoreDialog.getByRole('button', { name: '确认恢复' }).click();
    await expect(page.getByRole('heading', { name: '设置' })).toBeVisible({ timeout: 15_000 });

    await page.goto('/#/words');
    await page.getByLabel(SEARCH_LABEL).fill(word);
    await expect(page.locator('.word-table tbody tr').filter({ hasText: word })).toBeVisible();
  });

  test('环境音可从侧边栏选择、调音量并在刷新后保留', async ({ page }) => {
    await mockAmbientPlayback(page);
    await resetApp(page);

    const readSettings = async (): Promise<Record<string, string>> =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('typeword.webdb.v1');
        return raw
          ? ((JSON.parse(raw) as { settings?: Record<string, string> }).settings ?? {})
          : {};
      });

    await page.getByRole('button', { name: '环境音', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '环境音' });
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: '环境音：咖啡馆' }).click();
    await expect(dialog.getByRole('button', { name: '环境音：咖啡馆' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect
      .poll(async () =>
        page.evaluate(() =>
          (window as unknown as { __ambient: { started: string[] } }).__ambient.started.some(
            (src) => src.endsWith('/ambient/coffee-shop.ogg'),
          ),
        ),
      )
      .toBe(true);
    await expect.poll(async () => (await readSettings()).ambient_sound).toBe('coffee-shop');

    const slider = dialog.getByLabel('环境音音量');
    await slider.focus();
    await slider.press('ArrowLeft');
    await expect.poll(async () => (await readSettings()).ambient_volume).toBe('0.3');

    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await expect(page.getByRole('button', { name: /环境音 · 咖啡馆/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: '今日书桌' })).toBeVisible();
    await page.getByRole('button', { name: /环境音 · 咖啡馆/ }).click();
    const reopened = page.getByRole('dialog', { name: '环境音' });
    await expect(reopened.getByRole('button', { name: '环境音：咖啡馆' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await reopened.getByRole('button', { name: '关闭环境音' }).click();
    await expect
      .poll(async () => (await readSettings()).ambient_sound)
      .toBe('off');
    await expect
      .poll(async () =>
        page.evaluate(
          () => (window as unknown as { __ambient: { paused: number } }).__ambient.paused,
        ),
      )
      .toBeGreaterThan(0);
  });
});
