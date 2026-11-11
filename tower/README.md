# html-tower — 技术手稿馆上传楼层服务

后台上传的 HTML 页面 = 08 号楼（技术手稿馆）3F 起的一层新楼层。只用 Python 标准库，容器常驻内存约 15–35 MB。

| 路径 | 说明 |
| --- | --- |
| `GET /tower/api/pages` | 公开只读列表，前端 3D 大楼运行时拉取（每 60 秒/切回页面时刷新） |
| `GET /tower/p/<id>.html` | 上传页面本体，带 `Content-Security-Policy: sandbox …`（不含 allow-same-origin），脚本拿不到主站 cookie/localStorage |
| `GET /tower-admin/` | 后台页面（不在站内链接，`noindex`），密码登录 |
| `POST /tower-admin/api/login` | `{"password"}` → HttpOnly + Secure + SameSite=Strict 会话 cookie（7 天）；每 IP 5 次/分钟、全局 20 次/分钟 |
| `GET/POST /tower-admin/api/pages` | 列表 / 上传（multipart `file` .html/.htm ≤5MB，可选 `title`） |
| `PATCH/DELETE /tower-admin/api/pages/<id>` | 改标题 / 删除 |

## 部署（服务器 /opt/html-tower）

```
/opt/html-tower/app/{server.py,admin.html,Dockerfile}
/opt/html-tower/docker-compose.yml   # 本目录同名文件
/opt/html-tower/data/                # pages.json + pages/<id>.html
/opt/html-tower/.env                 # chmod 600：ADMIN_PASSWORD_HASH、SESSION_SECRET
```

- 生成密码哈希（scrypt，不落明文）：`python3 server.py hash`，从标准输入读一行密码。
- 改密码：替换 `.env` 里的 `ADMIN_PASSWORD_HASH`，`docker compose -p html-tower up -d`。
- nginx：`location ^~ /tower/` 与 `location ^~ /tower-admin` 反代到 `127.0.0.1:3004`，`client_max_body_size 6m`。
- 测试：`python3 -m unittest tower/test_server.py`。
