/**
 * 错误码与统一业务异常。
 * 所有对外错误都带 code，便于前端分支与测试断言。
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly httpStatus: number,
    message?: string,
    readonly detail?: Record<string, unknown>
  ) {
    super(message ?? code);
    this.name = 'AppError';
  }
}

export const Err = {
  amountMismatch: (expected: number, actual: number) =>
    new AppError('AMOUNT_MISMATCH', 400, `回调金额不一致：期望 ${expected}，实际 ${actual}`, {
      expected,
      actual,
    }),
  orderNotFound: (id: string) =>
    new AppError('ORDER_NOT_FOUND', 404, `保证金单不存在：${id}`),
  registrationNotFound: (id: string) =>
    new AppError('REGISTRATION_NOT_FOUND', 404, `报名单不存在：${id}`),
  activityNotFound: (id: string) =>
    new AppError('ACTIVITY_NOT_FOUND', 404, `活动不存在：${id}`),
  notActivityHost: () =>
    new AppError('NOT_ACTIVITY_HOST', 403, '只有该活动主理人才能核销'),
  outOfWindow: (open: string, close: string) =>
    new AppError('OUT_OF_CHECKIN_WINDOW', 400, `核销窗口为 ${open} ~ ${close}`, {
      open,
      close,
    }),
  activityCancelled: () =>
    new AppError('ACTIVITY_CANCELLED', 400, '活动已取消，无法核销'),
  tokenExpired: () => new AppError('TOKEN_EXPIRED', 400, '核销码已过期'),
  tokenInvalid: () => new AppError('TOKEN_INVALID', 400, '核销码无效'),
  duplicateRegistration: () =>
    new AppError('DUPLICATE_REGISTRATION', 409, '你已报名该活动'),
  activityFull: () => new AppError('ACTIVITY_FULL', 409, '活动名额已满'),
  cannotRegisterOwn: () =>
    new AppError('CANNOT_REGISTER_OWN_ACTIVITY', 400, '不能报名自己主理的活动'),
  creditBelowThreshold: (need: number, actual: number) =>
    new AppError(
      'CREDIT_BELOW_THRESHOLD',
      403,
      `该活动要求信用分不低于 ${need}，你当前 ${actual} 分`,
      { need, actual }
    ),
  startedCannotCancel: () =>
    new AppError('ACTIVITY_STARTED_CANNOT_CANCEL', 400, '活动已开始，无法取消报名'),
  appealWindowClosed: () =>
    new AppError('APPEAL_WINDOW_CLOSED', 400, '申诉窗口已关闭（活动结束 24 小时内可申诉）'),
  notAppealable: () =>
    new AppError('NOT_APPEALABLE', 400, '当前报名状态不支持申诉'),
  appealExists: () => new AppError('APPEAL_EXISTS', 409, '该报名单已提交过申诉'),
  notOwner: () => new AppError('NOT_OWNER', 403, '无权操作他人的报名单'),
  illegalTransition: (from: string, to: string) =>
    new AppError('ILLEGAL_TRANSITION', 409, `非法状态转换：${from} → ${to}`, {
      from,
      to,
    }),
  appealNotFound: () => new AppError('APPEAL_NOT_FOUND', 404, '申诉单不存在'),
  notActorHost: () => new AppError('NOT_ACTIVITY_HOST', 403, '只有该活动主理人才能操作'),
  validation: (msg: string) => new AppError('VALIDATION_ERROR', 400, msg),
};
