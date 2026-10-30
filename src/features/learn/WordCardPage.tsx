import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icons';
import { LoadingState } from '../../components/LoadingState';
import { useWordStore } from '../words/wordStore';
import { WordReaderCard } from './WordReaderCard';

export function WordCardPage() {
  const { wordId = '' } = useParams();
  const navigate = useNavigate();
  const words = useWordStore((state) => state.words);
  const groups = useWordStore((state) => state.groups);
  const loading = useWordStore((state) => state.loading);
  const load = useWordStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  const word = words.find((item) => item.id === wordId) ?? null;
  const group = word?.groupId
    ? (groups.find((item) => item.id === word.groupId) ?? undefined)
    : undefined;

  let content;
  if (loading && words.length === 0) {
    content = (
      <section className="panel">
        <LoadingState label="正在取出这张词卡…" />
      </section>
    );
  } else if (!word) {
    content = (
      <section className="panel">
        <EmptyState
          icon="cards"
          title="这张词卡已不在词库中"
          description="它可能已被删除，或数据刚刚更新。回到书桌重新翻一张吧。"
        >
          <Button variant="primary" onClick={() => navigate('/')} icon={<Icon name="home" />}>
            返回书桌
          </Button>
          <Button onClick={() => navigate('/learn')} icon={<Icon name="cards" />}>
            翻卡学习
          </Button>
        </EmptyState>
      </section>
    );
  } else {
    content = (
      <div className="word-card-stage reader-stage">
        <WordReaderCard word={word} group={group} />
      </div>
    );
  }

  return (
    <div className="word-card-page page-enter">
      <header className="page-head">
        <div>
          <p className="eyebrow">SINGLE CARD · 单张词卡</p>
          <h1>词卡</h1>
          <p className="page-head__lead">
            从今日书桌的单词贴条打开。只读浏览，不写入复习日志，也不改变复习计划。
          </p>
        </div>
        <div className="page-head__actions">
          <Button onClick={() => navigate('/')} icon={<Icon name="home" size={16} />}>
            返回书桌
          </Button>
          <Button
            variant="primary"
            onClick={() => navigate('/learn')}
            icon={<Icon name="cards" size={16} />}
          >
            翻卡学习
          </Button>
        </div>
      </header>

      {content}
    </div>
  );
}
