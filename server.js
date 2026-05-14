const express = require("express");
const session = require("express-session");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const db = require("./database");
const TelegramStorage = require("./telegram-storage");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static("public"));
app.use(
  session({
    secret: "telegram-cloud-secret-key",
    resave: false,
    saveUninitialized: true,
  }),
);

// Configure multer for file uploads
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Initialize Telegram storage
let telegramStorage = null;

async function initTelegram() {
  if (!telegramStorage) {
    // Gunakan channel ID jika ada, fallback ke username
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

// API Routes

// Get folder contents
app.get("/api/browse", async (req, res) => {
  const folderId = req.query.folderId || null;

  db.all(
    `
        SELECT id, name, parent_id, path, created_at 
        FROM folders 
        WHERE parent_id ${folderId ? "= ?" : "IS NULL"}
        ORDER BY name
    `,
    folderId ? [folderId] : [],
    (err, folders) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      db.all(
        `
            SELECT id, name, folder_id, file_size, file_type, created_at, telegram_file_id
            FROM files 
            WHERE folder_id ${folderId ? "= ?" : "IS NULL"}
            ORDER BY name
        `,
        folderId ? [folderId] : [],
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
app.post("/api/folders", async (req, res) => {
  const { name, parentId } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Folder name required" });
  }

  // Get parent path
  let parentPath = "";
  if (parentId) {
    db.get("SELECT path FROM folders WHERE id = ?", [parentId], (err, row) => {
      if (err || !row) {
        return res.status(500).json({ error: "Parent folder not found" });
      }
      parentPath = row.path + "/" + name;
      createFolder();
    });
  } else {
    parentPath = "/" + name;
    createFolder();
  }

  function createFolder() {
    db.run(
      "INSERT INTO folders (name, parent_id, path) VALUES (?, ?, ?)",
      [name, parentId || null, parentPath],
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
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const { folderId } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    await initTelegram();

    // Get folder path for caption
    let folderPath = "/";
    if (folderId) {
      await new Promise((resolve, reject) => {
        db.get(
          "SELECT path FROM folders WHERE id = ?",
          [folderId],
          (err, row) => {
            if (err) reject(err);
            if (row) folderPath = row.path;
            resolve();
          },
        );
      });
    }

    // Upload to Telegram with folder path
    const telegramFile = await telegramStorage.uploadFile(
      file.path,
      file.originalname,
      folderPath, // Parameter folderPath
    );

    // Save to database
    db.run(
      `INSERT INTO files (name, folder_id, telegram_file_id, file_size, file_type) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        file.originalname,
        folderId || null,
        telegramFile.id,
        file.size,
        file.mimetype,
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
    // Clean up temp file
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
  }
});

// Delete file
app.delete("/api/files/:id", async (req, res) => {
  try {
    const fileId = req.params.id;

    // Get telegram file ID from database
    db.get(
      "SELECT telegram_file_id FROM files WHERE id = ?",
      [fileId],
      async (err, file) => {
        if (err || !file) {
          return res.status(404).json({ error: "File not found" });
        }

        await initTelegram();
        await telegramStorage.deleteFile(parseInt(file.telegram_file_id));

        // Delete from database
        db.run("DELETE FROM files WHERE id = ?", [fileId], (err) => {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          res.json({ success: true });
        });
      },
    );
  } catch (error) {
    console.error("Delete error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete folder
app.delete("/api/folders/:id", async (req, res) => {
  const folderId = req.params.id;

  // First, get all files in this folder and subfolders
  db.all(
    `
        WITH RECURSIVE folder_tree AS (
            SELECT id FROM folders WHERE id = ?
            UNION ALL
            SELECT f.id FROM folders f
            INNER JOIN folder_tree ft ON f.parent_id = ft.id
        )
        SELECT f.telegram_file_id FROM files f
        WHERE f.folder_id IN (SELECT id FROM folder_tree)
    `,
    [folderId],
    async (err, files) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      await initTelegram();

      // Delete all files from Telegram
      for (const file of files) {
        await telegramStorage.deleteFile(parseInt(file.telegram_file_id));
      }

      // Delete folder and its contents from database
      db.run("DELETE FROM folders WHERE id = ?", [folderId], (err) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        res.json({ success: true });
      });
    },
  );
});

// Download file
app.get("/api/download/:id", async (req, res) => {
  try {
    const fileId = req.params.id;

    db.get(
      "SELECT name, telegram_file_id, file_type FROM files WHERE id = ?",
      [fileId],
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
          // Clean up temp file after download
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
