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
- **Public & Private channel support** (NEW)

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

## TODO: Private Channel Support

Planned improvements for better security:

### Short Term

- [Done] Add support for private channels
- [Done] Store channel ID instead of username
- [ ] Auto-create private channel option
- [ ] Invite link management

### Long Term

- [ ] End-to-end encryption for files
- [ ] Password-protected shares
- [ ] File expiration dates
- [ ] Access logs

### How to Migrate to Private Channel (Future)

1. Create private channel in Telegram
2. Get channel ID (numeric)
3. Update `.env` with channel ID
4. Application will use private channel

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

- File size: up to 2GB (Telegram limit)
- Rate limits apply (Telegram API)
- Public channel only (for now)

## License

MIT
