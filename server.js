const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
require("dotenv").config();

const db = require("./database");
const TelegramStorage = require("./telegram-storage");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static("public"));

// Session configuration - HANYA SATU
app.use(
  session({
    secret: "telegram-cloud-secret-key-change-this",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Middleware to check if user is logged in
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please login first" });
  }
  next();
}

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Please login first" });
  }
  if (req.session.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// Serve login page
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Redirect root to login if not authenticated
app.get("/", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Get folder by ID for breadcrumb
app.get("/api/folder/:id", requireLogin, (req, res) => {
  const folderId = req.params.id;
  const userId = req.session.userId;

  db.get(
    "SELECT id, name, parent_id, path FROM folders WHERE id = ? AND user_id = ?",
    [folderId, userId],
    (err, folder) => {
      if (err || !folder) {
        return res.status(404).json({ error: "Folder not found" });
      }
      res.json(folder);
    },
  );
});

// Initialize Telegram storage
let telegramStorage = null;

async function initTelegram() {
  if (!telegramStorage) {
    const channelIdentifier =
      process.env.STORAGE_CHANNEL_ID || process.env.STORAGE_CHANNEL;

    if (!channelIdentifier) {
      console.error(
        "Error: STORAGE_CHANNEL_ID or STORAGE_CHANNEL must be set in .env",
      );
      process.exit(1);
    }

    console.log(`Using channel identifier: ${channelIdentifier}`);
    console.log(
      `Channel type: ${process.env.STORAGE_CHANNEL_ID ? "PRIVATE (by ID)" : "PUBLIC (by username)"}`,
    );

    telegramStorage = new TelegramStorage(
      process.env.TELEGRAM_API_ID,
      process.env.TELEGRAM_API_HASH,
      process.env.TELEGRAM_SESSION || "",
      channelIdentifier,
    );

    console.log("Initializing Telegram connection...");
    await telegramStorage.init();
    console.log("Telegram connection established!");
  }
  return telegramStorage;
}

// ============ AUTHENTICATION ROUTES ============

// Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  db.get(
    "SELECT * FROM users WHERE username = ?",
    [username],
    async (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const match = await bcrypt.compare(password, user.password);
      if (!match) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.role = user.role;

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    },
  );
});

// Logout
app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Get current user
app.get("/api/me", (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Not logged in" });
  }

  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
  });
});

// Admin: Get all users
app.get("/api/users", requireAdmin, (req, res) => {
  db.all(
    "SELECT id, username, role, created_at FROM users ORDER BY id",
    [],
    (err, users) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(users);
    },
  );
});

// Change own password
app.post("/api/change-password", requireLogin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.session.userId;

  if (!currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "Current password and new password required" });
  }

  if (newPassword.length < 4) {
    return res
      .status(400)
      .json({ error: "New password must be at least 4 characters" });
  }

  // Get user's current password
  db.get(
    "SELECT password FROM users WHERE id = ?",
    [userId],
    async (err, user) => {
      if (err || !user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify current password
      const match = await bcrypt.compare(currentPassword, user.password);
      if (!match) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      db.run(
        "UPDATE users SET password = ? WHERE id = ?",
        [hashedPassword, userId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ success: true, message: "Password changed successfully" });
        },
      );
    },
  );
});

// Admin: Reset password for any user
app.post(
  "/api/admin/reset-password/:userId",
  requireAdmin,
  async (req, res) => {
    const { userId } = req.params;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: "New password required" });
    }

    if (newPassword.length < 4) {
      return res
        .status(400)
        .json({ error: "Password must be at least 4 characters" });
    }

    // Check if user exists
    db.get(
      "SELECT id, username FROM users WHERE id = ?",
      [userId],
      async (err, user) => {
        if (err || !user) {
          return res.status(404).json({ error: "User not found" });
        }

        // Don't allow admin to reset own password here (use change-password instead)
        if (userId == req.session.userId) {
          return res.status(400).json({
            error: "Use change password endpoint for your own account",
          });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        db.run(
          "UPDATE users SET password = ? WHERE id = ?",
          [hashedPassword, userId],
          (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({
              success: true,
              message: `Password reset for user ${user.username} successfully`,
            });
          },
        );
      },
    );
  },
);

// Admin: Create new user
app.post("/api/users", requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const userRole = role === "admin" ? "admin" : "user";

  db.run(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, hashedPassword, userRole],
    function (err) {
      if (err) {
        if (err.message.includes("UNIQUE")) {
          return res.status(400).json({ error: "Username already exists" });
        }
        return res.status(500).json({ error: err.message });
      }

      const rootPath = "/" + username;
      db.run(
        "INSERT INTO folders (name, parent_id, path, user_id) VALUES (?, NULL, ?, ?)",
        [username + "-root", rootPath, this.lastID],
        (err2) => {
          if (err2) console.error("Error creating root folder:", err2);
        },
      );

      res.json({ id: this.lastID, username, role: userRole });
    },
  );
});

