import { ok, handleError, parseJson } from '@/lib/api';
import { AppError } from '@/lib/errors';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';
import { verifyCallbackSignature } from '@/lib/pay-signature';

interface Body {
  orderId: string;
  registrationId: string;
  channelTxnId: string;
  channelEventId: string;
  amount: number;
  paidAt: string;
}

/** POST /api/payments/guarantee/notify —— 支付回调，幂等 */
export async function POST(req: Request) {
  try {
    const raw = await req.text();

    // 验签在解析业务参数之前
    const sig = req.headers.get('x-pay-signature');
    const ts = req.headers.get('x-pay-timestamp');
    const verified = verifyCallbackSignature({ raw, signature: sig, timestamp: ts });
    if (!verified.ok) {
      throw new AppError(
        verified.reason === 'EXPIRED' ? 'TIMESTAMP_EXPIRED' : 'SIGN_INVALID',
        401,
        verified.reason === 'EXPIRED' ? '回调时间戳过期' : '回调签名无效'
      );
    }

    const body = JSON.parse(raw) as Body;
    if (!body.orderId || !body.registrationId || !body.amount) {
      throw new AppError('VALIDATION_ERROR', 400, '回调参数不完整');
    }

    const svc = new GuaranteePaymentService(getDefaultChannel());
    const result = await svc.handlePaySuccessNotify(body);
    return ok({ idempotent: result.idempotent, orderStatus: result.orderStatus });
  } catch (e) {
    return handleError(e);
  }
}
