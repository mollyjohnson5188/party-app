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

/** 抽屉主菜单（次要入口全部收进左上角三横线） */
const NAV = [
  { href: '/', label: '发现组局', icon: 'home' },
  { href: '/circle', label: '圈子', icon: 'circle' },
  { href: '/host', label: '主理人台', icon: 'flag' },
  { href: '/blog', label: '户外博客', icon: 'book' },
];

const NAV_ICONS: Record<string, string> = {
  home: 'M3 10.4 12 3l9 7.4M5.6 9.4V20h12.8V9.4M9.8 20v-5.4h4.4V20',
  circle: 'M12 3.2c2.4 0 4.6.9 6.3 2.4M20.8 12c0 2.4-.9 4.6-2.4 6.3M12 20.8c-2.4 0-4.6-.9-6.3-2.4M3.2 12c0-2.4.9-4.6 2.4-6.3M8.6 8.6h6.8v6.8H8.6z',
  flag: 'M6 21V4h12l-3 4.5L18 13H6',
  book: 'M4.5 4.5h6a2.5 2.5 0 0 1 2.5 2.5v13a2 2 0 0 0-2-2H4.5zM19.5 4.5h-6A2.5 2.5 0 0 0 11 7v13a2 2 0 0 1 2-2h6.5z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.8 20.2c0-3.4 3.2-5.6 7.2-5.6s7.2 2.2 7.2 5.6',
  plus: 'M12 5.5v13M5.5 12h13',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
};

