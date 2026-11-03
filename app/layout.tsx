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
        <SiteHeader />
        <main className="relative z-10 flex-1">{children}</main>
        <footer className="relative z-10 mt-16 border-t border-stone-200/70 py-8">
          <div className="mx-auto max-w-6xl px-5 text-[12px] leading-relaxed text-muted">
            <p>
              组局 MVP · 平台不代收活动费用，仅处理保证金。保证金通过持牌支付通道冻结，
              到场核销后原路全额退还。
            </p>
            <p className="mt-1">
              爽约扣划全部用于补偿到场参与者，平台不截留、不收服务费。
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
