# KV Manager - Docker Edition

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/kv--manager-blue?logo=github)](https://github.com/neverinfamous/kv-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/kv-manager)](https://hub.docker.com/r/writenotenow/kv-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.0.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)

*Version 1.0.0 | Last Updated: November 22, 2025*

A full-featured management platform for Cloudflare Workers KV, designed for engineering teams and large-scale workloads. Browse namespaces, run bulk operations, search across your entire KV footprint, manage metadata and tags, automate backups to R2, and secure everything with Cloudflare Access Zero Trust.

Run KV Manager in Docker with full Cloudflare KV management capabilities and enterprise authentication.

**🎯 [Live Demo](https://kv.adamic.tech/)** | **📚 [Full Documentation](https://github.com/neverinfamous/kv-manager/wiki)** | **📰 [Release Article](https://adamic.tech/articles/2025-11-05-kv-manager-v1-0-0)**

## 🐳 Quick Start

**Pull and run:**

```bash
docker pull writenotenow/kv-manager:latest

docker run -d \
  -p 8787:8787 \
  -e ACCOUNT_ID=your_cloudflare_account_id \
  -e API_KEY=your_cloudflare_api_token \
  -e TEAM_DOMAIN=https://yourteam.cloudflareaccess.com \
  -e POLICY_AUD=your_cloudflare_access_aud_tag \
  --name kv-manager \
  writenotenow/kv-manager:latest
```

Access at: http://localhost:8787

**Docker Compose:**

```yaml
version: '3.8'
services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    ports:
      - "8787:8787"
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    restart: unless-stopped
```

## ✨ Features

- **Full KV Management** - Namespaces, keys, metadata, tags, TTL
- **Bulk Operations** - Copy, delete, TTL update with progress tracking
- **R2 Backup & Restore** - Cloud-native backups
- **Search & Discovery** - Cross-namespace search with filtering
- **Job History** - Complete audit trail with event timelines
- **Enterprise Auth** - Cloudflare Access (Zero Trust)
- **Modern UI** - React + TypeScript + Tailwind CSS

**[Complete Feature List →](https://github.com/neverinfamous/kv-manager/wiki)**

## ⚙️ Configuration

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `ACCOUNT_ID` | Cloudflare Account ID |
| `API_KEY` | API Token (KV + D1 Edit permissions) |
| `TEAM_DOMAIN` | `https://yourteam.cloudflareaccess.com` |
| `POLICY_AUD` | Cloudflare Access AUD tag |

### Setup Steps

1. **Create D1 database:**
   ```bash
   npx wrangler d1 create kv-manager-metadata
   npx wrangler d1 execute kv-manager-metadata --remote --file=worker/schema.sql
   ```

2. **Get credentials:**
   - Account ID: [Cloudflare Dashboard](https://dash.cloudflare.com) URL
   - API Token: [Create token](https://dash.cloudflare.com/profile/api-tokens) with KV + D1 Edit
   - Team Domain & AUD: [Configure Cloudflare Access](https://one.dash.cloudflare.com/)

**[Complete Setup Guide →](https://github.com/neverinfamous/kv-manager/wiki/Docker-Deployment)**

## 🚀 Deployment Examples

### Production with Health Checks

```yaml
version: '3.8'
services:
  kv-manager:
    image: writenotenow/kv-manager:1.0.0  # Pin version
    ports:
      - "8787:8787"
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8787/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Behind Reverse Proxy

```yaml
version: '3.8'
services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    expose:
      - "8787"
    environment:
      - ACCOUNT_ID=${ACCOUNT_ID}
      - API_KEY=${API_KEY}
      - TEAM_DOMAIN=${TEAM_DOMAIN}
      - POLICY_AUD=${POLICY_AUD}
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.kv.rule=Host(`kv.yourdomain.com`)"
```

**[More Examples →](https://github.com/neverinfamous/kv-manager/wiki/Docker-Deployment)** - Kubernetes, Nginx, Caddy, security hardening

## 🐞 Troubleshooting

**View logs:**
```bash
docker logs kv-manager
```

**Common issues:**

| Issue | Solution |
|-------|----------|
| Container won't start | Check env vars: `docker inspect kv-manager` |
| Auth failures | Verify `TEAM_DOMAIN` includes `https://` |
| KV operations fail | Confirm API token has KV + D1 Edit permissions |
| Port conflict | Use different port: `-p 3000:8787` |

**Health check:**
```bash
curl http://localhost:8787/health
```

**[Complete Troubleshooting Guide →](https://github.com/neverinfamous/kv-manager/wiki/Troubleshooting)**

## 📈 Monitoring

**View stats:**
```bash
docker stats kv-manager
```

**Configure logging:**
```yaml
services:
  kv-manager:
    image: writenotenow/kv-manager:latest
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## 🔄 Updates

**Pull and restart:**
```bash
docker pull writenotenow/kv-manager:latest
docker-compose up -d  # or docker stop/rm/run
```

**Pin version (recommended for production):**
```yaml
services:
  kv-manager:
    image: writenotenow/kv-manager:1.0.0
```

## 📦 Image Details

- **Base:** Node.js 22-alpine
- **Size:** ~150MB
- **Architectures:** linux/amd64, linux/arm64
- **User:** Non-root
- **Health:** `/health` endpoint

**Available tags:** `latest`, `1.0.0`, `sha-XXXXXX`

## 📚 Resources

- **📖 [Full Documentation](https://github.com/neverinfamous/kv-manager/wiki)** - Complete guides and references
- **🐳 [Docker Hub](https://hub.docker.com/r/writenotenow/kv-manager)** - Image repository
- **💻 [GitHub](https://github.com/neverinfamous/kv-manager)** - Source code
- **🐛 [Issues](https://github.com/neverinfamous/kv-manager/issues)** - Bug reports
- **💭 [Discussions](https://github.com/neverinfamous/kv-manager/discussions)** - Community forum

## 💬 Support

- **📧 Email:** admin@adamic.tech
- **🛡️ Security:** See [Security Policy](https://github.com/neverinfamous/kv-manager/blob/main/SECURITY.md)

## 📄 License

MIT License - see [LICENSE](https://github.com/neverinfamous/kv-manager/blob/main/LICENSE)

---

**Made with ❤️ for the Cloudflare and Docker communities**

