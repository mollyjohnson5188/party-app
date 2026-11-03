import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { RegistrationService } from '@/lib/services/registration.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';

interface Body {
  activityId: string;
  guaranteeMode?: 'NONE' | 'GUARANTEE';
}

/** POST /api/registrations —— 创建报名，返回报名单与支付参数 */
export async function POST(req: Request) {
  try {
    const userId = requireUserId(req);
    const body = await parseJson<Body>(req);
    if (!body.activityId) {
      throw new (await import('@/lib/errors')).AppError('VALIDATION_ERROR', 400, 'activityId 必填');
    }

    const svc = new RegistrationService();
    const result = await svc.create({
      activityId: body.activityId,
      userId,
      guaranteeMode: body.guaranteeMode,
    });

    // 支付参数：MVP 返回 mock 通道的待支付信息
    const payment =
      result.guaranteeOrderId !== null
        ? {
            channel: getDefaultChannel().name,
            orderId: result.guaranteeOrderId,
            amount: result.guaranteeAmount,
            expireAt: result.paymentExpireAt,
            // 真实环境返回 channel 的 prepay 参数（timeStamp/nonceStr/package 等）
            prepay: { mock: true },
          }
        : null;

    return ok({
      registration: {
        id: result.id,
        status: result.registrationStatus,
        checkinCode: result.checkinCode,
      },
      payment,
    });
  } catch (e) {
    return handleError(e);
  }
}
