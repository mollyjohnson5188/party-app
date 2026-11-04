import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '致谢 | 组局',
  description: '组局平台感谢这些开源项目与服务：Next.js、PostgreSQL、Netlify、Neon、Tailwind CSS 等。',
  alternates: { canonical: 'https://uismile.com/thanks' },
};

const groups: { title: string; items: { name: string; desc: string }[] }[] = [
  {
    title: '开源软件',
    items: [
      { name: 'Next.js', desc: 'App Router / Partial Prerendering —— 站点骨架与渲染架构' },
      { name: 'React', desc: '组件模型' },
      { name: 'PostgreSQL', desc: '核心数据库，约束即业务：幂等、状态机全靠它' },
      { name: 'Tailwind CSS', desc: '样式系统' },
      { name: 'Vitest', desc: '测试框架，41 个真库集成测试' },
      { name: 'node-postgres', desc: '数据库驱动' },
    ],
  },
  {
    title: '云服务',
    items: [
      { name: 'Netlify', desc: '托管与全球分发' },
      { name: 'Neon', desc: 'Serverless PostgreSQL' },
      { name: 'GitHub', desc: '代码托管' },
      { name: 'Let\u2019s Encrypt', desc: 'TLS 证书' },
      { name: '阿里云', desc: '域名与 DNS 解析' },
    ],
  },
  {
    title: '特别感谢',
    items: [
      { name: '每一位早期用户', desc: '你们的每一次「到场」和「取消」，都在帮我们验证保证金制是否成立' },
      { name: '首批主理人', desc: '在没人看好的时候发起了第一局' },
      { name: '提意见的人', desc: '所有的「这里不好用」，都变成了产品迭代' },
    ],
  },
];

export default function ThanksPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 text-[14px] leading-[1.9] text-stone-700">
      <p className="text-[11.5px] font-medium uppercase tracking-[0.18em] text-moss-600">ACKNOWLEDGEMENTS</p>
      <h1 className="mt-2 text-[30px] font-semibold tracking-tight">致谢</h1>
      <p className="mt-4">
        这个平台站在无数开源贡献者与服务的肩膀上。以下排名不分先后：
      </p>

      {groups.map((g) => (
        <section key={g.title} className="mt-8">
          <h2 className="text-[17px] font-semibold text-ink">{g.title}</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {g.items.map((it) => (
              <div key={it.name} className="card p-4">
                <p className="text-[13.5px] font-semibold text-ink">{it.name}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{it.desc}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <p className="mt-10 border-t border-stone-200/70 pt-6 text-[12.5px] text-stone-400">
        各项目版权归其作者所有。若你认为自己应被列入而未列入，请联系我们补上。
      </p>
    </div>
  );
}
