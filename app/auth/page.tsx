'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Spinner } from '@/components/ui';

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-5 py-20">
          <Spinner label="加载" />
        </div>
      }
    >
      <AuthInner />
    </Suspense>
  );
}

function AuthInner() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { phone, password }
          : { phone, password, nickname, adminCode: adminCode || undefined };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) {
        setErr(json.message ?? '操作失败');
        return;
      }
      router.push('/');
      router.refresh();
    } catch (e) {
      setErr((e as Error).message || '网络异常');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <div className="mb-6 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-moss-600">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
            <path d="M3 20h18M6 20V9l6-4 6 4v11" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight">
          {mode === 'login' ? '登录组局' : '加入组局'}
        </h1>
        <p className="mt-1.5 text-[13px] text-muted">
          {mode === 'login'
            ? '用手机号和密码继续你的第二生活'
            : '一个手机号，一个信用分，开始认识同类人'}
        </p>
      </div>

      <div className="card p-5">
        <div className="mb-5 flex overflow-hidden rounded-lg border border-stone-200">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErr(null);
              }}
              className={`flex-1 py-2 text-[13px] transition-colors ${
                mode === m ? 'bg-moss-500 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'
              }`}
            >
              {m === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3.5">
          {mode === 'register' && (
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium">昵称</span>
              <input
                className="input"
                placeholder="别人怎么称呼你（2–20 字）"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium">手机号</span>
            <input
              className="input tabular"
              type="tel"
              inputMode="numeric"
              placeholder="11 位手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
              autoComplete="username"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium">密码</span>
            <input
              className="input"
              type="password"
              placeholder={mode === 'register' ? '至少 8 位，含字母和数字' : '输入密码'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (
            <div>
              {!showAdmin ? (
                <button
                  type="button"
                  className="text-[11.5px] text-stone-400 hover:text-stone-600"
                  onClick={() => setShowAdmin(true)}
                >
                  有管理员邀请码？
                </button>
              ) : (
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] font-medium">管理员邀请码（可选）</span>
                  <input
                    className="input"
                    placeholder="留空则为普通用户"
                    value={adminCode}
                    onChange={(e) => setAdminCode(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] leading-relaxed text-red-700">
              {err}
            </div>
          )}

          <button className="btn btn-primary w-full" type="submit" disabled={busy}>
            {busy ? '处理中…' : mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-muted">
          继续即表示同意平台只处理保证金、不代收活动费用的规则。
          <br />
          <Link href="/" className="text-moss-700 hover:underline">
            先随便逛逛 →
          </Link>
        </p>
      </div>
    </div>
  );
}
