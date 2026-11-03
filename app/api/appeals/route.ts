import { ok, handleError, requireUserId, parseJson } from '@/lib/api';
import { AppealService } from '@/lib/services/appeal.service';
import { GuaranteePaymentService } from '@/lib/services/guarantee-payment.service';
import { getDefaultChannel } from '@/lib/services/pay-channel.registry';

/** POST /api/appeals —— 提交爽约申诉 */
export async function POST(req: Request) {
  try {
    const userId = requireUserId(req);
    const body = await parseJson<{
      registrationId: string;
      statement: string;
      evidenceUrls?: string[];
    }>(req);

    const payment = new GuaranteePaymentService(getDefaultChannel());
    const svc = new AppealService(payment);
    const res = await svc.submit({
      registrationId: body.registrationId,
      userId,
      statement: body.statement,
      evidenceUrls: body.evidenceUrls,
    });
    return ok(res);
  } catch (e) {
    return handleError(e);
  }
}
