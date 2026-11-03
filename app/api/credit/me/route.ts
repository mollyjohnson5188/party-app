import { ok, handleError, requireUserId } from '@/lib/api';
import { CreditService } from '@/lib/services/credit.service';

/** GET /api/credit/me —— 信用分、等级、成行/爽约次数 */
export async function GET(req: Request) {
  try {
    const userId = requireUserId(req);
    const svc = new CreditService();
    const data = await svc.getMe(userId);
    return ok(data);
  } catch (e) {
    return handleError(e);
  }
}
