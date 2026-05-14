const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const dbPath = path.join(__dirname, "data", "storage.db");

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, "data"))) {
  fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

// Initialize database tables

// Add users table
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
`);

// Add user_id to folders table
db.run(
  `
    ALTER TABLE folders ADD COLUMN user_id INTEGER DEFAULT 1
`,
  (err) => {
    if (err && !err.message.includes("duplicate column")) {
      console.log("Note: user_id column may already exist");
    }
  },
);

// Add user_id to files table
db.run(
  `
    ALTER TABLE files ADD COLUMN user_id INTEGER DEFAULT 1
`,
  (err) => {
    if (err && !err.message.includes("duplicate column")) {
      console.log("Note: user_id column may already exist");
    }
  },
);

// Create default admin user (password: admin123)
const bcrypt = require("bcrypt");
const saltRounds = 10;
const defaultAdminPassword = bcrypt.hashSync("admin123", saltRounds);

db.run(
  `
    INSERT OR IGNORE INTO users (username, password, role) 
    VALUES ('admin', ?, 'admin')
`,
  [defaultAdminPassword],
);

db.serialize(() => {
  // Folders table
  db.run(`
        CREATE TABLE IF NOT EXISTS folders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            parent_id INTEGER DEFAULT NULL,
            path TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
        )
    `);

  // Files table
  db.run(`
        CREATE TABLE IF NOT EXISTS files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            folder_id INTEGER DEFAULT NULL,
            telegram_file_id TEXT NOT NULL,
            file_size INTEGER,
            file_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
        )
    `);
});

module.exports = db;
