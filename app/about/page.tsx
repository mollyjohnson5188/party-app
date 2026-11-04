import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '关于组局 | 保证金制的白领户外组局平台',
  description:
    '组局是一个保证金制的白领户外活动平台：平台不收活动费，保证金到场全额退还，爽约的钱补偿给到场的人。',
  alternates: { canonical: 'https://uismile.com/about' },
};

export default function AboutPage() {
  return (
    <div className="legal-page mx-auto max-w-3xl px-5 py-10">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-moss-600">ABOUT</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-tight">关于组局</h1>

      <div className="mt-8 space-y-6 text-[14px] leading-[1.9] text-stone-700">
        <section>
          <h2 className="text-[17px] font-semibold text-ink">我们在解决什么问题</h2>
          <p className="mt-3">
            「周六去爬山，群里 20 个人说 +1，最后来了 5 个。」——组织过活动的人都懂这种挫败：
            车订了、物资买了，放鸽子的人毫无成本，认真来的人反而吃亏。
          </p>
          <p className="mt-3">
            组局的答案很简单：<strong>让「我报名」这句话变得可信</strong>。
            报名时冻结一笔保证金，到场签到后全额退还；不来的人，钱补偿给来了的人。平台一分不留。
          </p>
        </section>

        <section>
          <h2 className="text-[17px] font-semibold text-ink">三条底线</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>平台不收活动费用，不抽成，不做资金池——钱全程走持牌支付机构的冻结/解冻/分账</li>
            <li>所有资金与信用变动幂等可审计，每一次状态变化都有记录</li>
            <li>爽约不是终身污点：信用分会随守约行为恢复，有争议可申诉</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[17px] font-semibold text-ink">产品结构</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li><strong>发现组局</strong>：按分类、排序浏览正在招募的活动，报名并冻结保证金</li>
            <li><strong>主理人台</strong>：发布、管理活动，扫码核销签到</li>
            <li><strong>个人中心</strong>：报名记录、信用分与流水、申诉</li>
            <li><strong>圈子</strong>：版块制社区，关注感兴趣的版块，发帖交流（先审后发）</li>
            <li><strong>户外博客</strong>：路线攻略、装备评测、安全知识，SEO 内容沉淀</li>
          </ul>
        </section>

        <section>
          <h2 className="text-[17px] font-semibold text-ink">技术</h2>
          <p className="mt-3">
            Next.js App Router + PostgreSQL，业务代码强制注入时钟、CAS 状态机、四层幂等约束，
            41 个真数据库集成测试守护资金红线。
          </p>
        </section>

        <section>
          <h2 className="text-[17px] font-semibold text-ink">联系</h2>
          <p className="mt-3">
            建议、合作或投诉，请到 <Link href="/circle" className="text-moss-700 underline underline-offset-2">圈子</Link> 发帖，
            或通过活动页面联系主理人。
          </p>
        </section>
      </div>
    </div>
  );
}
