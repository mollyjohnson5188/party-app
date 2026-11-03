import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { CheckinService } from '@/lib/services/checkin.service';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';

/** POST /api/host/checkin/scan —— 主理人扫码核销 */
export async function POST(req: Request) {
  try {
    const hostId = requireUserId(req);
    const body = await parseJson<{ activityId: string; token: string }>(req);

    const payment = new GuaranteePaymentService(getDefaultChannel());
    const svc = new CheckinService(payment);
    const res = await svc.checkinScan({
      activityId: body.activityId,
      hostId,
      token: body.token,
    });
    return ok(res);
  } catch (e) {
    return handleError(e);
  }
}
