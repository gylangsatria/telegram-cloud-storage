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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Initialize Telegram connection...");
  initTelegram().catch(console.error);
});
