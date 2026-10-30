import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icons';
import { LoadingState } from '../../components/LoadingState';
import { Toggle } from '../../components/Toggle';
import {
  filterStudyWords,
  groupMemberIds,
  groupStudySelection,
  stepCardIndex,
  type CardDirection,
} from '../../domain/cardDeck';
import { useSpeechAvailability } from '../../hooks/useSpeechAvailability';
import { audioService } from '../../services/audioService';
import { repository } from '../../services/repository';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUiStore } from '../../stores/uiStore';
import { useWordStore } from '../words/wordStore';
import { StudyScopeChip } from './StudyScopeChip';
import { StudyScopeModal } from './StudyScopeModal';
import { WordReaderCard } from './WordReaderCard';

const LEARN_POSITION_KEY = 'learn_last_word_id';

interface ScopeUndoState {
  label: string;
  scopeIds: string[];
  previousSelectedIds: string[];
}

export function LearnPage() {
  const navigate = useNavigate();
  const words = useWordStore((state) => state.words);
  const groups = useWordStore((state) => state.groups);
  const loading = useWordStore((state) => state.loading);
  const load = useWordStore((state) => state.load);
  const setWordsStudyEnabled = useWordStore((state) => state.setWordsStudyEnabled);
  const applyStudySelection = useWordStore((state) => state.applyStudySelection);
  const pushToast = useUiStore((state) => state.pushToast);
  const learnAutoSpeak = useSettingsStore((state) => state.settings.learnAutoSpeak);
  const learnListenOnly = useSettingsStore((state) => state.settings.learnListenOnly);
  const pronunciationEnabled = useSettingsStore(
    (state) => state.settings.pronunciationEnabled,
  );
  const updateSettings = useSettingsStore((state) => state.update);
  const speechAvailable = useSpeechAvailability();
  const autoSpeakReady = pronunciationEnabled && speechAvailable;

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [positionReady, setPositionReady] = useState(false);
  const savedCardIdRef = useRef<string | null>(null);
  const [direction, setDirection] = useState<CardDirection>('next');
  const [flipKey, setFlipKey] = useState(0);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeBusy, setScopeBusy] = useState(false);
  const [scopeUndo, setScopeUndo] = useState<ScopeUndoState | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    repository
      .getSettings()
      .then((record) => {
        if (!cancelled) savedCardIdRef.current = record[LEARN_POSITION_KEY] ?? null;
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPositionReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const deck = useMemo(() => filterStudyWords(words), [words]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const studyById = useMemo(
    () => new Map(words.map((word) => [word.id, word.studyEnabled])),
    [words],
  );
  const unassignedTotal = words.filter((word) => word.groupId === null).length;

  useEffect(() => {
    if (!positionReady) return;
    if (deck.length === 0) {
      if (currentId !== null) setCurrentId(null);
      return;
    }
    if (!currentId || !deck.some((word) => word.id === currentId)) {
      const savedId = savedCardIdRef.current;
      savedCardIdRef.current = null;
      setCurrentId(
        savedId && deck.some((word) => word.id === savedId) ? savedId : deck[0].id,
      );
    }
  }, [deck, currentId, positionReady]);

  useEffect(() => {
    if (!positionReady || !currentId) return;
    void repository
      .setSetting(LEARN_POSITION_KEY, currentId, Date.now())
      .catch(() => {});
  }, [currentId, positionReady]);

  const activeIndex = deck.findIndex((word) => word.id === currentId);
  const currentWord = positionReady ? (activeIndex >= 0 ? deck[activeIndex] : deck[0]) : null;

  const navigateCard = useCallback(
    (nextDirection: CardDirection) => {
      if (deck.length === 0) return;
      const from = deck.findIndex((word) => word.id === currentId);
      const nextIndex = stepCardIndex(from, deck.length, nextDirection);
      if (nextIndex < 0) return;
      setDirection(nextDirection);
      setFlipKey((key) => key + 1);
      setCurrentId(deck[nextIndex].id);
      audioService.playPageTurn(nextDirection === 'previous');
    },
    [deck, currentId],
  );

  useEffect(() => {
    if (scopeOpen) return;

    const handleKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      if (target && ['BUTTON', 'A'].includes(target.tagName) && event.key === ' ') {
        return;
      }

      if (
        event.key === 'ArrowRight' ||
        event.key === 'ArrowDown' ||
        event.key === 'PageDown' ||
        event.key === ' '
      ) {
        event.preventDefault();
        navigateCard('next');
      } else if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowUp' ||
        event.key === 'PageUp'
      ) {
        event.preventDefault();
        navigateCard('previous');
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [navigateCard, scopeOpen]);

  const handleToggleGroup = async (groupId: string | null, label: string) => {
    const ids = groupMemberIds(words, groupId);
    if (ids.length === 0) return;
    const selected = ids.filter((id) => studyById.get(id)).length;
    await applyScope(ids, selected < ids.length, label);
  };

  const handleToggleAll = async () => {
    if (words.length === 0) return;
    await applyScope(
      words.map((word) => word.id),
      deck.length < words.length,
      '全部词条',
    );
  };

  const applyScope = async (scopeIds: string[], enable: boolean, label: string) => {
    if (scopeBusy) return;
    const idSet = new Set(scopeIds);
    const previousSelectedIds = words
      .filter((word) => idSet.has(word.id) && word.studyEnabled)
      .map((word) => word.id);
    const changed = enable
      ? previousSelectedIds.length < scopeIds.length
      : previousSelectedIds.length > 0;

    setScopeBusy(true);
    setScopeUndo(null);
    try {
      await setWordsStudyEnabled(scopeIds, enable);
      if (changed) setScopeUndo({ label, scopeIds, previousSelectedIds });
    } catch (cause) {
      pushToast(cause instanceof Error ? cause.message : '学习范围保存失败', 'error');
    } finally {
      setScopeBusy(false);
    }
  };

  useEffect(() => {
    if (!scopeUndo) return;
    const timer = window.setTimeout(() => setScopeUndo(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [scopeUndo]);

  const handleUndoScope = async () => {
    if (!scopeUndo || scopeBusy) return;
    const previous = new Set(scopeUndo.previousSelectedIds);
    const disableIds = scopeUndo.scopeIds.filter((id) => !previous.has(id));
    setScopeBusy(true);
    try {
      await applyStudySelection(scopeUndo.previousSelectedIds, disableIds);
      setScopeUndo(null);
      pushToast('已撤销学习范围改动', 'success');
    } catch (cause) {
      pushToast(cause instanceof Error ? cause.message : '撤销失败', 'error');
    } finally {
      setScopeBusy(false);
    }
  };

  const currentGroup = currentWord?.groupId ? groupById.get(currentWord.groupId) : undefined;

  const aside = (
    <aside className="learn-aside">
      <section className="panel reader-scope-panel">
        <div className="reader-scope__head">
          <div>
            <p className="eyebrow">STUDY SCOPE</p>
            <h2>学习范围</h2>
          </div>
          <span className="panel__count">
            {deck.length} / {words.length}
          </span>
        </div>
        <div className="reader-scope__bar" role="progressbar" aria-valuenow={deck.length} aria-valuemin={0} aria-valuemax={Math.max(1, words.length)}>
          <span style={{ width: `${words.length > 0 ? (deck.length / words.length) * 100 : 0}%` }} />
        </div>
        <Button
          size="sm"
          onClick={() => setScopeOpen(true)}
          disabled={words.length === 0 || scopeBusy}
          icon={<Icon name="cards" size={14} />}
        >
          选择词条或分组
        </Button>
        <div className="reader-group-list">
          <StudyScopeChip
            label="全部词条"
            selected={deck.length}
            total={words.length}
            onToggle={() => void handleToggleAll()}
            disabled={scopeBusy}
          />
          {groups.map((group) => {
            const selection = groupStudySelection(words, group.id);
            return (
              <StudyScopeChip
                key={group.id}
                label={group.name}
                selected={selection.selected}
                total={selection.total}
                onToggle={() => void handleToggleGroup(group.id, group.name)}
                disabled={scopeBusy}
              />
            );
          })}
          {groups.length > 0 && unassignedTotal > 0 ? (
            <StudyScopeChip
              label="未分组"
              selected={words.filter((word) => word.groupId === null && word.studyEnabled).length}
              total={unassignedTotal}
              onToggle={() => void handleToggleGroup(null, '未分组')}
              disabled={scopeBusy}
            />
          ) : null}
        </div>
        {scopeBusy ? (
          <p className="scope-undo scope-undo--busy" role="status">
            正在保存学习范围…
          </p>
        ) : scopeUndo ? (
          <div className="scope-undo" role="status">
            <span>已更新「{scopeUndo.label}」</span>
            <button
              type="button"
              className="text-link"
              onClick={() => void handleUndoScope()}
            >
              撤销
            </button>
            <span className="scope-undo__hint">5 秒内有效</span>
          </div>
        ) : null}
        <p className="reader-scope__note">
          学习范围与练习勾选互不影响；这里的改动不会暂停分组，也不会写入复习记录。
        </p>
      </section>

      <section className="panel learn-audio-panel">
        <div>
          <p className="eyebrow">AUDIO · 朗读</p>
          <h2 className="learn-audio-panel__title">翻卡声音</h2>
        </div>
        <Toggle
          checked={learnAutoSpeak}
          onChange={(checked) => {
            void updateSettings({ learnAutoSpeak: checked }).catch((cause) =>
              pushToast(cause instanceof Error ? cause.message : '设置保存失败', 'error'),
            );
          }}
          label="翻卡自动朗读"
          description={
            autoSpeakReady
              ? '每翻到一张词卡，自动读一遍单词。'
              : '需要系统英文语音，并在设置中开启「单词朗读」。'
          }
          disabled={!autoSpeakReady}
        />
        <Toggle
          checked={learnListenOnly}
          onChange={(checked) => {
            void updateSettings({ learnListenOnly: checked }).catch((cause) =>
              pushToast(cause instanceof Error ? cause.message : '设置保存失败', 'error'),
            );
          }}
          label="只听模式"
          description="隐藏释义、例句与学习数据，只留单词和朗读；卡片上可随时展开完整内容。"
        />
        <p className="learn-audio-panel__note">
          只听模式会自动朗读；语速、口音与总开关在设置页调整。
        </p>
      </section>

      <section className="panel shortcut-panel">
        <p className="eyebrow">KEYS</p>
        <ul>
          <li><kbd>←</kbd><span>上一张词卡</span></li>
          <li><kbd>→</kbd><span>下一张词卡</span></li>
          <li><kbd>Space</kbd><span>下一张词卡</span></li>
          <li><kbd>PgUp</kbd><span>上一张</span></li>
          <li><kbd>PgDn</kbd><span>下一张</span></li>
        </ul>
      </section>
    </aside>
  );

  let content;

  if (loading && words.length === 0) {
    content = (
      <div className="learn-layout">
        <div className="learn-main">
          <section className="panel">
            <LoadingState label="正在取出词卡…" />
          </section>
        </div>
        {aside}
      </div>
    );
  } else if (words.length === 0) {
    content = (
      <div className="learn-layout">
        <div className="learn-main">
          <section className="panel">
            <EmptyState
              icon="book"
              title="词库还是空的"
              description="先添加单词，或到设置中恢复初始词库，词卡才会出现在这里。"
            >
              <Button variant="primary" onClick={() => navigate('/words')} icon={<Icon name="plus" />}>
                添加单词
              </Button>
              <Button onClick={() => navigate('/settings')} icon={<Icon name="refresh" />}>
                恢复初始词库
              </Button>
            </EmptyState>
          </section>
        </div>
        {aside}
      </div>
    );
  } else if (deck.length === 0) {
    content = (
      <div className="learn-layout">
        <div className="learn-main">
          <section className="panel">
            <EmptyState
              icon="cards"
              title="学习范围还是空的"
              description="学习范围独立于练习勾选。挑选几个单词或直接选一个分组，就能开始翻卡。"
            >
              <Button
                variant="primary"
                onClick={() => setScopeOpen(true)}
                icon={<Icon name="cards" />}
              >
                选择学习范围
              </Button>
              <Button onClick={() => void handleToggleAll()} icon={<Icon name="check" />} disabled={scopeBusy}>
                选中全部词条
              </Button>
            </EmptyState>
          </section>
        </div>
        {aside}
      </div>
    );
  } else if (!currentWord) {
    content = (
      <div className="learn-layout">
        <div className="learn-main">
          <section className="panel">
            <LoadingState label="正在翻到这一张…" />
          </section>
        </div>
        {aside}
      </div>
    );
  } else {
    const position = Math.min(deck.length, Math.max(1, activeIndex + 1));

    content = (
      <div className="learn-layout">
        <div className="learn-main">
          <div className="reader-toolbar">
            <button
              type="button"
              className="reader-nav"
              onClick={() => navigateCard('previous')}
              disabled={deck.length === 0}
              aria-label="上一张词卡"
              title="上一张（← / PageUp）"
            >
              <Icon name="arrow-left" size={17} />
              <span>上一张</span>
            </button>
            <div className="reader-position">
              <span className="reader-position__count">
                {`${String(position).padStart(2, '0')} / ${String(deck.length).padStart(2, '0')}`}
              </span>
              <span className="reader-position__track" aria-hidden="true">
                <span
                  style={{
                    width: `${deck.length === 0 ? 0 : (position / deck.length) * 100}%`,
                  }}
                />
              </span>
            </div>
            <button
              type="button"
              className="reader-nav"
              onClick={() => navigateCard('next')}
              disabled={deck.length === 0}
              aria-label="下一张词卡"
              title="下一张（→ / Space / PageDown）"
            >
              <span>下一张</span>
              <Icon name="arrow-right" size={17} />
            </button>
          </div>

          <div className="reader-stage">
            <WordReaderCard
              key={`${currentWord.id}-${flipKey}`}
              word={currentWord}
              group={currentGroup}
              direction={direction}
              autoSpeak={learnAutoSpeak || learnListenOnly}
              listenOnly={learnListenOnly}
            />
          </div>

          <div className="reader-actions">
            <Button
              onClick={() => navigateCard('previous')}
              disabled={deck.length === 0}
              icon={<Icon name="arrow-left" size={15} />}
            >
              上一张
            </Button>
            <span className="reader-actions__hint">
              <kbd>←</kbd> <kbd>→</kbd> 翻动 · <kbd>Space</kbd> 下一张
            </span>
            <Button
              variant="primary"
              onClick={() => navigateCard('next')}
              disabled={deck.length === 0}
              icon={<Icon name="arrow-right" size={15} />}
            >
              下一张
            </Button>
          </div>
        </div>

        {aside}
      </div>
    );
  }

  return (
    <div className="learn-page page-enter">
      <header className="page-head">
        <div>
          <p className="eyebrow">CARD READER · 翻卡学习</p>
          <h1>学习模式</h1>
          <p className="page-head__lead">
            按自己的节奏翻看完整词卡。翻卡只读，不会改变权重、复习计划或答题统计。
          </p>
        </div>
        <div className="page-head__actions">
          <Button
            onClick={() => setScopeOpen(true)}
            disabled={words.length === 0}
            icon={<Icon name="cards" size={16} />}
          >
            选择学习范围
          </Button>
          <Button variant="primary" onClick={() => navigate('/study')} icon={<Icon name="target" size={16} />}>
            去练习
          </Button>
        </div>
      </header>

      {content}

      {scopeOpen ? (
        <StudyScopeModal
          words={words}
          groups={groups}
          onClose={() => setScopeOpen(false)}
        />
      ) : null}
    </div>
  );
}