// Admin: Delete user
app.delete("/api/users/:id", requireAdmin, (req, res) => {
  const userId = req.params.id;

  if (userId == req.session.userId) {
    return res.status(400).json({ error: "Cannot delete your own account" });
  }

  db.run("DELETE FROM files WHERE user_id = ?", [userId], (err) => {
    if (err) console.error("Error deleting files:", err);
  });

  db.run("DELETE FROM folders WHERE user_id = ?", [userId], (err) => {
    if (err) console.error("Error deleting folders:", err);
  });

  db.run("DELETE FROM users WHERE id = ?", [userId], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true });
  });
});

// ============ STORAGE ROUTES ============

// Get folder contents
app.get("/api/browse", requireLogin, (req, res) => {
  const folderId = req.query.folderId || null;
  const userId = req.session.userId;

  db.all(
    `
    SELECT id, name, parent_id, path, created_at 
    FROM folders 
    WHERE user_id = ? AND parent_id ${folderId ? "= ?" : "IS NULL"}
    ORDER BY name
    `,
    folderId ? [userId, folderId] : [userId],
    (err, folders) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.all(
        `
        SELECT id, name, folder_id, file_size, file_type, created_at, telegram_file_id
        FROM files 
        WHERE user_id = ? AND folder_id ${folderId ? "= ?" : "IS NULL"}
        ORDER BY name
        `,
        folderId ? [userId, folderId] : [userId],
        (err, files) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ folders, files });
        },
      );
    },
  );
});

// Create folder
app.post("/api/folders", requireLogin, (req, res) => {
  const { name, parentId } = req.body;
  const userId = req.session.userId;

  if (!name) {
    return res.status(400).json({ error: "Folder name required" });
  }

  let parentPath = "";

  if (parentId) {
    db.get(
      "SELECT path FROM folders WHERE id = ? AND user_id = ?",
      [parentId, userId],
      (err, row) => {
        if (err || !row) {
          return res.status(500).json({ error: "Parent folder not found" });
        }
        parentPath = row.path + "/" + name;
        createFolder();
      },
    );
  } else {
    parentPath = "/" + name;
    createFolder();
  }

  function createFolder() {
    db.run(
      "INSERT INTO folders (name, parent_id, path, user_id) VALUES (?, ?, ?, ?)",
      [name, parentId || null, parentPath, userId],
      function (err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({
          id: this.lastID,
          name,
          parent_id: parentId,
          path: parentPath,
        });
      },
    );
  }
});

// Upload file
app.post(
  "/api/upload",
  requireLogin,
  upload.single("file"),
  async (req, res) => {
    try {
      const { folderId } = req.body;
      const file = req.file;
      const userId = req.session.userId;
      const username = req.session.username; // Ambil username dari session

      if (!file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      await initTelegram();

      let folderPath = "/";
      if (folderId) {
        await new Promise((resolve, reject) => {
          db.get(
            "SELECT path FROM folders WHERE id = ? AND user_id = ?",
            [folderId, userId],
            (err, row) => {
              if (err) reject(err);
              if (row) folderPath = row.path;
              resolve();
            },
          );
        });
      }

      // Upload to Telegram with username
      const telegramFile = await telegramStorage.uploadFile(
        file.path,
        file.originalname,
        folderPath,
        username, // Kirim username
      );

      db.run(
        `INSERT INTO files (name, folder_id, telegram_file_id, file_size, file_type, user_id) 
       VALUES (?, ?, ?, ?, ?, ?)`,
        [
          file.originalname,
          folderId || null,
          telegramFile.id,
          file.size,
          file.mimetype,
          userId,
        ],
        function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({
            id: this.lastID,
            name: file.originalname,
            folder_id: folderId,
            size: file.size,
          });
        },
      );
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: error.message });
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }
  },
);

