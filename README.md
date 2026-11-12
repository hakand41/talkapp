# TalkApp

TalkApp, WebRTC ve WebSocket protokolleri üzerine inşa edilmiş, hafif ve bağımsız bir sesli ve yazılı iletişim platformudur. Düşük sistem kaynağı (RAM ve CPU) tüketimi hedeflenerek tasarlanmıştır.

## Özellikler

- **Ses İletişimi:** Opus codec (48 kHz) destekli, düşük gecikmeli WebRTC ses kanalları.
- **Akıllı Ses Filtresi:** Desibel tabanlı gürültü kapısı (Noise Gate), yüksek geçiren filtre (85 Hz) ve peak limiter.
- **Metin Kanalları ve Özel Mesajlaşma (DM):** Gerçek zamanlı mesajlaşma, dosya ve görsel paylaşımı.
- **Yerleşik Veritabanı:** Harici SQL sunucusuna ihtiyaç duymadan Node.js yerleşik `node:sqlite` motoru ile kalıcı veri yönetimi.
- **Çoklu Sunucu ve Kanal Desteği:** Özelleştirilebilir roller, izinler ve şifreli odalar.
- **Web Push Bildirimleri:** Mobil ve masaüstü tarayıcılarda arka plan ve kilit ekranı bildirimleri.
- **Ekran ve Video Paylaşımı:** Sistem sesiyle birlikte ekran yayını.
- **Platform Desteği:** Modern web tarayıcıları, Android (PWA/Capacitor) ve Windows masaüstü istemcisi.

---

## Kurulum ve Çalıştırma

### Gereksinimler

- Node.js 22 veya üzeri (yerel çalıştırma için)
- Docker ve Docker Compose (sunucu kurulumu için önerilir)

### 1. Docker ile Hızlı Kurulum (Önerilen)

1. Projeyi indirin ve dizine girin:
   ```bash
   git clone https://github.com/hakand41/talkapp.git
   cd talkapp
   ```

2. Ortam değişkenleri dosyasını oluşturun:
   ```bash
   cp .env.example .env
   ```
   `.env` dosyasını kendi alan adınız ve sunucu IP bilginizle düzenleyin.

3. Konteynerleri başlatın:
   ```bash
   docker compose up -d
   ```

4. Tarayıcınızda açın:
   `http://SUNUCU_IP:3000` (veya yapılandırdığınız alan adı)

---

### 2. Yerel Geliştirme (Docker Olmadan)

```bash
# Bağımlılıkları yükleyin
npm install

# Uygulamayı başlatın
npm start
```

Uygulama varsayılan olarak `http://localhost:3000` portunda çalışacaktır.

---

## İlk Yönetici (Admin) Girişi

Veritabanı ilk kez oluşturulduğunda varsayılan yönetici hesabı otomatik tanımlanır:

- **Kullanıcı Adı:** `admin`
- **Varsayılan Şifre:** `admin123` (veya `.env` içindeki `ADMIN_DEFAULT_PASSWORD`)

> **Önemli:** Güvenliğiniz için ilk giriş yaptıktan sonra Ayarlar panelinden yönetici şifrenizi değiştiriniz.

---

## Ortam Değişkenleri (.env)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | HTTP/WebSocket servis portu |
| `SERVER_DOMAIN` | `localhost` | Sunucunun alan adı |
| `PUBLIC_IP` | `127.0.0.1` | Sunucunun dış IP adresi |
| `NODE_ENV` | `production` | Çalışma modu |
| `ADMIN_DEFAULT_PASSWORD` | `admin123` | İlk kurulumdaki yönetici şifresi |
| `TURN_USERNAME` | `talkapp` | Coturn TURN kullanıcı adı |
| `TURN_CREDENTIAL` | `talkapppass` | Coturn TURN erişim anahtarı |

---

## Nginx Reverse Proxy ve SSL Yapılandırması

Sunucuda Nginx arkasında çalıştırmak için örnek Nginx bloğu:

```nginx
server {
    listen 80;
    server_name talkapp.alanadiniz.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name talkapp.alanadiniz.com;

    ssl_certificate /etc/letsencrypt/live/talkapp.alanadiniz.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/talkapp.alanadiniz.com/privkey.pem;

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Lisans

Bu proje MIT lisansı ile lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakabilirsiniz.
