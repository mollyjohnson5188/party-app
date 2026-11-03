import { ok, handleError, parseJson } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';
import { signCallback } from '@/lib/pay-signature';

/**
 * POST /api/dev/sign-and-notify
 *
 * 仅用于本地/演示环境：代替"真实支付通道回调"，帮前端完成一次合法签名的回调，
 * 以便在浏览器里跑通"冻结 → 回调 → 报名成功"的完整链路。
 *
 * 生产环境必须删除此路由，改由通道服务端回调 POST /api/payments/guarantee/notify。
 */
export async function POST(req: Request) {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_SIGN !== '1') {
      throw new AppError('FORBIDDEN', 403, '生产环境已禁用该调试接口');
    }

    const body = await parseJson<{ raw: string; timestamp: string }>(req);
    if (!body.raw || !body.timestamp) {
      throw new AppError('VALIDATION_ERROR', 400, 'raw 与 timestamp 必填');
    }

    // 校验是合法 JSON，避免把任意字符串当回调
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.raw);
    } catch {
      throw new AppError('VALIDATION_ERROR', 400, 'raw 不是合法 JSON');
    }

    const signature = signCallback(body.raw, body.timestamp);

    const svc = new GuaranteePaymentService(getDefaultChannel());
    const result = await svc.handlePaySuccessNotify(
      parsed as {
        orderId: string;
        registrationId: string;
        channelTxnId: string;
        channelEventId: string;
        amount: number;
        paidAt: string;
      }
    );

    return ok({ ...result, signature });
  } catch (e) {
    return handleError(e);
  }
}
