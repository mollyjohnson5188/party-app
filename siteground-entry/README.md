# SiteGround 入口页 —— 上传清单

你的 SiteGround 是**共享套餐**，无法运行 Next.js 的 Node 服务，因此这里只放"入口"：
访问你的域名时，可选地展示一个引导页，或直接用 301 跳转到 Vercel 上的应用。

## 文件说明

| 文件 | 用途 |
|------|------|
| `index.html` | 引导页。展示品牌 + 自动跳转。把 `APP_URL` 换成你的 Vercel 域名即可 |
| `.htaccess` | 全站 301 跳转（更彻底，用户看不到跳转过程）。二者选其一 |

## 上传步骤

1. 登录 SiteGround → **Site Tools** → **Site** → **File Manager**
2. 进入 `public_html`（若已有 WordPress 等程序，建议先清空或用子目录）
3. 上传 `index.html`（或 `.htaccess`）
4. 编辑文件，把 `https://your-app.vercel.app` 替换成你真实的 Vercel 域名

## 二选一

**方案 1：引导页（推荐）**

用户先看到品牌页，1.5 秒后跳转。适合想让用户记住域名的情况。

**方案 2：直接 301**

用户无感知跳转，Vercel 域名会出现在地址栏。适合只把 SiteGround 域名当入口。

> 注意：方案 2 需要确保 Vercel 域名已绑定，否则会跳转到 404。

## 关于 HTTPS 与 Cookie

跨域跳转后，浏览器地址栏显示的是 Vercel 域名。这意味着：
- 用户在 Vercel 域名下登录/操作
- 若想保持自有域名，应在 Vercel 控制台 **绑定自定义域名**，然后 SiteGround 域名改为 CNAME 指向 Vercel
- **这一点比跳转更优**：SiteGround 只保留域名解析，应用完全跑在 Vercel

如果你的 SiteGround 域名就是主域名，推荐做 CNAME 绑定而不是跳转，体验更好。