// Delete file
app.delete("/api/files/:id", requireLogin, async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.session.userId;

    db.get(
      "SELECT telegram_file_id FROM files WHERE id = ? AND user_id = ?",
      [fileId, userId],
      async (err, file) => {
        if (err || !file) {
          return res.status(404).json({ error: "File not found" });
        }

        await initTelegram();
        await telegramStorage.deleteFile(parseInt(file.telegram_file_id));

        db.run(
          "DELETE FROM files WHERE id = ? AND user_id = ?",
          [fileId, userId],
          (err) => {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            res.json({ success: true });
          },
        );
      },
    );
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete folder
app.delete("/api/folders/:id", requireLogin, async (req, res) => {
  const folderId = req.params.id;
  const userId = req.session.userId;

  db.all(
    `
    WITH RECURSIVE folder_tree AS (
        SELECT id FROM folders WHERE id = ? AND user_id = ?
        UNION ALL
        SELECT f.id FROM folders f
        INNER JOIN folder_tree ft ON f.parent_id = ft.id
        WHERE f.user_id = ?
    )
    SELECT f.telegram_file_id FROM files f
    WHERE f.folder_id IN (SELECT id FROM folder_tree) AND f.user_id = ?
    `,
    [folderId, userId, userId, userId],
    async (err, files) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      await initTelegram();

      for (const file of files) {
        await telegramStorage.deleteFile(parseInt(file.telegram_file_id));
      }

      db.run(
        "DELETE FROM folders WHERE id = ? AND user_id = ?",
        [folderId, userId],
        (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ success: true });
        },
      );
    },
  );
});

