// Inline critical CSS for every Worker-rendered page. Values are the packages/ui tokens (E1–E10);
// the survey uses self-hosted Plus Jakarta Sans with font-display:swap, so first paint never waits for it.
//
// Recommendation scale (0–10): each digit sits dead centre. The number span used to inherit the
// generic `.num{min-width:20px}` with left-aligned text, so single digits sat ~5px left of centre in
// their box; only "10" filled the 20px and looked right. The NPS box is now a centring grid cell, the
// number has no minimum width, no letter-spacing and tabular figures, and the selected state swaps a
// 1px border for 2px on every side, so it stays centred.
// Submit overlay (.sv-ov): blurs and locks the form while the feedback is sent, then the spinner
// morphs into a drawn tick (stroke-dashoffset) when the server confirms.
export const CSS = `
@font-face{font-family:'Plus Jakarta Sans';font-style:normal;font-weight:200 800;font-display:swap;src:url('/fonts/plus-jakarta-sans-latin-wght-v5.woff2') format('woff2')}
:root{--brand:#1108bf;--brand-700:#0d0699;--brand-50:#ecebfb;--accent:#fbde04;--ink:#111;--text2:#545454;
--border:#d3d3d3;--border-strong:#8a8a8a;--danger:#b42332;--danger-bg:#fdecee;--warn:#8a5a00;--warn-bg:#fff4db;
--subtle:#f7f7f7;--font:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;
--ease:cubic-bezier(.2,0,0,1);--sel:120ms;--page:240ms;--fast:200ms}
@media (prefers-reduced-motion:reduce){:root{--sel:0ms;--page:0ms;--fast:0ms}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font:16px/24px var(--font);color:var(--ink);background:#fff;border-top:4px solid var(--accent)}
a{color:var(--brand)}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px;box-shadow:0 0 0 2px #fff}
[tabindex="-1"]:focus{outline:none}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.wrap{max-width:592px;margin:0 auto;padding:0 16px}
.top{display:flex;align-items:center;justify-content:space-between;min-height:64px;gap:16px}
.logo{display:block;height:32px;width:auto}
.step{margin:0;font-size:14px;line-height:20px;color:var(--text2)}
.bar{display:flex;gap:4px;margin:0 0 16px}
.bar span{flex:1;height:4px;border-radius:2px;background:var(--brand-50)}
.bar span[data-on]{background:var(--brand)}
.no-js .js-only{display:none!important}
.js .nojs-only{display:none!important}
.js .page:not([data-current]){display:none}
.js .q[data-off]{display:none}
.page{padding:0 0 24px}
.no-js .page+.page{border-top:1px solid var(--border);padding-top:24px}
.page.enter{animation:in var(--page) var(--ease)}
.page.enter-back{animation:back var(--page) var(--ease)}
@keyframes in{from{opacity:0;transform:translateX(24px)}}
@keyframes back{from{opacity:0;transform:translateX(-24px)}}
@media (prefers-reduced-motion:reduce){.page.enter,.page.enter-back{animation:none}}
.sec{margin:0 0 4px;font-size:14px;color:var(--text2)}
h1{font-size:28px;line-height:36px;font-weight:500;letter-spacing:-.5px;margin:4px 0 12px}
.lead{margin:0 0 24px;color:var(--text2)}
.q{margin:0 0 24px}
.q[data-reveal]{animation:reveal var(--fast) var(--ease)}
@keyframes reveal{from{opacity:0;max-height:0}to{opacity:1;max-height:480px}}
fieldset{border:0;margin:0;padding:0;min-width:0}
legend,.ql{display:block;padding:0;margin:0 0 12px;font-size:18px;line-height:24px;font-weight:600}
.help,.hint{margin:-4px 0 12px;font-size:14px;line-height:20px;color:var(--text2)}
.hint{font-style:italic}
.opts{display:grid;gap:8px}
.opt{position:relative;display:block;cursor:pointer}
.opt input{position:absolute;z-index:1;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.box{display:flex;align-items:center;gap:12px;min-height:56px;padding:12px 44px 12px 16px;border:1px solid var(--border-strong);
border-radius:12px;background:#fff;transition:border-color var(--sel),background-color var(--sel);position:relative}
.tick{position:absolute;right:14px;top:50%;width:20px;height:20px;margin-top:-10px;opacity:0;color:var(--brand)}
.opt input:checked+.box{border:2px solid var(--brand);background:var(--brand-50);padding:11px 43px 11px 15px}
.opt input:checked+.box .tick{opacity:1}
.opt input:focus-visible+.box{outline:2px solid var(--brand);outline-offset:2px}
.chips .box{min-height:48px;padding:8px 36px 8px 12px;font-size:15px;line-height:20px}
.chips .opt input:checked+.box{padding:7px 35px 7px 11px}
.chips .tick{right:10px}
@media (min-width:360px){.chips{grid-template-columns:1fr 1fr}}
.num{font-weight:600;min-width:20px}
@media (min-width:810px){
.scale5{grid-template-columns:repeat(5,1fr)}
.scale5 .box{flex-direction:column;justify-content:center;text-align:center;min-height:112px;padding:12px 8px}
.scale5 .opt input:checked+.box{padding:11px 7px}
.scale5 .tick{top:10px;right:10px;margin:0}}
.nps{grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
.nps .box{display:grid;place-items:center;gap:0;padding:0;min-height:48px;font-weight:600;line-height:1;text-align:center}
.nps .num{min-width:0;font-variant-numeric:tabular-nums;letter-spacing:0}
.nps .opt input:checked+.box{padding:0}
.nps .tick{display:none}
@media (max-width:359px){.nps{gap:4px}.nps .box{min-height:44px}}
@media (min-width:600px){.nps{grid-template-columns:repeat(11,minmax(0,1fr));gap:4px}}
.anchors{display:flex;justify-content:space-between;gap:16px;margin:8px 0 0;font-size:14px;color:var(--text2)}
input[type=text],input[type=tel],select,textarea{display:block;width:100%;min-height:48px;padding:11px 12px;font:inherit;color:var(--ink);
background:#fff;border:1px solid var(--border-strong);border-radius:12px}
textarea{min-height:120px;resize:vertical}
select{appearance:auto}
.counter{margin:4px 0 0;font-size:14px;color:var(--text2);text-align:right}
.switch{display:flex;align-items:center;gap:12px;min-height:48px;cursor:pointer;font-weight:600}
.switch input{appearance:none;-webkit-appearance:none;flex:none;width:52px;height:32px;margin:0;border-radius:16px;background:var(--border-strong);
position:relative;cursor:pointer;transition:background-color var(--sel)}
.switch input::before{content:'';position:absolute;top:4px;left:4px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform var(--sel)}
.switch input:checked{background:var(--brand)}
.switch input:checked::before{transform:translateX(20px)}
.err{display:block;margin:8px 0 0;font-size:14px;line-height:20px;color:var(--danger);font-weight:600}
.err:empty{display:none}
.q[data-invalid] .box,.q[data-invalid] select,.q[data-invalid] input[type=tel],.q[data-invalid] input[type=text]{border-color:var(--danger)}
.q[data-flash]{animation:flash 1.2s ease-out}
@keyframes flash{0%,40%{background:var(--danger-bg)}100%{background:transparent}}
.actions{position:sticky;bottom:0;z-index:1;margin:8px -16px 0;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:#fff;
box-shadow:0 -1px 0 var(--border)}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:0 24px;border:0;border-radius:9999px;
font:inherit;font-size:18px;font-weight:600;cursor:pointer;background:var(--brand);color:#fff;text-decoration:none}
.btn:hover{background:var(--brand-700)}
.btn[aria-disabled=true]{background:var(--border);color:var(--text2)}
.btn[aria-busy=true]{cursor:progress}
.btn-secondary{background:#fff;color:var(--brand);box-shadow:inset 0 0 0 2px var(--brand)}
.btn-secondary:hover{background:var(--brand-50,#eef4f2);color:var(--brand-700)}
.spin{width:20px;height:20px;border:3px solid rgb(255 255 255 / .4);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
@media (prefers-reduced-motion:reduce){.spin{animation-duration:2.4s}}
@keyframes spin{to{transform:rotate(360deg)}}
.back{display:inline-flex;align-items:center;gap:4px;min-height:48px;min-width:48px;padding:0 12px 0 4px;margin:0 0 0 -4px;border:0;
background:none;color:var(--brand);font:inherit;font-weight:600;cursor:pointer}
.back svg{width:20px;height:20px}
.banner{margin:0 0 12px;padding:12px 16px;border-radius:12px;background:var(--warn-bg);color:#5c3c00}
.banner:empty{display:none}
.summary{margin:0 0 24px;padding:16px;border-radius:12px;background:var(--danger-bg);color:var(--danger)}
.summary ul{margin:8px 0 0;padding-left:20px}
.foot{margin:24px 0 32px;font-size:14px}
.thanks{margin:16px 0 24px;padding:32px 24px;border-radius:24px;background:var(--brand);color:#fff}
.thanks h1{color:#fff;margin:12px 0 16px}
.thanks p{margin:0 0 12px}
.thanks .ref{font-size:20px;line-height:28px;font-weight:600;letter-spacing:.5px}
.leaf{width:32px;height:32px;color:var(--accent)}
.prose h2{font-size:20px;line-height:28px;font-weight:600;margin:28px 0 8px}
.prose p,.prose li{color:#2b2b2b}
.prose ul{padding-left:20px}
#sv-ts:empty{display:none}
.resume .choices{display:grid;gap:12px;margin:8px 0 0}
.resume .lead{margin-bottom:24px}
.sv-ov{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:16px;background:rgb(255 255 255 / .62);
-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);animation:ov-in var(--fast) var(--ease)}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.sv-ov{background:rgb(255 255 255 / .94)}}
.sv-ov[data-leaving]{opacity:0;transition:opacity var(--fast) var(--ease)}
@keyframes ov-in{from{opacity:0}}
html.sv-locked,html.sv-locked body{overflow:hidden}
.sv-card{display:flex;flex-direction:column;align-items:center;gap:16px;width:100%;max-width:320px;padding:32px 24px;border-radius:24px;
background:#fff;box-shadow:0 0 0 1px var(--border),0 16px 48px rgb(17 8 191 / .14);text-align:center;animation:card-in var(--page) var(--ease)}
.sv-card:focus{outline:none}
@keyframes card-in{from{opacity:0;transform:translateY(8px) scale(.98)}}
.sv-card p{margin:0;font-size:18px;line-height:24px;font-weight:600}
.sv-icon{position:relative;width:64px;height:64px}
.sv-icon svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.sv-spin{animation:spin .9s linear infinite}
.sv-ring{fill:transparent;stroke:var(--brand);stroke-width:4;stroke-linecap:round;stroke-dasharray:144.5;stroke-dashoffset:104;
transition:stroke-dashoffset .3s var(--ease),fill .25s var(--ease) .25s}
.sv-check{fill:none;stroke:#fff;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:30;stroke-dashoffset:30;
transition:stroke-dashoffset .35s var(--ease) .4s}
.sv-ov[data-done] .sv-ring{stroke-dashoffset:0;fill:var(--brand)}
.sv-ov[data-done] .sv-check{stroke-dashoffset:0}
@media (prefers-reduced-motion:reduce){.sv-ov,.sv-card{animation:none}.sv-spin{animation:pulse 1.6s ease-in-out infinite}
.sv-ring,.sv-check{transition:none}.sv-ov[data-done] .sv-spin{animation:none}}
@keyframes pulse{50%{opacity:.45}}
#sv-ts{margin:0 0 12px}
`
  .replace(/\n/g, '')
  // Never strip around "+" or "-": calc() needs those spaces.
  .replace(/\s*([{};,>])\s*/g, '$1');
