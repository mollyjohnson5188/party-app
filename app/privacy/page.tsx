import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '隐私政策 | 组局',
  description: '组局平台隐私政策：我们收集哪些信息、如何使用与保护、你的权利与注销方式。',
  alternates: { canonical: 'https://uismile.com/privacy' },
};

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-8 text-[17px] font-semibold text-ink">{children}</h2>
);

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 text-[14px] leading-[1.9] text-stone-700">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-moss-600">PRIVACY POLICY</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-tight">隐私政策</h1>
      <p className="mt-3 text-[12.5px] text-stone-400">更新日期：2026 年 11 月 4 日</p>

      <p className="mt-5">
        我们只收集让「组局 + 保证金」运转所必需的最少信息，<strong>不卖数据、不做用户画像广告</strong>。
      </p>

      <H>一、我们收集的信息</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li><strong>账号信息</strong>：手机号、昵称、头像（可为虚拟形象）。密码仅以单向加密（scrypt）形式存储，任何人（包括我们）都无法还原</li>
        <li><strong>登录凭证</strong>：会话令牌。数据库中仅存令牌的 SHA-256 摘要，Cookie 为 httpOnly</li>
        <li><strong>活动信息</strong>：你发布的活动、报名记录、签到记录</li>
        <li><strong>保证金记录</strong>：冻结、退还、扣划的状态流水。支付由持牌机构处理，<strong>我们不收集也不存储你的银行卡号、支付密码等敏感支付信息</strong></li>
        <li><strong>社区内容</strong>：你在圈子发布的帖子、回复、关注关系</li>
        <li><strong>日志</strong>：为安全审计而记录的操作日志（含 IP），仅用于纠纷处理与滥用防护</li>
      </ul>

      <H>二、我们如何使用</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>提供报名、签到、保证金冻结/退还/扣划等核心功能</li>
        <li>计算并展示信用分，供主理人判断报名可靠性</li>
        <li>审核社区内容、处理申诉与纠纷</li>
        <li>发送与你的活动直接相关的通知（报名确认、签到提醒等）</li>
      </ul>
      <p className="mt-3">我们<strong>不会</strong>：向第三方出售你的个人信息；将你的信息用于与平台无关的广告 profiling。</p>

      <H>三、共享</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li><strong>持牌支付机构</strong>：为完成保证金冻结与退还，必要的订单信息会传递给支付服务方</li>
        <li><strong>其他用户</strong>：你的昵称、头像、信用分会展示在活动报名与社区场景；手机号<strong>不会</strong>向其他用户公开</li>
        <li><strong>法律要求</strong>：依法律法规或司法机关要求时</li>
      </ul>

      <H>四、存储与保护</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>数据存储于加密云数据库（境外节点），传输全程 TLS 加密</li>
        <li>敏感操作（支付回调、定时任务、管理接口）均需签名或管理员会话鉴权</li>
        <li>所有资金与信用状态变更均有审计日志，防止篡改</li>
      </ul>

      <H>五、你的权利</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>查询、更正你的账号信息（个人中心内自助）</li>
        <li>删除你发布的帖子与活动（站内自助或联系运营者）</li>
        <li><strong>注销账号</strong>：结清保证金事项后可申请注销；注销后昵称等身份信息将停用，依法需留存的交易与审计记录将按期限保存</li>
      </ul>

      <H>六、未成年人</H>
      <p className="mt-3">本平台面向成年人。未成年人应在监护人同意与陪同下使用，监护人承担相应责任。</p>

      <H>七、政策更新</H>
      <p className="mt-3">重大变更将在站内公示。继续使用即表示接受更新后的政策。</p>

      <H>八、联系</H>
      <p className="mt-3">隐私相关问题请通过圈子发帖或页面底部渠道联系运营者，我们将在 15 个工作日内回复。</p>
    </div>
  );
}