// Download file
app.get("/api/download/:id", requireLogin, async (req, res) => {
  try {
    const fileId = req.params.id;
    const userId = req.session.userId;

    db.get(
      "SELECT name, telegram_file_id, file_type FROM files WHERE id = ? AND user_id = ?",
      [fileId, userId],
      async (err, file) => {
        if (err || !file) {
          return res.status(404).json({ error: "File not found" });
        }

        await initTelegram();

        const tempPath = path.join(
          __dirname,
          "uploads",
          `download_${Date.now()}_${file.name}`,
        );
        await telegramStorage.downloadFile(
          parseInt(file.telegram_file_id),
          tempPath,
        );

        res.download(tempPath, file.name, (err) => {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
          if (err) {
            console.error("Download error:", err);
          }
        });
      },
    );
  } catch (error) {
    console.error("Download error:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============ SHARING ROUTES ============

// Generate share link for a folder
app.post("/api/share-folder/:folderId", requireLogin, async (req, res) => {
  const folderId = req.params.folderId;
  const userId = req.session.userId;
  const { expiresInHours } = req.body;

  // Check if folder exists and belongs to user
  db.get(
    "SELECT id, name FROM folders WHERE id = ? AND user_id = ?",
    [folderId, userId],
    async (err, folder) => {
      if (err || !folder) {
        return res.status(404).json({ error: "Folder not found" });
      }

      const crypto = require("crypto");
      const shareToken = crypto.randomBytes(16).toString("hex");

      let expiresAt = null;
      if (expiresInHours && expiresInHours > 0) {
        expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
      }

      db.run(
        `INSERT INTO shares (folder_id, user_id, share_token, expires_at, is_folder) 
         VALUES (?, ?, ?, ?, 1)`,
        [folderId, userId, shareToken, expiresAt],
        function (err) {
          if (err) {
            console.error("Insert share error:", err.message);
            return res.status(500).json({ error: err.message });
          }

          const shareUrl = `${req.protocol}://${req.get("host")}/share-folder/${shareToken}`;
          res.json({
            success: true,
            shareUrl: shareUrl,
            shareToken: shareToken,
            expiresAt: expiresAt,
            isFolder: true,
          });
        },
      );
    },
  );
});

// Public access to shared folder
app.get("/share-folder/:token", async (req, res) => {
  const { token } = req.params;

  db.get(
    `SELECT s.*, f.name as folder_name, f.user_id as owner_id
     FROM shares s 
     JOIN folders f ON s.folder_id = f.id 
     WHERE s.share_token = ? AND s.is_folder = 1`,
    [token],
    async (err, share) => {
      if (err || !share) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Share Not Found</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>Share Link Not Found</h1>
            <p>The share link may have expired or been removed.</p>
            <a href="/">Go to Home</a>
          </body>
          </html>
        `);
      }

      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return res.status(410).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Share Expired</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>Share Link Expired</h1>
            <p>This share link has expired.</p>
            <a href="/">Go to Home</a>
          </body>
          </html>
        `);
      }

      // Increment download count
      db.run(
        "UPDATE shares SET download_count = download_count + 1 WHERE share_token = ?",
        [token],
      );

      // Get all files in this folder
      db.all(
        `SELECT f.id, f.name, f.telegram_file_id, f.file_size, f.file_type 
         FROM files f
         WHERE f.folder_id = ?`,
        [share.folder_id],
        async (err, files) => {
          if (err) {
            return res.status(500).send("Error loading files");
          }

          // Generate HTML page
          let filesHtml = "";
          for (const file of files) {
            const size = formatFileSize(file.file_size);
            const icon = getFileIcon(file.file_type);
            filesHtml += `
              <div class="share-file-item">
                <div class="share-file-icon"><i class="${icon}"></i></div>
                <div class="share-file-name">${escapeHtml(file.name)}</div>
                <div class="share-file-size">${size}</div>
                <div class="share-file-download">
                  <a href="/share-file/${token}/${file.id}" class="share-download-btn">Download</a>
                </div>
              </div>
            `;
          }

          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Shared: ${escapeHtml(share.folder_name)}</title>
              <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
                .share-container { max-width: 800px; margin: 50px auto; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden; }
                .share-header { background: linear-gradient(135deg, #0088cc, #005f8c); color: white; padding: 30px; text-align: center; }
                .share-header h1 { margin-bottom: 10px; }
                .share-files { padding: 20px; }
                .share-file-item { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #e0e0e0; }
                .share-file-item:hover { background: #f8f9fa; }
                .share-file-icon { width: 40px; font-size: 24px; color: #666; }
                .share-file-name { flex: 2; font-size: 14px; }
                .share-file-size { width: 100px; font-size: 12px; color: #666; }
                .share-file-download { width: 100px; text-align: right; }
                .share-download-btn { background: #0088cc; color: white; padding: 6px 12px; border-radius: 5px; text-decoration: none; font-size: 12px; }
                .share-download-btn:hover { background: #005f8c; }
                .empty-folder { text-align: center; padding: 60px; color: #999; }
                .footer { text-align: center; padding: 20px; color: #999; font-size: 12px; border-top: 1px solid #e0e0e0; }
              </style>
            </head>
            <body>
              <div class="share-container">
                <div class="share-header">
                  <h1><i class="fab fa-telegram"></i> Shared Folder</h1>
                  <h2>${escapeHtml(share.folder_name)}</h2>
                  <p>Shared via Telegram Cloud Storage</p>
                </div>
                <div class="share-files">
                  ${files.length === 0 ? '<div class="empty-folder"><i class="fas fa-folder-open"></i><p>This folder is empty</p></div>' : filesHtml}
                </div>
                <div class="footer">
                  <p>Powered by Telegram Cloud Storage</p>
                </div>
              </div>
            </body>
            </html>
          `;
          res.send(html);
        },
      );
    },
  );
});

// Simple escape for server-side (no document)
function escapeHtml(text) {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function getFileIcon(mimeType) {
  if (!mimeType) return "fas fa-file";
  if (mimeType.startsWith("image/")) return "fas fa-image";
  if (mimeType.startsWith("video/")) return "fas fa-video";
  if (mimeType.startsWith("audio/")) return "fas fa-music";
  if (mimeType.includes("pdf")) return "fas fa-file-pdf";
  if (mimeType.includes("word")) return "fas fa-file-word";
  if (mimeType.includes("excel")) return "fas fa-file-excel";
  if (mimeType.includes("zip")) return "fas fa-file-archive";
  return "fas fa-file";
}

// Download file from shared folder
app.get("/share-file/:token/:fileId", async (req, res) => {
  const { token, fileId } = req.params;

  // Verify share token and get file
  db.get(
    `SELECT s.*, f.telegram_file_id, f.name as file_name, f.user_id as owner_id
     FROM shares s 
     JOIN folders fld ON s.folder_id = fld.id
     JOIN files f ON f.folder_id = fld.id OR f.folder_id IN (
       WITH RECURSIVE folder_tree AS (
         SELECT id FROM folders WHERE id = fld.id
         UNION ALL
         SELECT f.id FROM folders f
         INNER JOIN folder_tree ft ON f.parent_id = ft.id
       )
       SELECT id FROM folder_tree
     )
     WHERE s.share_token = ? AND f.id = ? AND s.is_folder = 1`,
    [token, fileId],
    async (err, share) => {
      if (err || !share) {
        return res.status(404).send("File not found");
      }

      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return res.status(410).send("Share link expired");
      }

      await initTelegram();

      const tempPath = path.join(
        __dirname,
        "uploads",
        `share_${Date.now()}_${share.file_name}`,
      );

      try {
        await telegramStorage.downloadFile(
          parseInt(share.telegram_file_id),
          tempPath,
        );

        res.download(tempPath, share.file_name, (err) => {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        });
      } catch (downloadErr) {
        console.error("Download error:", downloadErr);
        res.status(500).send("Error downloading file");
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      }
    },
  );
});

// Generate share link for a file
app.post("/api/share/:fileId", requireLogin, async (req, res) => {
  const fileId = req.params.fileId;
  const userId = req.session.userId;
  const { expiresInHours } = req.body; // Optional: expiration in hours

  // Check if file exists and belongs to user
  db.get(
    "SELECT id, name FROM files WHERE id = ? AND user_id = ?",
    [fileId, userId],
    async (err, file) => {
      if (err || !file) {
        return res.status(404).json({ error: "File not found" });
      }

      // Generate unique token
      const crypto = require("crypto");
      const shareToken = crypto.randomBytes(16).toString("hex");

      // Calculate expiration date (optional)
      let expiresAt = null;
      if (expiresInHours && expiresInHours > 0) {
        expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
      }

      // Save share record
      db.run(
        "INSERT INTO shares (file_id, user_id, share_token, expires_at) VALUES (?, ?, ?, ?)",
        [fileId, userId, shareToken, expiresAt],
        function (err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }

          const shareUrl = `${req.protocol}://${req.get("host")}/share/${shareToken}`;
          res.json({
            success: true,
            shareUrl: shareUrl,
            shareToken: shareToken,
            expiresAt: expiresAt,
          });
        },
      );
    },
  );
});

// Get share info (for the owner)
app.get("/api/share/info/:token", requireLogin, async (req, res) => {
  const { token } = req.params;
  const userId = req.session.userId;

  db.get(
    `SELECT s.*, f.name as file_name, f.file_size, f.file_type 
     FROM shares s 
     JOIN files f ON s.file_id = f.id 
     WHERE s.share_token = ? AND s.user_id = ?`,
    [token, userId],
    (err, share) => {
      if (err || !share) {
        return res.status(404).json({ error: "Share not found" });
      }
      res.json(share);
    },
  );
});

// List all shares for current user
app.get("/api/shares", requireLogin, (req, res) => {
  const userId = req.session.userId;

  db.all(
    `SELECT s.*, f.name as file_name, f.file_size, f.file_type 
     FROM shares s 
     JOIN files f ON s.file_id = f.id 
     WHERE s.user_id = ? 
     ORDER BY s.created_at DESC`,
    [userId],
    (err, shares) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json(shares);
    },
  );
});

// Delete/revoke share link
app.delete("/api/share/:token", requireLogin, async (req, res) => {
  const { token } = req.params;
  const userId = req.session.userId;

  db.run(
    "DELETE FROM shares WHERE share_token = ? AND user_id = ?",
    [token, userId],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Share not found" });
      }
      res.json({ success: true, message: "Share link revoked" });
    },
  );
});

// Public access to shared file (no login required)
app.get("/share/:token", async (req, res) => {
  const { token } = req.params;

  db.get(
    `SELECT s.*, f.name as file_name, f.telegram_file_id, f.file_type, f.file_size, f.user_id as owner_id
     FROM shares s 
     JOIN files f ON s.file_id = f.id 
     WHERE s.share_token = ?`,
    [token],
    async (err, share) => {
      if (err || !share) {
        return res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Share Not Found</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>🔗 Share Link Not Found</h1>
            <p>The share link may have expired or been removed.</p>
            <a href="/">Go to Home</a>
          </body>
          </html>
        `);
      }

      // Check expiration
      if (share.expires_at && new Date(share.expires_at) < new Date()) {
        return res.status(410).send(`
          <!DOCTYPE html>
          <html>
          <head><title>Share Expired</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>⏰ Share Link Expired</h1>
            <p>This share link has expired.</p>
            <a href="/">Go to Home</a>
          </body>
          </html>
        `);
      }

      // Increment download count
      db.run(
        "UPDATE shares SET download_count = download_count + 1 WHERE share_token = ?",
        [token],
      );

      // Get file from Telegram
      await initTelegram();

      // Get owner's channel
      db.get(
        "SELECT telegram_file_id FROM files WHERE id = ?",
        [share.file_id],
        async (err, file) => {
          if (err || !file) {
            return res.status(404).send("File not found");
          }

          const tempPath = path.join(
            __dirname,
            "uploads",
            `share_${Date.now()}_${share.file_name}`,
          );

          try {
            // We need to get the owner's channel info
            // This requires storing channel per user or using a shared channel
            // For now, we'll use the main channel
            await telegramStorage.downloadFile(
              parseInt(file.telegram_file_id),
              tempPath,
            );

            res.download(tempPath, share.file_name, (err) => {
              if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
              }
              if (err) {
                console.error("Download error:", err);
              }
            });
          } catch (downloadErr) {
            console.error("Download error:", downloadErr);
            res.status(500).send("Error downloading file");
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          }
        },
      );
    },
  );
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Initialize Telegram connection...");
  initTelegram().catch(console.error);
});
