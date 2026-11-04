import { redirect } from 'next/navigation';

/** 旧入口已合并到个人中心，保留路由做 301 兼容 */
export default function MineRedirect() {
  redirect('/me');
}
