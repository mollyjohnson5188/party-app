'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

interface SessionUser {
  id: string;
  nickname: string;
  role: 'USER' | 'ADMIN';
  avatarEmoji: string;
  creditScore: number;
}

const NAV = [
  { href: '/', label: '发现组局' },
  { href: '/circle', label: '圈子' },
  { href: '/blog', label: '户外博客' },
  { href: '/me', label: '个人中心' },
  { href: '/host', label: '主理人台' },
];

export function SiteHeader() {
  return (
    <Suspense fallback={<HeaderShell />}>
      <HeaderInner />
    </Suspense>
  );
}

function HeaderShell() {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#f7f6f2]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
        <span className="flex items-center gap-2">
          <BrandMark size={26} />
          <span className="text-[15px] font-semibold tracking-tight">组局</span>
        </span>
      </div>
    </header>
  );
}

/** 品牌 Logo：约 · 圆环（定稿方案 02） */
export function BrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 160 160"
      fill="none"
      aria-label="组局"
      className="shrink-0"
    >
      <path
        d="M80 14 A66 66 0 1 1 27 52"
        stroke="#3F7D3F"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M27 52 L46 33 L62 47 L80 14"
        stroke="#2F5230"
        strokeWidth="14"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="44" y="44" width="72" height="72" rx="13" fill="#1F2A1B" />
      <text
        x="80"
        y="97"
        textAnchor="middle"
        fontFamily="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif"
        fontSize="50"
        fontWeight="900"
        fill="#FFFFFF"
      >
        约
      </text>
    </svg>
  );
}

function HeaderInner() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setUser(j?.data?.user ?? null))
      .catch(() => setUser(null))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    load();
    const h = () => load();
    window.addEventListener('party:auth-changed', h);
    return () => window.removeEventListener('party:auth-changed', h);
  }, [load]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setOpen(false);
    router.push('/');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#f7f6f2]/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-moss-600">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M3 20h18M6 20V9l6-4 6 4v11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight">组局</span>
          <span className="hidden text-[11px] text-muted sm:inline">白领户外</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors ${
                  active
                    ? 'bg-white font-medium text-moss-700 shadow-sm ring-1 ring-stone-200'
                    : 'text-stone-600 hover:bg-white/70 hover:text-ink'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="relative ml-auto">
          {!loaded && <span className="block h-8 w-24 animate-pulse rounded-lg bg-stone-200/60" />}

          {loaded && !user && (
            <Link href="/auth" className="btn btn-primary !py-1.5 !text-[13px]">
              登录 / 注册
            </Link>
          )}

          {loaded && user && (
            <>
              <button
                onClick={() => setOpen((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] hover:border-stone-300"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-moss-100 text-[11px]">
                  {user.avatarEmoji}
                </span>
                <span className="max-w-[80px] truncate">{user.nickname}</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                </svg>
              </button>

              {open && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                  <div className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
                    <div className="border-b border-stone-100 px-3 py-2.5">
                      <p className="text-[13px] font-medium">{user.nickname}</p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        信用分 <span className="tabular text-moss-700">{user.creditScore}</span>
                        {user.role === 'ADMIN' && (
                          <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
                            管理员
                          </span>
                        )}
                      </p>
                    </div>
                    <Link
                      href="/me"
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-[13px] hover:bg-stone-50"
                    >
                      个人中心
                    </Link>
                    <Link
                      href="/me?tab=credit"
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-[13px] hover:bg-stone-50"
                    >
                      信用中心
                    </Link>
                    <Link
                      href="/host"
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 text-[13px] hover:bg-stone-50"
                    >
                      主理人台
                    </Link>
                    <button
                      onClick={logout}
                      className="block w-full border-t border-stone-100 px-3 py-2 text-left text-[13px] text-stone-500 hover:bg-stone-50 hover:text-red-600"
                    >
                      退出登录
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

    </header>
  );
}

/* ---------------- 移动端底部 Tab 栏（Reddit App 范式：5 槽 + 中间发布 FAB） ---------------- */

const TABS: { href: string; label: string; icon: keyof typeof TAB_ICONS }[] = [
  { href: '/', label: '发现', icon: 'home' },
  { href: '/circle', label: '圈子', icon: 'circle' },
  { href: '/blog', label: '博客', icon: 'book' },
  { href: '/me', label: '我的', icon: 'user' },
];

const TAB_ICONS = {
  home: 'M3 10.4 12 3l9 7.4M5.6 9.4V20h12.8V9.4M9.8 20v-5.4h4.4V20',
  circle:
    'M12 3.2c2.4 0 4.6.9 6.3 2.4M20.8 12c0 2.4-.9 4.6-2.4 6.3M12 20.8c-2.4 0-4.6-.9-6.3-2.4M3.2 12c0-2.4.9-4.6 2.4-6.3M8.6 8.6h6.8v6.8H8.6z',
  book: 'M4.5 4.5h6a2.5 2.5 0 0 1 2.5 2.5v13a2 2 0 0 0-2-2H4.5zM19.5 4.5h-6A2.5 2.5 0 0 0 11 7v13a2 2 0 0 1 2-2h6.5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.8 20.2c0-3.4 3.2-5.6 7.2-5.6s7.2 2.2 7.2 5.6',
  plus: 'M12 5.5v13M5.5 12h13',
} as const;

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-[#f7f6f2]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
      <div className="mx-auto flex h-[54px] max-w-lg items-stretch">
        {TABS.slice(0, 2).map((t) => (
          <TabItem key={t.href} tab={t} pathname={pathname} />
        ))}

        <div className="relative flex w-[68px] shrink-0 justify-center">
          <Link
            href="/host"
            aria-label="发起组局"
            className="-mt-4 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-moss-600 text-white shadow-lg shadow-moss-600/25 ring-4 ring-[#f7f6f2] active:scale-95 transition-transform"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d={TAB_ICONS.plus} strokeLinecap="round" />
            </svg>
          </Link>
        </div>

        {TABS.slice(2).map((t) => (
          <TabItem key={t.href} tab={t} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function TabItem({ tab, pathname }: { tab: (typeof TABS)[number]; pathname: string }) {
  const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
  return (
    <Link
      href={tab.href}
      className={`flex flex-1 flex-col items-center justify-center gap-0.5 ${
        active ? 'text-moss-700' : 'text-stone-500'
      }`}
    >
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.75}>
        <path d={TAB_ICONS[tab.icon]} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-[10.5px] leading-none ${active ? 'font-semibold' : ''}`}>{tab.label}</span>
    </Link>
  );
}
