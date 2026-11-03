'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { DEMO_USERS, getCurrentUserId, setCurrentUserId } from '@/lib/client';

const NAV = [
  { href: '/', label: '发现组局' },
  { href: '/mine', label: '我的报名' },
  { href: '/credit', label: '信用中心' },
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
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-moss-600" />
          <span className="text-[15px] font-semibold tracking-tight">组局</span>
        </span>
      </div>
    </header>
  );
}

function HeaderInner() {
  const pathname = usePathname();
  const [userId, setUserId] = useState('u_zhang');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUserId(getCurrentUserId());
    const handler = () => setUserId(getCurrentUserId());
    window.addEventListener('party:user-changed', handler);
    return () => window.removeEventListener('party:user-changed', handler);
  }, []);

  const user = DEMO_USERS.find((u) => u.id === userId) ?? DEMO_USERS[0];

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

        <nav className="flex items-center gap-1">
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

        <div className="ml-auto relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[13px] hover:border-stone-300"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-moss-100 text-[10px] font-medium text-moss-700">
              {user.name.slice(0, 1)}
            </span>
            <span className="max-w-[80px] truncate">{user.name}</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 9l6 6 6-6" strokeLinecap="round" />
            </svg>
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-50 mt-1.5 w-60 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl">
                <div className="border-b border-stone-100 px-3 py-2 text-[11px] text-muted">
                  演示身份切换
                </div>
                {DEMO_USERS.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setCurrentUserId(u.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-stone-50 ${
                      u.id === userId ? 'bg-moss-50/60 font-medium text-moss-700' : ''
                    }`}
                  >
                    <span className="w-14 shrink-0 truncate">{u.name}</span>
                    <span className="flex-1 truncate text-[11px] text-muted">{u.role}</span>
                    <span className="tabular text-[11px] text-muted">{u.credit}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
