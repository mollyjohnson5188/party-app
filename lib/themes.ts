/**
 * 活动主题模板库 —— 让每场组局有专属视觉气质，提升参与兴趣。
 * 仅前端消费：渐变背景 / 强调色 / 标签，通过内联 style 应用，不依赖额外 CSS。
 */
'use client';

export interface Theme {
  key: string;
  label: string;
  emoji: string;
  desc: string;
  /** 卡片/头图渐变背景（内联 style） */
  gradient: string;
  /** 强调色文字（内联 style color） */
  accent: string;
  /** 暗色主题时文字翻白 */
  dark?: boolean;
}

export const THEMES: Theme[] = [
  {
    key: 'classic',
    label: '经典莫兰迪',
    emoji: '✨',
    desc: '通用 · 沉稳知性',
    gradient: 'linear-gradient(135deg,#F4F1EA 0%,#E7E1D3 100%)',
    accent: '#5B6B54',
  },
  {
    key: 'hiking',
    label: '青山徒步',
    emoji: '🏔️',
    desc: '徒步 / 登山 / 露营',
    gradient: 'linear-gradient(135deg,#E9F4E8 0%,#CFE7C9 100%)',
    accent: '#3E6B3E',
  },
  {
    key: 'cycling',
    label: '霓虹夜骑',
    emoji: '🚴',
    desc: '骑行 / 夜跑 / 夜生活',
    gradient: 'linear-gradient(135deg,#241E38 0%,#43305F 55%,#7A4A8C 100%)',
    accent: '#FFB86B',
    dark: true,
  },
  {
    key: 'badminton',
    label: '活力球场',
    emoji: '🏸',
    desc: '羽毛球 / 篮球 / 运动',
    gradient: 'linear-gradient(135deg,#FFF4DE 0%,#FFDFAB 100%)',
    accent: '#B36A00',
  },
  {
    key: 'water',
    label: '水上时光',
    emoji: '🌊',
    desc: '桨板 / 皮划艇 / 露营湖畔',
    gradient: 'linear-gradient(135deg,#E3F1FA 0%,#C2E2F5 100%)',
    accent: '#1F5E86',
  },
  {
    key: 'party',
    label: '城市社交',
    emoji: '🎉',
    desc: '桌游 / 剧本 / 聚会',
    gradient: 'linear-gradient(135deg,#FDECF3 0%,#F7CFE1 100%)',
    accent: '#A63D6F',
  },
];

const MAP: Record<string, Theme> = Object.fromEntries(THEMES.map((t) => [t.key, t]));

export function getTheme(key?: string | null): Theme {
  return (key && MAP[key]) || MAP['classic'];
}
