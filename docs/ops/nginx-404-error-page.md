# Patch note (NOT applied): serve the branded 404

Status: prepared on branch `feat/ui-refresh`, **not applied** to the server.

Today nginx answers unknown paths with its built-in "404 Not Found" page because the static
`location /` ends in `try_files … =404` with no `error_page`. The Next export already writes the
branded page to `out/404.html` (source: `app/not-found.tsx`, `app/styles/not-found.css`).

File: `/etc/nginx/sites-available/10-sn0vv-top` (symlinked from `sites-enabled`), server block
`server_name sn0vv.top www.sn0vv.top;` (443).

```diff
     # 落地页
     location / {
         root /opt/web-luodi/out;
         index index.html;
         try_files $uri $uri/ $uri.html =404;
+        error_page 404 /404.html;
         add_header Cache-Control "no-cache, must-revalidate" always;
     }
```

Scope: only the static site. Proxied locations (`/tower/`, `/tower-admin`, `/quantify/`, `/news/api/`,
`/guestbook/api/`, `/openclaw`, `/wxqr/`) keep their upstream responses (no `proxy_intercept_errors`).
The status code stays 404.

Apply (after the site deploy that ships the new `out/404.html`):

```bash
cp /etc/nginx/sites-available/10-sn0vv-top /etc/nginx/backups/10-sn0vv-top.bak-$(date +%Y%m%d%H%M%S)
# insert the error_page line shown above
nginx -t && systemctl reload nginx
curl -s -o /dev/null -w '%{http_code}\n' https://sn0vv.top/no-such-page   # expect 404
curl -s https://sn0vv.top/no-such-page | grep -c 'not-found'               # expect >= 1
```

Rollback: copy the backup back, `nginx -t && systemctl reload nginx`.
