# Telegram Cloud Storage

Google Drive-like storage using Telegram as backend. Currently using public channel with plan to support private channel.

## Current Status

⚠️ **Currently using PUBLIC Telegram channel** - Your files can be discovered if someone knows the channel username. See [Security](#security) section for details.

✅ Working features:

- Create/delete folders
- Upload/download files
- File management UI like Google Drive
- Docker support
- Session persistence

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

| Variable            | Description                   | Required           |
| ------------------- | ----------------------------- | ------------------ |
| `TELEGRAM_API_ID`   | API ID from my.telegram.org   | Yes                |
| `TELEGRAM_API_HASH` | API Hash from my.telegram.org | Yes                |
| `TELEGRAM_SESSION`  | Session string (generated)    | Yes                |
| `STORAGE_CHANNEL`   | Telegram channel username     | Yes                |
| `PORT`              | Web server port               | No (default: 3010) |

## Security

### Current Limitations (Public Channel)

- Channel is **PUBLIC** - anyone with the username can find and join
- Files are **NOT** end-to-end encrypted
- Telegram can access your files (server-side encryption only)
- Channel appears in Telegram search results

### Recommendations for Current Setup

- **DO NOT** store sensitive documents (passports, financial data, passwords)
- Use for personal backups and non-sensitive files only
- Consider changing to private channel (see TODO below)

## TODO: Private Channel Support

Planned improvements for better security:

### Short Term

- [ ] Add support for private channels
- [ ] Store channel ID instead of username
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
├── server.js              # Express server
├── telegram-storage.js    # Telegram API integration
├── database.js            # SQLite metadata storage
├── get-session.js         # Session generator
├── Dockerfile             # Main app image
├── Dockerfile.session     # Session generator image
├── docker-compose.yml     # Docker composition
├── public/                # Frontend files
│   ├── index.html
│   ├── style.css
│   └── script.js
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

## Disclaimer

⚠️ **IMPORTANT**: This software uses public Telegram channels for storage. Do not upload sensitive or confidential data. Use at your own risk.
