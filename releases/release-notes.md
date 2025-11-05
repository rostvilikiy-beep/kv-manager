# Cloudflare KV Manager v1.0.0

🎉 **Initial Release** - A modern, full-featured web application for managing Cloudflare Workers KV namespaces and keys, with enterprise-grade authentication via Cloudflare Access Zero Trust.

## ✨ Key Features

### Namespace Management
- Create, delete, and rename KV namespaces
- Browse namespaces with key counts and metadata
- Export entire namespaces to JSON or NDJSON format
- Import keys from JSON or NDJSON files
- Namespace-level audit logging

### Key Operations
- List keys with cursor-based pagination
- Create, update, and delete individual keys
- Full CRUD operations with metadata support
- TTL (expiration) management
- KV native metadata (1024 byte limit)
- Single-version backup and restore

### Metadata & Tags (D1-Backed)
- Add unlimited tags to keys for organization
- Store custom JSON metadata (no size limit)
- Search and filter by tags
- Bulk tag operations (add/remove/replace)
- Separate from KV's native metadata system

### Search & Discovery
- Cross-namespace search by key name
- Filter by specific namespaces
- Filter by tags (multiple tag support)
- Real-time search with debouncing
- Quick navigation to search results

### Bulk Operations
- **Bulk Delete**: Remove multiple keys at once
- **Bulk Copy**: Copy keys between namespaces
- **Bulk TTL Update**: Set expiration on multiple keys
- **Bulk Tag**: Apply tags to multiple keys
- Progress tracking with job IDs
- Batch processing (10,000 keys per operation)

### Import/Export
- Export namespaces in JSON or NDJSON format
- Auto-detect format on import
- Collision handling (skip/overwrite/fail)
- Progress tracking for large operations
- Download exported data as files

### Audit Logging
- Track all operations with user attribution
- Filter by namespace or user
- Filter by operation type
- Pagination support
- Export audit logs to CSV
- Comprehensive operation tracking

### User Interface
- **Dark/Light Theme**: System, light, and dark theme support
- **Navigation**: Switch between Namespaces, Search, and Audit Log views
- **Responsive Design**: Works on desktop and mobile
- **Modern UI**: Built with shadcn/ui components and Tailwind CSS

## 🛠️ Technology Stack

- **Frontend**: React 19.2.0 + TypeScript 5.9.3 + Vite 7.1.12 + Tailwind CSS 3.4.18 + shadcn/ui
- **Backend**: Cloudflare Workers + KV + D1 (metadata) + Durable Objects (orchestration)
- **Auth**: Cloudflare Access (Zero Trust)

## 📦 Getting Started

See the [README](https://github.com/neverinfamous/kv-manager/blob/main/README.md) for detailed setup instructions for both local development and production deployment.

## 🔒 Security

- Cloudflare Access JWT validation on all API requests
- Auth bypassed for localhost development
- All KV operations require valid auth token
- Audit logging of all destructive operations
- Protected namespaces hidden from UI

## 📝 License

MIT

---

**Full documentation**: https://github.com/neverinfamous/kv-manager/blob/main/README.md