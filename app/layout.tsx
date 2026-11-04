import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "组局 · 白领户外活动",
  description: "保证金制的白领户外组局平台，到场全额退还，爽约补偿守约者。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        {/* 隐藏 Netlify 注入的推广角标（iframe #nl-badge-frame） */}
        <style>{`#nl-badge-frame{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}`}</style>
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){var kill=function(){var f=document.getElementById("nl-badge-frame");if(f)f.remove()};try{new MutationObserver(kill).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}document.addEventListener("DOMContentLoaded",kill)})();',
          }}
        />
        <SiteHeader />
        <main className="relative z-10 flex-1">{children}</main>
        <footer className="relative z-10 mt-16 border-t border-stone-200/70 py-8">
          <div className="mx-auto max-w-6xl px-5">
            <nav className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px]">
              <a href="/" className="text-stone-600 hover:text-moss-700">发现组局</a>
              <a href="/circle" className="text-stone-600 hover:text-moss-700">圈子</a>
              <a href="/blog" className="text-stone-600 hover:text-moss-700">户外博客</a>
              <a href="/host" className="text-stone-600 hover:text-moss-700">发起组局</a>
            </nav>
            <nav className="mb-5 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-stone-400">
              <a href="/about" className="hover:text-moss-700">关于我们</a>
              <a href="/rules" className="hover:text-moss-700">社区规则</a>
              <a href="/terms" className="hover:text-moss-700">用户协议</a>
              <a href="/privacy" className="hover:text-moss-700">隐私政策</a>
              <a href="/thanks" className="hover:text-moss-700">致谢</a>
            </nav>
            <div className="border-t border-stone-200/60 pt-5 text-[12px] leading-relaxed text-muted">
            <p>
              组局 MVP · 平台不代收活动费用，仅处理保证金。保证金通过持牌支付通道冻结，
              到场核销后原路全额退还。
            </p>
            <p className="mt-1">
              爽约扣划全部用于补偿到场参与者，平台不截留、不收服务费。
            </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
