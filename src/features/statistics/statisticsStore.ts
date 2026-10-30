import { create } from 'zustand';
import { filterSelectableWords } from '../../domain/scheduler';
import { computeStatistics } from '../../domain/statistics';
import type { StatisticsSummary } from '../../domain/types';
import { repository } from '../../services/repository';
import { useSettingsStore } from '../../stores/settingsStore';

interface StatisticsState {
  statistics: StatisticsSummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export const useStatisticsStore = create<StatisticsState>((set) => ({
  statistics: null,
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [words, logs, groups] = await Promise.all([
        repository.listWords(),
        repository.listReviewLogs(),
        repository.listGroups(),
      ]);
      const goal = useSettingsStore.getState().settings.dailyGoal;
      set({
        statistics: computeStatistics(
          words,
          logs,
          Date.now(),
          goal,
          filterSelectableWords(words, groups),
        ),
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : '统计数据加载失败',
      });
    }
  },
}));
