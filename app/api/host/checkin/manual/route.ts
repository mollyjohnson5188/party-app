import { ok, handleError, resolveUserId, parseJson } from '@/lib/api';
import { CheckinService } from '@/lib/services/checkin.service';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';

/** POST /api/host/checkin/manual —— 主理人手动核销（需二次确认） */
export async function POST(req: Request) {
  try {
    const hostId = await resolveUserId(req);
    const body = await parseJson<{ registrationId: string }>(req);

    const payment = new GuaranteePaymentService(getDefaultChannel());
    const svc = new CheckinService(payment);
    const res = await svc.checkinManual({
      registrationId: body.registrationId,
      hostId,
    });
    return ok(res);
  } catch (e) {
    return handleError(e);
  }
}
