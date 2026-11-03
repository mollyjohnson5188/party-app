/**
 * 爽约分账算法。
 *
 * 规则（规程 2.5）：
 *  - 爽约保证金全额进入守约补偿池，按已核销到场人数均分
 *  - 最小单位 1 分，余数给最早核销者（若余数 > 1 分，依次给最早的 N 位）
 *  - 平台不截留：sum(allocation) 必须严格等于扣划总额
 *  - 手续费由平台承担，不冲减用户补偿额
 */
export interface Beneficiary {
  registrationId: string;
  checkinAt: Date;
}

export interface Allocation {
  beneficiaryRegId: string;
  amount: number;
}

export function splitForfeit(amount: number, beneficiaries: Beneficiary[]): Allocation[] {
  const n = beneficiaries.length;
  if (n === 0) return [];
  if (amount <= 0) return [];

  const total = Math.floor(amount);
  const base = Math.floor(total / n);
  let remainder = total - base * n; // 0 <= remainder < n

  // 最早核销者优先拿余数；时间相同时按 registrationId 稳定排序
  const ordered = [...beneficiaries].sort((a, b) => {
    const d = a.checkinAt.getTime() - b.checkinAt.getTime();
    if (d !== 0) return d;
    return a.registrationId < b.registrationId ? -1 : 1;
  });

  return ordered.map((b, idx) => ({
    beneficiaryRegId: b.registrationId,
    amount: base + (idx < remainder ? 1 : 0),
  }));
}

/** 自检：分账总额必须等于扣划额 */
export function assertAllocationBalanced(amount: number, alloc: Allocation[]): void {
  const sum = alloc.reduce((s, a) => s + a.amount, 0);
  if (sum !== amount) {
    throw new Error(`分账不平衡：扣划 ${amount}，实际分 ${sum}`);
  }
}
