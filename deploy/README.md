# Deploy Excaliflow

Arsitektur deployment:

```
┌─────────────────────────────────────┐      ┌──────────────────────────────┐
│ Cloudflare Pages                    │      │ VPS (systemd)                │
│ https://excaliflow.pages.dev        │ ───► │ https://api-flow.wfdin.my.id │
│ index.html + css + dist (frontend)  │ CORS │ Go API + MySQL               │
└─────────────────────────────────────┘      └──────────────────────────────┘
```

Karena frontend dan backend berbeda origin, dua hal wajib benar:

1. Frontend dibuild dengan `API_URL=https://api-flow.wfdin.my.id` agar
   `window.EXCALIFLOW_API_BASE` terisi (lihat `build.js`).
2. Backend mengizinkan origin frontend lewat `CORS_ORIGINS`.

Autentikasi memakai header `Authorization: Bearer <JWT>` (token di
`localStorage`), bukan cookie, jadi tidak perlu `credentials`/SameSite.

---

## 1. Backend di VPS (api-flow.wfdin.my.id)

### Struktur folder

Migrations sudah di-embed ke binary (`//go:embed`), dan file statis tidak
dipakai lagi (frontend di Pages), jadi cukup:

```
/www/wwwroot/api-flow.wfdin.my.id/
├── excaliflow     # binary hasil build (chmod +x)
└── .env           # konfigurasi DB, JWT, CORS
```

### Build binary

Di mesin lokal (cross-compile):

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -trimpath -ldflags="-s -w" -o excaliflow .
```

Atau langsung di server (butuh Go 1.25+ sesuai `go.mod`):

```sh
cd /www/wwwroot/api-flow.wfdin.my.id && go build -o excaliflow .
```

### Upload

```sh
ssh root@<vps> "mkdir -p /www/wwwroot/api-flow.wfdin.my.id"
scp excaliflow root@<vps>:/www/wwwroot/api-flow.wfdin.my.id/
scp .env      root@<vps>:/www/wwwroot/api-flow.wfdin.my.id/.env
ssh root@<vps> "chmod +x /www/wwwroot/api-flow.wfdin.my.id/excaliflow && chmod 600 /www/wwwroot/api-flow.wfdin.my.id/.env"
```

### `.env` production

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=excaliflow
DB_PASSWORD=<password-kuat>
DB_NAME=excaliflow

PORT=3000
STATIC_DIR=.

# Wajib: string acak panjang (openssl rand -hex 32)
JWT_SECRET=<string-acak-panjang>

# Origin frontend yang boleh memanggil API
CORS_ORIGINS=https://excaliflow.pages.dev
```

Catatan `CORS_ORIGINS`:

- Beberapa origin dipisah koma, misalnya
  `CORS_ORIGINS=https://excaliflow.pages.dev,https://main.excaliflow.pages.dev,https://excaliflow.wfdin.my.id`.
- Preview deployment Cloudflare Pages punya subdomain acak
  (`https://<hash>.excaliflow.pages.dev`). Kalau ingin preview ikut jalan,
  tambahkan origin-nya satu per satu atau pakai `CORS_ORIGINS=*`
  (aman di sini karena API tidak memakai cookie).
- Nilai harus origin saja: `https://domain`, tanpa path dan tanpa trailing
  slash (trailing slash otomatis dibuang oleh server).

### Database MySQL

```sql
CREATE DATABASE excaliflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'excaliflow'@'127.0.0.1' IDENTIFIED BY '<password-kuat>';
GRANT ALL PRIVILEGES ON excaliflow.* TO 'excaliflow'@'127.0.0.1';
FLUSH PRIVILEGES;
```

Migrasi tabel dijalankan otomatis saat service start.

### systemd

```sh
cp deploy/excaliflow.service /etc/systemd/system/excaliflow.service
systemctl daemon-reload
systemctl enable --now excaliflow
systemctl status excaliflow
```

Log:

```sh
tail -f /var/log/excaliflow-api.out.log /var/log/excaliflow-api.err.log
```

Restart setelah update binary:

```sh
systemctl restart excaliflow
```

### Nginx reverse proxy untuk api-flow.wfdin.my.id

