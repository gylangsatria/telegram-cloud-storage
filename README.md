# Telegram Cloud Storage

Google Drive-like storage using Telegram as backend. Now supports **PUBLIC** and **PRIVATE** channels.

## Current Status

✅ **Now supports PRIVATE channels** - Your files are more secure! Choose between:

- **Public channel**: Easy setup with username, but discoverable
- **Private channel**: Hidden from search, access only via invite link (RECOMMENDED)

✅ Working features:

- Create/delete folders
- Upload/download files
- Batch delete multiple items
- Grid & List view toggle
- Multi-user authentication (Admin/User roles)
- File management UI like Google Drive
- Docker support
- Session persistence
- Public & Private channel support
- File preview (video, audio, image, PDF, text)
- Share file with public link (with expiry)
- Share folder with public link (with expiry)
- My Shares panel to manage shared links
- Progress bar for loading and upload
- Responsive mobile design
- Change password
- Admin panel for user management

## Quick Start

### Prerequisites

- Telegram API ID & Hash from [my.telegram.org](https://my.telegram.org)
- Docker & Docker Compose
- Telegram account

### Installation

1. **Clone repository**

```bash
git clone https://github.com/gylangsatria/telegram-cloud-storage.git
cd telegram-cloud-storage
```

2. **Configure Env**

```bash
cp .env.example .env
# Edit .env with your Telegram API credentials
```

3. **Generate Telegram Session**

```bash
# Using Docker
docker build -f Dockerfile.session -t tg-session .
docker run -it --rm tg-session
*
# Copy the session string to .env file
```

4. **Run Application**

```bash
docker-compose up -d
```

5. **Access web**

```bash
http://localhost:3010
```

## Environment Variables

| Variable             | Description                        | Required            |
| -------------------- | ---------------------------------- | ------------------- |
| `TELEGRAM_API_ID`    | API ID from my.telegram.org        | Yes                 |
| `TELEGRAM_API_HASH`  | API Hash from my.telegram.org      | Yes                 |
| `TELEGRAM_SESSION`   | Session string (generated)         | Yes                 |
| `STORAGE_CHANNEL`    | Telegram channel username (public) | For public channel  |
| `STORAGE_CHANNEL_ID` | Telegram channel ID (private)      | For private channel |
| `PORT`               | Web server port                    | No (default: 3010)  |

## Security

### Public Channel Limitations

- Channel is **PUBLIC** - anyone with the username can find and join
- Files are **NOT** end-to-end encrypted
- Telegram can access your files (server-side encryption only)
- Channel appears in Telegram search results

### Private Channel Benefits

- Channel is **PRIVATE** - not discoverable in search
- Access only via invite link
- Better privacy for your files

### Recommendations

- **DO NOT** store sensitive documents (passports, financial data, passwords)
- Use for personal backups and non-sensitive files only
- Use **PRIVATE channel** for better security
- **Change default admin password** after first login

## TODO / Improvement Roadmap

### Security (High Priority)

- [ ] Move session secret to `.env` instead of hardcoding
- [ ] Add `helmet` middleware for HTTP security headers
- [ ] Add rate limiting to prevent brute force attacks
- [ ] Add CSRF protection for session-based endpoints
- [ ] Set `secure: true` on session cookie when behind HTTPS
- [ ] Add input validation and sanitization library (e.g. Joi, Zod)
- [ ] Fix loose comparison (`==`) usages to strict comparison (`===`)

### Error Handling & Code Quality

- [ ] Wrap all async route handlers with try-catch to prevent unhandled rejections
- [ ] Refactor mixed callback/async patterns in route handlers
- [ ] Remove duplicated functions (`escapeHtml`, `formatFileSize`, `getFileIcon`) shared between server and client
- [ ] Extract magic numbers (bcrypt salt rounds, max file size) into constants
- [ ] Fix root folder creation bug where `this.lastID` references user ID instead of folder ID
- [ ] Add proper HTTP error handling middleware

### Performance

- [ ] Stream file downloads directly from Telegram without saving to temp directory
- [ ] Add pagination to `/api/browse` for folders with many files
- [ ] Optimize breadcrumb to avoid N+1 database queries per folder level
- [ ] Add file caching for frequently downloaded files
- [ ] Migrate from SQLite to PostgreSQL for better concurrency

### Features

- [ ] Add file and folder search
- [ ] Add rename file/folder functionality
- [ ] Add drag-and-drop upload support
- [ ] Add sort and filter options (by name, date, size)
- [ ] Add move/cut-paste files between folders
- [ ] Add recycle bin / trash with restore capability
- [ ] Add file versioning on duplicate filename upload
- [ ] Add activity log / audit trail
- [ ] Add multi-file download as ZIP archive
- [ ] Add dark mode support
- [ ] Add end-to-end encryption for files
- [ ] Add password-protected share links
- [ ] Add share link management (edit expiry, revoke)

### Frontend

- [ ] Replace `document.execCommand('copy')` with `navigator.clipboard.writeText()`
- [ ] Refactor modal event handling to avoid fragile `cloneNode` pattern
- [ ] Replace `alert()` and `confirm()` with custom modal dialogs
- [ ] Replace simulated progress bar with real upload progress tracking
- [ ] Add loading skeleton instead of plain text
- [ ] Add build system (Vite / webpack) for bundling and minification
- [ ] Move inline styles in `admin.html` to external stylesheet

### Infrastructure

- [ ] Add unit tests and integration tests
- [ ] Add health check endpoint (`/health`)
- [ ] Add structured logging (winston / pino)
- [ ] Add error tracking (Sentry)
- [ ] Add GitHub Actions CI/CD pipeline
- [ ] Add graceful shutdown handler (SIGTERM / SIGINT)

### Project Structure

```bash
telegram-cloud-storage/
├── server.js              # Express server with auth
├── telegram-storage.js    # Telegram API integration
├── database.js            # SQLite metadata + users
├── get-session.js         # Session generator
├── Dockerfile             # Main app image
├── Dockerfile.session     # Session generator image
├── docker-compose.yml     # Docker composition
├── public/                # Frontend files
│   ├── index.html         # Main dashboard
│   ├── login.html         # Login page
│   ├── admin.html         # Admin panel
│   ├── style.css          # Styles
│   └── script.js          # Frontend logic
└── data/                  # SQLite database
```

## API Endpoints

| Method | Endpoint            | Description            |
| ------ | ------------------- | ---------------------- |
| GET    | `/api/browse`       | List folders and files |
| POST   | `/api/folders`      | Create folder          |
| POST   | `/api/upload`       | Upload file            |
| DELETE | `/api/files/:id`    | Delete file            |
| DELETE | `/api/folders/:id`  | Delete folder          |
| GET    | `/api/download/:id` | Download file          |

## Access Web

```bash
1. localhost:3010
2. Default user admin : admin | admin123
```

## Troubleshooting

### Session expired

```bash
# Regenerate session
docker run -it --rm tg-session

# Update .env with new session string
docker-compose restart
```

## Troubleshooting

### Port already in use

```bash
# Change port in docker-compose.yml
ports:
  - "3010:3000"
```

### Channel not found

- Ensure channel is public (for now)
- Check username spelling
- Channel must be created before use

## Limitations

### File Size

- Maximum file size: **2GB** per file (Telegram limit)
- For larger files, consider splitting or compressing before upload

### Rate Limits (Telegram API)

All requests go through a single Telegram account, so the following limits apply:

| Type              | Limit              | Impact                               |
| ----------------- | ------------------ | ------------------------------------ |
| Messages per chat | ~1 per second      | Upload/delete operations are queued  |
| Total requests    | ~30 per second     | Combined from all users              |
| Flood wait        | 35 seconds or more | Temporary block when limits exceeded |

### Concurrent Uploads

⚠️ **Important for multi-user setup:**

- Users share the same Telegram account bandwidth
- Uploads from different users are processed **sequentially**, not simultaneously
- If User A uploads a large file, User B must wait
- Heavy concurrent usage may trigger rate limiting (Error 429)

### Data Isolation

- **Files are stored per user** (User A cannot access User B files)
- **Metadata stored locally** in SQLite database
- Each user has their own isolated folder structure

### Storage

- Telegram account storage = total available space
- No built-in file compression
- Metadata stored separately (database backup recommended)

### Performance Considerations

| Scenario                             | Expected Behavior           |
| ------------------------------------ | --------------------------- |
| Single user, normal usage            | ✅ Smooth                   |
| Multi-user, light usage              | ✅ Acceptable               |
| Multi-user, heavy concurrent uploads | ⚠️ Queuing, possible delays |
| Mass upload (>50 files at once)      | ⚠️ Risk of rate limiting    |
| Automated frequent uploads           | ❌ Not recommended          |

### Recommendations

- Avoid uploading more than **20 files per minute**
- Add delays between multiple file uploads (built-in: 3 seconds)
- Use **private channel** for better security
- Backup database regularly (`data/storage.db`)
- Monitor logs for rate limit warnings

### Known Limitations (Future Improvements)

- No end-to-end encryption yet
- No file preview for all formats
- Search functionality not available
- No move/copy between folders
- No trash/recycle bin
- Public channel discovery (use private channel for privacy)

---

_These limitations are based on Telegram API restrictions and current implementation._

## License

MIT
