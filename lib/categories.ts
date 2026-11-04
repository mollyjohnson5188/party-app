/**
 * 活动分类 —— 用于首页筛选与发布表单选择。
 */
'use client';

export interface Category {
  key: string;
  label: string;
  emoji: string;
}

export const CATEGORIES: Category[] = [
  { key: 'HIKING', label: '徒步登山', emoji: '🥾' },
  { key: 'CYCLING', label: '骑行', emoji: '🚴' },
  { key: 'BADMINTON', label: '球类运动', emoji: '🏸' },
  { key: 'RUNNING', label: '跑步', emoji: '🏃' },
  { key: 'WATER', label: '水上活动', emoji: '🌊' },
  { key: 'CAMPING', label: '露营', emoji: '⛺' },
  { key: 'CLIMBING', label: '攀岩', emoji: '🧗' },
  { key: 'SOCIAL', label: '桌游社交', emoji: '🎲' },
  { key: 'OTHER', label: '其他', emoji: '✨' },
];

export function getCategory(key?: string | null): Category {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}