Service mendengarkan `PORT` (default `3000`) di semua interface, jadi batasi
akses publik lewat Nginx/firewall dan proxy ke localhost:

```nginx
server {
    listen 80;
    server_name api-flow.wfdin.my.id;

    client_max_body_size 20m;   # payload workspace JSON bisa besar

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Aktifkan HTTPS (Certbot / panel aaPanel). Verifikasi:

```sh
curl -s http://127.0.0.1:3000/api/health          # dari server
curl -s https://api-flow.wfdin.my.id/api/health   # dari luar
# {"status":"ok","database":"connected"}
```

Cek preflight CORS (harus ada `access-control-allow-origin`):

```sh
curl -s -i -X OPTIONS https://api-flow.wfdin.my.id/api/workspaces \
  -H "Origin: https://excaliflow.pages.dev" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control
```

---

## 2. Frontend di Cloudflare Pages (excaliflow.pages.dev)

### Wajib: build dengan API_URL

`index.html` di repo berisi `window.EXCALIFLOW_API_BASE = ""` (same-origin).
`build.js` menggantinya dari env `API_URL`, jadi `dist/` yang di-commit
**tidak** bisa dipakai apa adanya untuk Pages.

Di dashboard Cloudflare Pages → **Settings → Build & deploy**:

| Setting | Value |
| --- | --- |
| Build command | `node build.js` |
| Build output directory | `dist` |
| Root directory | `/` (default) |
| Environment variable | `API_URL=https://api-flow.wfdin.my.id` |
| Node version | `>=18` (`NODE_VERSION=20` bila perlu) |

Alternatif build manual dari lokal:

```sh
API_URL=https://api-flow.wfdin.my.id node build.js
# PowerShell: $env:API_URL="https://api-flow.wfdin.my.id"; node build.js
```

lalu upload isi `dist/` sebagai artifact Pages.

### Yang tidak perlu di-upload ke Pages

- `.env` — berisi kredensial DB; tidak dipakai frontend dan sudah
  di-gitignore, jadi build Pages tidak akan melihatnya.
- `main.go`, `internal/`, `go.mod`, `migrations/` — hanya untuk backend.

`dist/index.html` bersifat standalone (CSS + JS di-inline), jadi hanya file
itu ditambah favicon yang benar-benar dipakai browser.

### Custom domain (opsional)

Kalau frontend diberi domain sendiri (mis. `excaliflow.wfdin.my.id`), domain
baru itu juga harus ditambahkan ke `CORS_ORIGINS` di `.env` backend, lalu
`systemctl restart excaliflow`.

---

## 3. Catatan operasional

- **Log rotation** (`StandardOutput=append:` menulis langsung ke file):

  ```
  # /etc/logrotate.d/excaliflow
  /var/log/excaliflow-api.*.log {
      weekly
      rotate 8
      missingok
      notifempty
      compress
      copytruncate
  }
  ```

- **Non-root user** (opsional, lebih aman). Aplikasi tidak menulis file apa
  pun, jadi cukup akses baca:

  ```sh
  useradd --system --no-create-home --shell /usr/sbin/nologin excaliflow
  chown -R excaliflow:excaliflow /www/wwwroot/api-flow.wfdin.my.id
  chmod 600 /www/wwwroot/api-flow.wfdin.my.id/.env
  ```

  Lalu ubah unit: `User=excaliflow` dan `Group=excaliflow`.

- **Beacon saat tab ditutup**: `navigator.sendBeacon()` di `beforeunload`
  tidak bisa mengirim header `Authorization`, jadi request tersebut akan
  dibalas 401 oleh API (hanya noise di log; penyimpanan normal tetap jalan).
  Bila ingin bersih, token bisa dititipkan lewat query `?token=` yang sudah
  didukung backend, atau beacon dihapus.

- **Jangan taruh `.env` di dalam folder yang disajikan sebagai file statis**
  bila `STATIC_DIR` diarahkan ke folder berisi `.env`. Pada deployment ini
  tidak menjadi masalah karena frontend tidak disajikan oleh Go, tetapi
  hati-hati bila nanti kembali ke mode satu server.
