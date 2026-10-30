import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icons';
import { LoadingState } from '../../components/LoadingState';
import { useDailyRefresh } from '../../hooks/useDailyRefresh';
import { formatPercent } from '../../utils/date';
import { useStatisticsStore } from './statisticsStore';

const RETENTION_WIDTH = 640;
const RETENTION_HEIGHT = 200;
const RETENTION_PAD_X = 26;
const RETENTION_PAD_Y = 24;

export function StatisticsPage() {
  const navigate = useNavigate();
  const statistics = useStatisticsStore((state) => state.statistics);
  const loading = useStatisticsStore((state) => state.loading);
  const error = useStatisticsStore((state) => state.error);
  const refresh = useStatisticsStore((state) => state.refresh);

  useDailyRefresh(refresh);

  if (!statistics && loading) return <LoadingState label="正在核对账本…" />;
  if (!statistics) {
    return (
      <EmptyState
        icon="chart"
        title={error ? '统计加载失败' : '暂时没有统计'}
        description={error ?? '开始练习后，这里会出现学习记录。'}
      >
        <Button onClick={() => void refresh()} icon={<Icon name="refresh" />}>
          重新加载
        </Button>
      </EmptyState>
    );
  }

  const { today, last7Days, mostWrong, dueForecast, retentionCurve } = statistics;
  const maxAttempts = Math.max(1, ...last7Days.map((day) => day.attempts));
  const goalPercent = Math.min(100, Math.round((today.attempts / Math.max(1, today.goal)) * 100));
  const forecastMax = Math.max(1, ...dueForecast.map((day) => day.dueCount));
  const avgRetention =
    retentionCurve.length > 0
      ? Math.round(
          retentionCurve.reduce((sum, point) => sum + point.retention, 0) /
            retentionCurve.length,
        )
      : 0;
  const retentionPoints = retentionCurve.map((point, index) => {
    const x =
      retentionCurve.length === 1
        ? RETENTION_WIDTH / 2
        : RETENTION_PAD_X +
          (index / (retentionCurve.length - 1)) * (RETENTION_WIDTH - RETENTION_PAD_X * 2);
    const y =
      RETENTION_HEIGHT -
      RETENTION_PAD_Y -
      (Math.min(100, Math.max(0, point.retention)) / 100) *
        (RETENTION_HEIGHT - RETENTION_PAD_Y * 2);
    return { x, y, point };
  });
  const retentionLine = retentionPoints
    .map((entry, index) => `${index === 0 ? 'M' : 'L'}${entry.x.toFixed(1)},${entry.y.toFixed(1)}`)
    .join(' ');
  const retentionArea =
    retentionPoints.length > 1
      ? `${retentionLine} L${retentionPoints[retentionPoints.length - 1].x.toFixed(1)},${
          RETENTION_HEIGHT - RETENTION_PAD_Y
        } L${retentionPoints[0].x.toFixed(1)},${RETENTION_HEIGHT - RETENTION_PAD_Y} Z`
      : '';

  return (
    <div className="stats-page page-enter">
      <header className="page-head">
        <div>
          <p className="eyebrow">LEDGER · 学习账本</p>
          <h1>统计</h1>
          <p className="page-head__lead">记录你与遗忘曲线之间的往来。只统计真实提交的答案。</p>
        </div>
        <div className="page-head__meta">
          <span className="meta-chip">
            <Icon name="flame" size={14} />
            连续学习 {statistics.studyStreakDays} 天
          </span>
        </div>
      </header>

      <section className="stat-strip stat-strip--six">
        <article className="stat-card">
          <span className="stat-card__label">总词条</span>
          <strong className="stat-card__value">{statistics.totalWords}</strong>
          <span className="stat-card__unit">词</span>
          <span className="stat-card__note">已掌握 {statistics.masteredCount}</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">累计答题</span>
          <strong className="stat-card__value">{statistics.totalReviews}</strong>
          <span className="stat-card__unit">次</span>
          <span className="stat-card__note">不含跳过</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">累计正确率</span>
          <strong className="stat-card__value">{formatPercent(statistics.accuracy)}</strong>
          <span className="stat-card__unit">{statistics.totalCorrect} 对</span>
          <span className="stat-card__note">全部历史</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">今日答题</span>
          <strong className="stat-card__value">{today.attempts}</strong>
          <span className="stat-card__unit">题</span>
          <span className="stat-card__note">正确率 {formatPercent(today.accuracy)}</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">待复习</span>
          <strong className="stat-card__value">{statistics.dueCount}</strong>
          <span className="stat-card__unit">词</span>
          <span className="stat-card__note">已到复习时间</span>
        </article>
        <article className="stat-card">
          <span className="stat-card__label">连续学习</span>
          <strong className="stat-card__value">{statistics.studyStreakDays}</strong>
          <span className="stat-card__unit">天</span>
          <span className="stat-card__note">今日 {today.attempts > 0 ? '已打卡' : '未打卡'}</span>
        </article>
      </section>

      <div className="stats-grid">
        <section className="panel chart-panel">
          <header className="panel__head">
            <div>
              <p className="eyebrow">LAST 7 DAYS</p>
              <h2>最近七天练习量</h2>
            </div>
            <div className="chart-legend">
              <span className="chart-legend__correct">答对</span>
              <span className="chart-legend__wrong">答错</span>
            </div>
          </header>
          <div className="bar-chart" role="img" aria-label="最近七天答题量柱状图">
            {last7Days.map((day) => (
              <div className="bar-chart__column" key={day.dayKey}>
                <span className="bar-chart__total">{day.attempts || ''}</span>
                <div className="bar-chart__rail">
                  <div
                    className="bar-chart__bar"
                    style={{ height: `${Math.max(day.attempts > 0 ? 8 : 2, (day.attempts / maxAttempts) * 100)}%` }}
                  >
                    <span
                      className="bar-chart__correct"
                      style={{
                        height: `${day.attempts > 0 ? (day.correct / day.attempts) * 100 : 0}%`,
                      }}
                    />
                    <span
                      className="bar-chart__wrong"
                      style={{
                        height: `${day.attempts > 0 ? (day.wrong / day.attempts) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <span className="bar-chart__label">{day.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel goal-detail">
          <header className="panel__head">
            <div>
              <p className="eyebrow">TODAY</p>
              <h2>今日目标</h2>
            </div>
            <Icon name="target" size={20} />
          </header>
          <div className="goal-ring" style={{ ['--progress' as string]: `${goalPercent}%` }}>
            <div className="goal-ring__inner">
              <strong>{goalPercent}%</strong>
              <span>
                {today.attempts} / {today.goal}
              </span>
            </div>
          </div>
          <div className="goal-detail__rows">
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
            <div>
              <span>当前连击</span>
              <strong>{today.streak}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="stats-grid stats-grid--analysis">
        <section className="panel chart-panel">
          <header className="panel__head">
            <div>
              <p className="eyebrow">NEXT 7 DAYS</p>
              <h2>未来七天复习预测</h2>
            </div>
            <span className="panel__count">按当前到期计划</span>
          </header>
          <div className="forecast-chart" role="img" aria-label="未来七天到期单词预测柱状图">
            {dueForecast.map((day) => (
              <div className="forecast-chart__column" key={day.dayKey}>
                <span className="forecast-chart__count">{day.dueCount || ''}</span>
                <div className="forecast-chart__rail">
                  <div
                    className="forecast-chart__bar"
                    style={{
                      height: `${Math.max(day.dueCount > 0 ? 9 : 2, (day.dueCount / forecastMax) * 100)}%`,
                    }}
                    title={`${day.label}：${day.dueCount} 个到期`}
                  />
                </div>
                <span className="forecast-chart__label">{day.label}</span>
              </div>
            ))}
          </div>
          <p className="chart-note">
            今天一列包含已经到期与今天到期的词条。柱子越高，越值得提前留出复习时间。
          </p>
        </section>

        <section className="panel chart-panel">
          <header className="panel__head">
            <div>
              <p className="eyebrow">FORGETTING CURVE</p>
              <h2>记忆保持率预测</h2>
            </div>
            <span className="panel__count">未来平均 {avgRetention}%</span>
          </header>
          {retentionCurve.length === 0 ? (
            <p className="panel__empty">还没有复习过的词条，完成几次练习后就能看到保持率曲线。</p>
          ) : (
            <>
              <svg
                className="retention-chart"
                viewBox={`0 0 ${RETENTION_WIDTH} ${RETENTION_HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="未来七天记忆保持率曲线"
              >
                {[25, 50, 75, 100].map((level) => {
                  const y =
                    RETENTION_HEIGHT -
                    RETENTION_PAD_Y -
                    (level / 100) * (RETENTION_HEIGHT - RETENTION_PAD_Y * 2);
                  return (
                    <line
                      key={level}
                      x1={RETENTION_PAD_X}
                      x2={RETENTION_WIDTH - RETENTION_PAD_X}
                      y1={y}
                      y2={y}
                      className="retention-chart__grid"
                    />
                  );
                })}
                {retentionArea ? (
                  <path d={retentionArea} className="retention-chart__area" />
                ) : null}
                <path d={retentionLine} className="retention-chart__line" />
                {retentionPoints.map((entry) => (
                  <circle
                    key={entry.point.dayKey}
                    cx={entry.x}
                    cy={entry.y}
                    r={3.6}
                    className="retention-chart__dot"
                  />
                ))}
              </svg>
              <div className="retention-labels">
                {retentionCurve.map((point) => (
                  <span key={point.dayKey} className="retention-labels__item">
                    <em>{point.label}</em>
                    <strong>{point.retention}%</strong>
                  </span>
                ))}
              </div>
              <p className="chart-note">
                按当前稳定度估算的回忆概率；答对会延长稳定度，曲线因此变得更平缓。
              </p>
            </>
          )}
        </section>
      </div>

      <section className="panel">
        <header className="panel__head">
          <div>
            <p className="eyebrow">TROUBLE SPOTS</p>
            <h2>答错最多的单词</h2>
          </div>
          <div className="panel__actions">
            <span className="panel__count">TOP {Math.min(5, mostWrong.length)}</span>
            {mostWrong.length > 0 ? (
              <Button
                size="sm"
                onClick={() => navigate('/study?mode=wrong')}
                icon={<Icon name="refresh" size={14} />}
              >
                只练这些错题
              </Button>
            ) : null}
          </div>
        </header>
        {mostWrong.length === 0 ? (
          <p className="panel__empty">还没有答错记录。保持下去，账本会一直干净。</p>
        ) : (
          <ol className="wrong-table">
            {mostWrong.map((item, index) => (
              <li key={item.wordId}>
                <span className="wrong-table__rank">{String(index + 1).padStart(2, '0')}</span>
                <span className="wrong-table__word">{item.word}</span>
                <span className="wrong-table__bar">
                  <span
                    style={{
                      width: `${(item.wrongCount / Math.max(...mostWrong.map((entry) => entry.wrongCount))) * 100}%`,
                    }}
                  />
                </span>
                <span className="wrong-table__count">{item.wrongCount} 次</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
