import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStatisticsStore } from '../statistics/statisticsStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icons';
import { LoadingState } from '../../components/LoadingState';
import { useDailyRefresh } from '../../hooks/useDailyRefresh';
import { formatPercent } from '../../utils/date';
import { useWordStore } from '../words/wordStore';
import { DASHBOARD_QUOTES, nextQuoteIndex, randomQuoteIndex } from './dashboardQuotes';
import { WordSlip } from './WordSlip';

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

export function DashboardPage() {
  const navigate = useNavigate();
  const statistics = useStatisticsStore((state) => state.statistics);
  const loading = useStatisticsStore((state) => state.loading);
  const refresh = useStatisticsStore((state) => state.refresh);
  const words = useWordStore((state) => state.words);
  const loadWords = useWordStore((state) => state.load);
  const dailyGoal = useSettingsStore((state) => state.settings.dailyGoal);
  const [quoteIndex, setQuoteIndex] = useState(randomQuoteIndex);
  const advanceQuote = useCallback(() => {
    setQuoteIndex((previous) => nextQuoteIndex(previous));
  }, []);
  const refreshDashboard = useCallback(() => {
    void refresh();
    void loadWords();
  }, [refresh, loadWords]);

  useDailyRefresh(refreshDashboard);

  const dateLabel = dateFormatter.format(new Date());

  if (!statistics && loading) return <LoadingState label="正在翻到今日这一页…" />;
  if (!statistics) {
    return (
      <EmptyState
        icon="book"
        title="还没有读到数据"
        description="词库或数据库暂时不可用，请稍后重试。"
      >
        <Button onClick={() => void refresh()}>重新加载</Button>
      </EmptyState>
    );
  }

  const { today, totalWords, mostWrong, studyStreakDays } = statistics;
  const goalPercent = Math.min(100, Math.round((today.attempts / Math.max(1, dailyGoal)) * 100));
  const empty = totalWords === 0;
  const quote = DASHBOARD_QUOTES[quoteIndex];

  return (
    <div className="dashboard page-enter">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {dateLabel} · DAILY DESK
          </p>
          <h1>今日书桌</h1>
          <p className="page-head__lead">看中文，敲出英文。让遗忘曲线替你安排下一张卡片。</p>
        </div>
        <div className="page-head__meta">
          <span className="meta-chip">
            <Icon name="flame" size={14} />
            连续 {studyStreakDays} 天
          </span>
          <span className="meta-chip">
            <Icon name="clock" size={14} />
            待复习 {today.dueCount}
          </span>
        </div>
      </header>

      {empty ? (
        <section className="panel panel--paper">
          <EmptyState
            icon="book"
            title="词库还是空的"
            description="先在词库中添加单词，或到设置中恢复初始词库。初始词库位于 public/seed_words.json。"
          >
            <Button variant="primary" onClick={() => navigate('/words')} icon={<Icon name="plus" />}>
              添加单词
            </Button>
            <Button onClick={() => navigate('/settings')} icon={<Icon name="refresh" />}>
              恢复初始词库
            </Button>
          </EmptyState>
        </section>
      ) : (
        <section className="hero">
          <div className="hero__copy">
            <p className="eyebrow">TYPEWRITER DRILL · 汉译英</p>
            <h2 className="hero__title" key={quoteIndex}>
              {quote.lines.map((line) => (
                <span key={line} className="hero__title-line">
                  {line}
                </span>
              ))}
            </h2>
            <p className="hero__lead">
              每一道题都由权重与记忆保持率共同抽取。答错会更快回来，答对会慢慢退场。
            </p>
            <div className="hero__actions">
              <Button
                variant="primary"
                size="lg"
                onClick={() => navigate('/study')}
                icon={<Icon name="enter" size={18} />}
              >
                开始练习
              </Button>
              <Button
                size="lg"
                onClick={() => navigate('/learn')}
                icon={<Icon name="cards" size={18} />}
              >
                翻卡学习
              </Button>
              <Button
                size="lg"
                onClick={() => navigate('/study?mode=due')}
                disabled={today.dueCount === 0}
                icon={<Icon name="clock" size={18} />}
              >
                复习到期 {today.dueCount > 0 ? `· ${today.dueCount}` : ''}
              </Button>
            </div>
            <p className="hero__hint">
              <kbd>Enter</kbd> 提交 · <kbd>Esc</kbd> 跳过 · <kbd>H</kbd> 再提示一个字母
            </p>
          </div>

          <WordSlip
            words={words}
            onRotate={advanceQuote}
            onOpenWord={(id) => navigate(`/card/${encodeURIComponent(id)}`)}
          />
        </section>
      )}

      <section className="stat-strip" aria-label="今日数据">
        <article className="stat-card">
          <span className="stat-card__label">今日练习</span>
          <strong className="stat-card__value">{today.attempts}</strong>
          <span className="stat-card__unit">题</span>
          <span className="stat-card__note">目标 {dailyGoal} 题</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">今日正确率</span>
          <strong className="stat-card__value">{formatPercent(today.accuracy)}</strong>
          <span className="stat-card__unit">{today.correct} 对</span>
          <span className="stat-card__note">{today.wrong} 道待巩固</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">待复习</span>
          <strong className="stat-card__value">{today.dueCount}</strong>
          <span className="stat-card__unit">词</span>
          <span className="stat-card__note">共 {totalWords} 个词条</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">当前连击</span>
          <strong className="stat-card__value">{today.streak}</strong>
          <span className="stat-card__unit">连对</span>
          <span className="stat-card__note">跨题目累计</span>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel">
          <header className="panel__head">
            <div>
              <p className="eyebrow">TODAY · GOAL</p>
              <h2>今日进度</h2>
            </div>
            <span className="panel__count">
              {today.attempts} / {dailyGoal}
            </span>
          </header>
          <div className="goal-bar" role="progressbar" aria-valuenow={goalPercent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${goalPercent}%` }} />
          </div>
          <div className="goal-meta">
            <span>{goalPercent >= 100 ? '今日目标已完成，纸张可以收起来了。' : `再做 ${Math.max(0, dailyGoal - today.attempts)} 题完成今日目标。`}</span>
            <span>{formatPercent(goalPercent)}</span>
          </div>
          <div className="today-split">
            <div>
              <span>答对</span>
              <strong>{today.correct}</strong>
            </div>
            <div>
              <span>答错</span>
              <strong>{today.wrong}</strong>
            </div>
            <div>
              <span>涉及词条</span>
              <strong>{today.distinctWords}</strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="panel__head">
            <div>
              <p className="eyebrow">NEEDS INK</p>
              <h2>需要多写几遍</h2>
            </div>
            <button className="text-link" onClick={() => navigate('/stats')}>
              全部统计 <Icon name="arrow-left" size={14} className="icon-flip" />
            </button>
          </header>
          {mostWrong.length === 0 ? (
            <p className="panel__empty">
              还没有错题记录。开始练习后，这里会列出最需要巩固的词条。
            </p>
          ) : (
            <ul className="wrong-list">
              {mostWrong.slice(0, 4).map((item, index) => (
                <li key={item.wordId}>
                  <span className="wrong-list__rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="wrong-list__word">{item.word}</span>
                  <span className="wrong-list__count">{item.wrongCount} 次答错</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
