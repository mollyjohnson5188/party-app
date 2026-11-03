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
 * 简易身份识别。
 * MVP 用请求头 X-User-Id 代表登录态；生产应替换为 JWT/Session 中间件，
 * 但不影响业务层（业务层只依赖 userId / hostId 参数）。
 */
export function currentUserId(req: Request): string | null {
  return req.headers.get('x-user-id');
}

export function requireUserId(req: Request): string {
  const id = currentUserId(req);
  if (!id) {
    throw new AppError('UNAUTHENTICATED', 401, '请先登录');
  }
  return id;
}

export async function parseJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError('VALIDATION_ERROR', 400, '请求体不是合法 JSON');
  }
}
