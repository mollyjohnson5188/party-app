import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '用户协议 | 组局',
  description: '组局平台用户服务协议：账号、保证金规则、活动责任、社区行为规范与免责条款。',
  alternates: { canonical: 'https://uismile.com/terms' },
};

const H = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-8 text-[17px] font-semibold text-ink">{children}</h2>
);

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 text-[14px] leading-[1.9] text-stone-700">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-moss-600">TERMS OF SERVICE</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-tight">用户协议</h1>
      <p className="mt-3 text-[12.5px] text-stone-400">生效日期：2026 年 11 月 4 日 · 注册或使用本平台即视为同意本协议</p>

      <H>一、平台性质</H>
      <p className="mt-3">
        「组局」（以下简称"本平台"）是一个为户外活动发起者与参与者提供信息发布、报名管理与保证金担保工具的网络信息服务提供者。
        本平台<strong>不组织、不经营任何具体户外活动</strong>，活动均由用户（"主理人"）自发发起；
        本平台不代收活动费用、不参与活动分成、不从保证金中截留任何款项。
      </p>

      <H>二、账号</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>注册需提供真实手机号；你应对账号下的全部行为负责</li>
        <li>不得出借、转让账号；发现被盗用应立即通过平台处理</li>
        <li>管理员账号通过邀请码产生，管理员权限仅限内容审核与争议处理</li>
      </ul>

      <H>三、保证金规则（核心条款）</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li><strong>冻结</strong>：报名开启保证金的活动时，通过持牌支付机构对保证金做预授权冻结，资金不进入本平台账户</li>
        <li><strong>退还</strong>：在签到窗口内（活动开始前 60 分钟至开始后 120 分钟）完成签到核销的，保证金原路全额退还；用户取消报名、主理人取消或活动取消的，保证金全额退还</li>
        <li><strong>扣划</strong>：活动开始 120 分钟后仍未签到的，系统自动判定爽约，被扣划的保证金<strong>全额</strong>按规则分配给实际到场签到者，平台不截留</li>
        <li><strong>申诉</strong>：对爽约判定有异议的，可在判定后 7 日内提交申诉，平台据实复核</li>
        <li>保证金相关规则详见活动页公示；本平台不提供任何形式的"余额""钱包"服务</li>
      </ul>

      <H>四、活动与安全责任</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>户外活动存在固有风险（包括但不限于坠落、失温、山洪、野生动物、交通意外）。参与前应真实评估自身体能、健康状况与装备</li>
        <li><strong>主理人</strong>对其发布的活动信息真实性负责，负有路线说明、集合组织、签到核销与紧急情况处置的合理义务</li>
        <li><strong>参与者</strong>系自愿参加，为具备完全民事行为能力人（未成年人须由监护人陪同并承担全部责任），应对自身安全负责</li>
        <li>参与者之间自愿产生的费用分摊（车费、AA 等）属民事约定，与本平台无关</li>
        <li>法律规定应由活动组织者承担的责任，由主理人依法承担；本平台作为信息服务提供者依法承担相应责任</li>
      </ul>

      <H>五、社区行为规范</H>
      <ul className="mt-3 list-disc space-y-1.5 pl-5">
        <li>禁止发布违法违规、侵权、虚假或引人误解的信息</li>
        <li>禁止广告引流、诈骗、营销骚扰</li>
        <li>禁止组织进入未开放区域、发布危险路线而不作风险提示</li>
        <li>圈子内容采用"先审后发"机制，详见《社区规则》；违规内容将被驳回，账号可被限制</li>
      </ul>

      <H>六、知识产权</H>
      <p className="mt-3">
        平台界面、商标、代码及编译后内容归本平台所有；用户发布的内容授予本平台为运营所必需的展示与分发权利，
        原著作权利归用户本人。转载他人内容需获授权。
      </p>

      <H>七、服务变更与终止</H>
      <p className="mt-3">
        本平台可持续更新功能与规则，重大变更将在站内公示。你可随时停止使用并注销账号；
        注销前应结清保证金相关事项。
      </p>

      <H>八、免责与责任限制</H>
      <p className="mt-3">
        因不可抗力、网络故障、第三方支付机构原因导致服务中断或资金延迟的，本平台不承担由此产生的间接损失。
        本平台对活动的真实性与履行不作担保，用户应自行谨慎判断。
      </p>

      <H>九、法律适用</H>
      <p className="mt-3">
        本协议适用中华人民共和国法律。因本协议产生的争议，双方应友好协商；协商不成的，
        提交本平台运营者所在地有管辖权的人民法院诉讼解决。
      </p>

      <H>十、其他</H>
      <p className="mt-3">
        本协议与《隐私政策》《社区规则》共同构成完整约定。若有疑问，请通过圈子或页面底部方式联系运营者。
      </p>
    </div>
  );
}
