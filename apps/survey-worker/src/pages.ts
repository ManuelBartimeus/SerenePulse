import { html } from 'hono/html';

/** S-C8 "Service unavailable": no form is shown, so no answers can be lost. */
export const unavailablePage = (nonce: string) =>
  html`<!doctype html>
    <html lang="en-GH">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Serene Insurance feedback</title>
        <style nonce="${nonce}">
          body {
            margin: 0;
            font:
              16px/24px system-ui,
              -apple-system,
              'Segoe UI',
              Roboto,
              Arial,
              sans-serif;
            color: #111;
            background: #fff;
            border-top: 4px solid #fbde04;
          }
          main {
            max-width: 560px;
            margin: 0 auto;
            padding: 48px 16px;
          }
          h1 {
            font-size: 28px;
            line-height: 36px;
            font-weight: 500;
            margin: 0 0 12px;
          }
          p {
            color: #545454;
            margin: 0;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>We can&rsquo;t take feedback right now.</h1>
          <p>Please try again a little later.</p>
        </main>
      </body>
    </html>`;
