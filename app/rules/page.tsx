import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '社区规则 | 组局圈子',
  description: '组局圈子社区规则：版块制度、发帖审核、鼓励与禁止的内容、违规处理与申诉。',
  alternates: { canonical: 'https://uismile.com/rules' },
};

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-8 text-[17px] font-semibold text-ink">{children}</h2>
);

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 text-[14px] leading-[1.9] text-stone-700">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-moss-600">COMMUNITY RULES</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-tight">社区规则</h1>
      <p className="mt-3 text-[12.5px] text-stone-400">适用范围：圈子全部版块 · 更新于 2026 年 11 月 4 日</p>

      <H>一、版块与发帖</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>圈子按版块组织（徒步、骑行、露营、装备、约伴等），请发到对应版块</li>
        <li><strong>普通用户发帖先审后发</strong>，管理员审核通过后公开；管理员发帖免审</li>
        <li>被驳回会收到理由（仅作者可见），可修改后重新提交；驳回不是处罚</li>
        <li>可关注感兴趣的版块，在首页切换「只看关注」</li>
      </ul>

      <H>二、鼓励的内容</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>路线分享与真实回顾（最好带里程、爬升、用时）</li>
        <li>装备讨论、经验教训、安全知识</li>
        <li>找同伴、答疑、帮助新人</li>
      </ul>

      <H>三、禁止的内容</H>
      <table className="mt-3 w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-stone-50 text-left">
            <th className="border border-stone-200 px-3 py-2 font-semibold">类型</th>
            <th className="border border-stone-200 px-3 py-2 font-semibold">示例</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="border border-stone-200 px-3 py-2">广告引流</td><td className="border border-stone-200 px-3 py-2">留微信号、拉群、卖货、导流外部平台</td></tr>
          <tr><td className="border border-stone-200 px-3 py-2">违法违规</td><td className="border border-stone-200 px-3 py-2">违法信息、未开放区域坐标、危险品</td></tr>
          <tr><td className="border border-stone-200 px-3 py-2">危险引导</td><td className="border border-stone-200 px-3 py-2">鼓励无保护攀爬、独行穿越、雨天走峡谷等</td></tr>
          <tr><td className="border border-stone-200 px-3 py-2">人身攻击</td><td className="border border-stone-200 px-3 py-2">辱骂、歧视、曝光他人隐私</td></tr>
          <tr><td className="border border-stone-200 px-3 py-2">虚假信息</td><td className="border border-stone-200 px-3 py-2">编造路线、冒充他人、虚假活动</td></tr>
          <tr><td className="border border-stone-200 px-3 py-2">刷屏灌水</td><td className="border border-stone-200 px-3 py-2">无意义重复内容、纯表情水帖</td></tr>
        </tbody>
      </table>

      <H>四、活动相关规则</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>报名前请如实评估自身水平；报名后不来请<strong>提前取消</strong>（全额退保证金），不要爽约</li>
        <li>主理人应如实描述路线、强度与集合信息，无正当理由不得随意取消活动</li>
        <li>活动不支持延期；确需改期的请「取消并重发」，原报名保证金将全额退还</li>
        <li>禁止以任何形式收取平台以外的「报名费」用于营利</li>
      </ul>

      <H>五、违规处理</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>首次轻微违规：驳回内容并告知理由</li>
        <li>重复或严重违规：限制发帖、限制报名，直至封禁账号</li>
        <li>涉嫌违法的，保留证据并配合有关部门</li>
      </ul>

      <H>六、申诉</H>
      <p className="mt-3">
        对内容处理或爽约判定不服的，可在 7 日内通过 <Link href="/me?tab=credit" className="text-moss-700 underline underline-offset-2">个人中心 · 信用中心</Link> 提交申诉，
        平台将据实复核并在 3 个工作日内答复。
      </p>

      <H>七、规则修订</H>
      <p className="mt-3">社区规则会随产品演进修订，重大变更在圈子公告版块公示。</p>
    </div>
  );
}
