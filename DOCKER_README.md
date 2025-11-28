# KV Manager - Docker Edition

Last Updated November 27, 2025 - Production/Stable Version 1.0.0 

## Tech Stack

**Frontend**: React 19.2.0 | Vite 7.2.4 | TypeScript 5.9.3 | Tailwind CSS | shadcn/ui 
**Backend**: Cloudflare Workers + KV + D1 + R2 + Durable Objects + Zero Trust

[![GitHub](https://img.shields.io/badge/GitHub-neverinfamous/kv--manager-blue?logo=github)](https://github.com/neverinfamous/kv-manager)
[![Docker Pulls](https://img.shields.io/docker/pulls/writenotenow/kv-manager)](https://hub.docker.com/r/writenotenow/kv-manager)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Version](https://img.shields.io/badge/version-v1.0.0-green)
![Status](https://img.shields.io/badge/status-Production%2FStable-brightgreen)
[![Security](https://img.shields.io/badge/Security-Enhanced-green.svg)](https://github.com/neverinfamous/kv-manager/blob/main/SECURITY.md)
[![Type Safety](https://img.shields.io/badge/TypeScript-Strict-blue.svg)](https://github.com/neverinfamous/kv-manager/)

A full-featured management platform for Cloudflare Workers KV, designed for engineering teams and large-scale workloads. Browse namespaces, run bulk operations, search across your entire KV footprint, manage metadata and tags, automate backups to R2, and secure everything with Cloudflare Access Zero Trust.

**[Live Demo](https://kv.adamic.tech/)** • **[GitHub](https://github.com/neverinfamous/kv-manager)** • **[Wiki](https://github.com/neverinfamous/kv-manager/wiki)** •  • **[Changelog](https://github.com/neverinfamous/kv-manager/wiki/Changelog)** • **[Release Article](https://adamic.tech/articles/2025-11-05-kv-manager-v1-0-0)**

## ✨ Key Features

- **🗂️ Namespace & Key Management** - Full CRUD operations with cursor-based pagination
- **📊 Dual Metadata System** - KV Native (1024 bytes) + D1 Custom (unlimited) metadata
- **🏷️ Tag Organization** - Unlimited tags stored in D1 for easy filtering and search
- **🔍 Advanced Search** - Cross-namespace search by key name, tags, and custom metadata
- **⚡ Bulk Operations** - Process thousands of keys efficiently (delete, copy, TTL, tags)
- **📥 Import/Export** - JSON/NDJSON support with collision handling
- **☁️ R2 Backup & Restore** - Cloud-native backup with batch operations
- **📈 Job History** - Complete audit trail with event timelines and advanced filtering
- **🔐 Enterprise Auth** - Cloudflare Access (Zero Trust) integration
- **🎨 Modern UI** - Dark/light themes, responsive design, built with React + Tailwind CSS

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

