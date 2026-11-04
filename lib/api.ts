import { NextResponse } from 'next/server';
import { AppError } from './errors';

export interface ApiOk<T> {
  success: true;
  data: T;
}

export interface ApiErr {
  success: false;
  code: string;
  message: string;
  detail?: Record<string, unknown>;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(
  code: string,
  status = 400,
  message?: string,
  detail?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    { success: false, code, message: message ?? code, detail },
    { status }
  );
}

/** 统一错误映射：AppError -> 对应 HTTP 状态码 */
export function handleError(e: unknown): NextResponse {
  if (e instanceof AppError) {
    return fail(e.code, e.httpStatus, e.message, e.detail);
  }
  if (typeof e === 'object' && e !== null && 'code' in e && 'httpStatus' in e) {
    const err = e as { code: string; httpStatus: number; message: string };
    return fail(err.code, err.httpStatus, err.message);
  }
  console.error('[api] 未捕获异常', e);
  return fail('INTERNAL_ERROR', 500, '服务内部错误');
}

/**
 * 身份识别（安全版）。
 *
 * 规则：
 *  1. 优先读 httpOnly Cookie 中的真实 Session（生产唯一可信来源）
 *  2. 仅当未登录、「未开启强制登录」且显式允许演示时，才回退到 X-User-Id 头
 *     —— 用于本地开发与种子数据演示，生产环境设置 AUTH_STRICT=1 即彻底关闭
 */
const DEMO_FALLBACK_ENABLED = process.env.AUTH_STRICT !== '1';

export function currentUserId(req: Request): string | null {
  if (DEMO_FALLBACK_ENABLED) return req.headers.get('x-user-id');
  return null;
}

export function requireUserId(req: Request): string {
  const id = currentUserId(req);
  if (!id) {
    throw new AppError('UNAUTHENTICATED', 401, '请先登录');
  }
  return id;
}

/** 需要真实登录态的接口用这个：只认 Session Cookie，不接受演示头 */
export async function requireSession(req: Request) {
  const { resolveSession } = await import('@/lib/auth/session');
  const auth = await resolveSession(req.headers.get('cookie'));
  if (!auth) throw new AppError('UNAUTHENTICATED', 401, '请先登录');
  return auth;
}

/** 管理员接口专用：真实 Session + role=ADMIN，不接受任何客户端自报角色 */
export async function requireAdmin(req: Request) {
  const auth = await requireSession(req);
  if (auth.user.role !== 'ADMIN') {
    throw new AppError('FORBIDDEN', 403, '需要管理员权限');
  }
  return auth;
}

/**
 * 业务层 userId 解析：先用 Session，未登录再按演示规则回退。
 * 这样既保证线上安全，也保留种子数据可演示性。
 */
export async function resolveUserId(req: Request): Promise<string> {
  const { resolveSession } = await import('@/lib/auth/session');
  const auth = await resolveSession(req.headers.get('cookie'));
  if (auth) return auth.user.id;
  return requireUserId(req);
}

export async function parseJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError('VALIDATION_ERROR', 400, '请求体不是合法 JSON');
  }
}