const FOOTER_LINKS = [
  { href: '/about', label: '关于我们' },
  { href: '/rules', label: '社区规则' },
  { href: '/terms', label: '用户协议' },
  { href: '/privacy', label: '隐私政策' },
  { href: '/thanks', label: '致谢' },
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
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <BrandMark size={26} />
        <span className="text-[15px] font-semibold tracking-tight">组局</span>
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
      <path d="M80 14 A66 66 0 1 1 27 52" stroke="#3F7D3F" strokeWidth="14" strokeLinecap="round" />
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
  const [drawer, setDrawer] = useState(false);
  const [userMenu, setUserMenu] = useState(false);

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

  // 路由变化时收起所有浮层
  useEffect(() => {
    setDrawer(false);
    setUserMenu(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawer]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
    setUserMenu(false);
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#f7f6f2]/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2.5 px-3 sm:px-5">
          {/* 左上角三横线菜单 */}
          <button
            onClick={() => setDrawer(true)}
            aria-label="打开菜单"
            className="-ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink active:bg-stone-200/60 sm:hover:bg-stone-200/60"
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={NAV_ICONS.menu} strokeLinecap="round" />
            </svg>
          </button>

          {/* 品牌 */}
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <BrandMark size={26} />
            <span className="text-[16px] font-semibold tracking-tight">组局</span>
          </Link>

          {/* 搜索（Reddit 式胶囊，桌面居中偏右） */}
          <Link
            href="/"
            className="ml-2 hidden h-9 flex-1 items-center gap-2 rounded-full border border-stone-200 bg-white px-3.5 text-[13px] text-stone-400 sm:flex sm:max-w-md"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d={NAV_ICONS.search} strokeLinecap="round" />
            </svg>
            搜索组局、路线、人
          </Link>

          <div className="relative ml-auto flex items-center gap-1.5">
            {/* 移动端搜索图标 */}
            <Link
              href="/"
              aria-label="搜索"
              className="flex h-9 w-9 items-center justify-center rounded-full text-stone-600 active:bg-stone-200/60 sm:hidden"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1">
                <path d={NAV_ICONS.search} strokeLinecap="round" />
              </svg>
            </Link>

            {!loaded && <span className="block h-8 w-8 animate-pulse rounded-full bg-stone-200/70" />}

            {loaded && !user && (
              <Link href="/auth" className="btn btn-primary !px-3.5 !py-1.5 !text-[13px]">
                登录
              </Link>
            )}

            {loaded && user && (
              <>
                <button
                  onClick={() => setUserMenu((v) => !v)}
                  aria-label="账户菜单"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-moss-100 text-[15px] ring-1 ring-stone-200"
                >
                  {user.avatarEmoji}
                </button>

                {userMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
                    <div className="absolute right-0 top-11 z-50 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
                      <div className="border-b border-stone-100 px-3.5 py-3">
                        <p className="text-[13.5px] font-medium">{user.nickname}</p>
                        <p className="mt-0.5 text-[11.5px] text-muted">
                          信用分 <span className="tabular text-moss-700">{user.creditScore}</span>
                          {user.role === 'ADMIN' && (
                            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] text-amber-700">
                              管理员
                            </span>
                          )}
                        </p>
                      </div>
                      <Link href="/me" className="block px-3.5 py-2.5 text-[13px] hover:bg-stone-50">
                        个人中心
                      </Link>
                      <Link href="/me?tab=credit" className="block px-3.5 py-2.5 text-[13px] hover:bg-stone-50">
                        信用中心
                      </Link>
                      {user.role === 'ADMIN' && (
                        <Link
                          href="/admin/blog"
                          className="block px-3.5 py-2.5 text-[13px] text-moss-700 hover:bg-moss-50"
                        >
                          博客后台
                        </Link>
                      )}
                      <button
                        onClick={logout}
                        className="block w-full border-t border-stone-100 px-3.5 py-2.5 text-left text-[13px] text-stone-500 hover:bg-stone-50 hover:text-red-600"
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

      {/* ============ 左侧抽屉菜单（Reddit 式） ============ */}
      {drawer && (
        <div className="fixed inset-0 z-[60]" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-ink/45" />
          <aside
            className="absolute inset-y-0 left-0 flex w-[278px] max-w-[82vw] flex-col bg-[#f7f6f2] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 pb-3 pt-4">
              <Link href="/" className="flex items-center gap-2">
                <BrandMark size={28} />
                <span className="text-[16px] font-semibold tracking-tight">组局</span>
              </Link>
              <button
                onClick={() => setDrawer(false)}
                aria-label="关闭菜单"
                className="flex h-9 w-9 items-center justify-center rounded-full text-stone-500 active:bg-stone-200/70"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d={NAV_ICONS.close} strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-2">
              {NAV.map((n) => {
                const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] ${
                      active ? 'bg-white font-medium text-moss-700 shadow-sm' : 'text-stone-700 active:bg-stone-200/50'
                    }`}
                  >
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.1 : 1.8}>
                      <path d={NAV_ICONS[n.icon]} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {n.label}
                  </Link>
                );
              })}

              <div className="my-2 border-t border-stone-200/80" />

              {user ? (
                <>
                  <Link
                    href="/me"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] text-stone-700 active:bg-stone-200/50"
                  >
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d={NAV_ICONS.user} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    个人中心
                  </Link>
                  <Link
                    href="/me?tab=credit"
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] text-stone-700 active:bg-stone-200/50"
                  >
                    <span className="flex h-[19px] w-[19px] items-center justify-center text-[13px]">⭐</span>
                    信用中心
                  </Link>
                  {user.role === 'ADMIN' && (
                    <Link
                      href="/admin/blog"
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] text-moss-700 active:bg-stone-200/50"
                    >
                      <span className="flex h-[19px] w-[19px] items-center justify-center text-[13px]">📝</span>
                      博客后台
                    </Link>
                  )}
                </>
              ) : (
                <Link
                  href="/auth"
                  className="mx-1 mt-1 flex items-center justify-center rounded-full bg-moss-600 px-3 py-2.5 text-[14px] font-medium text-white active:bg-moss-700"
                >
                  登录 / 注册
                </Link>
              )}

              <div className="my-2 border-t border-stone-200/80" />

              {FOOTER_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="block rounded-lg px-3 py-2 text-[13px] text-stone-500 active:bg-stone-200/50"
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            <div className="border-t border-stone-200/80 px-4 py-3 text-[11px] leading-relaxed text-stone-400">
              平台不代收活动费用，仅处理保证金。
            </div>
          </aside>
        </div>
      )}

      <Suspense fallback={null}>
        <MobileTabBar />
      </Suspense>
    </>
  );
}

/* ---------------- 移动端底部 Tab 栏（Reddit App 范式：5 槽 + 中间发布 FAB） ---------------- */

const TABS: { href: string; label: string; icon: keyof typeof NAV_ICONS }[] = [
  { href: '/', label: '发现', icon: 'home' },
  { href: '/circle', label: '圈子', icon: 'circle' },
  { href: '/me', label: '我的', icon: 'user' },
];

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
            className="-mt-4 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-moss-600 text-white shadow-lg shadow-moss-600/25 ring-4 ring-[#f7f6f2] transition-transform active:scale-95"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d={NAV_ICONS.plus} strokeLinecap="round" />
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
        <path d={NAV_ICONS[tab.icon]} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`text-[10.5px] leading-none ${active ? 'font-semibold' : ''}`}>{tab.label}</span>
    </Link>
  );
}
