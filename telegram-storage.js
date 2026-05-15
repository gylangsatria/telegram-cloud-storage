const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const fs = require("fs");

class TelegramStorage {
  /**
   * Constructor untuk Telegram Storage
   * @param {number} apiId - Telegram API ID
   * @param {string} apiHash - Telegram API Hash
   * @param {string} sessionString - Session string untuk autentikasi
   * @param {string} channelIdentifier - Bisa berupa username (public) atau channel ID (private, format: -100xxxxx)
   */
  constructor(apiId, apiHash, sessionString, channelIdentifier) {
    this.apiId = parseInt(apiId);
    this.apiHash = apiHash;
    this.sessionString = sessionString;
    this.channelIdentifier = channelIdentifier; // Support username atau channel ID
    this.client = null;
    this.channel = null;
  }

  async init() {
    const session = new StringSession(this.sessionString || "");
    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
    });

    console.log("Starting Telegram client...");

    await this.client.start({
      phoneNumber: async () => "",
      phoneCode: async () => "",
      password: async () => "",
    });

    console.log("Login successful!");

    try {
      // Coba akses channel berdasarkan identifier (bisa username atau channel ID)
      this.channel = await this.client.getInputEntity(this.channelIdentifier);
      console.log("Using existing channel: " + this.channelIdentifier);
    } catch (error) {
      console.log(
        "Channel not found, creating new private channel: " +
          this.channelIdentifier,
      );

      // Buat channel private (tanpa username)
      const result = await this.client.invoke(
        new Api.channels.CreateChannel({
          title: "Cloud Storage",
          about: "Telegram Cloud Storage for files",
          broadcast: true,
          megagroup: false,
          // Tidak set username = private channel
        }),
      );

      this.channel = result.chats[0];
      console.log("Private channel created successfully!");

      // Ekspor invite link untuk channel private
      try {
        const inviteLink = await this.client.invoke(
          new Api.messages.ExportChatInvite({
            peer: this.channel,
            usageLimit: null,
            expireDate: null,
          }),
        );
        console.log("🔗 INVITE LINK (simpan ini): " + inviteLink.link);
      } catch (inviteError) {
        console.log("Note: Could not generate invite link automatically");
      }

      // Tampilkan channel ID untuk konfigurasi
      const channelId = this.channel.id;
      console.log("📌 CHANNEL ID: " + channelId);
      console.log("💡 Tambahkan ke .env: STORAGE_CHANNEL_ID=" + channelId);
      console.log("   atau gunakan: STORAGE_CHANNEL=" + channelId);
    }

    console.log("Telegram storage ready!");
    return this;
  }

  // Helper: Format file size
  formatFileSize(bytes) {
    if (!bytes) return "0 B";
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  }

  // Helper: Generate caption dengan informasi folder
  generateCaption(fileName, folderPath, fileSize, username = "Unknown") {
    const timestamp = new Date().toLocaleString();
    const folderDisplay = folderPath === "/" ? "Root" : folderPath;

    return `
===================================
  FILE INFORMATION
===================================
  Uploaded by: ${username}
  Location: ${folderDisplay}
  Name: ${fileName}
  Size: ${fileSize}
  Time: ${timestamp}
===================================
  Managed by Telegram Cloud Storage
===================================
  `.trim();
  }

  async uploadFile(filePath, fileName, folderPath = "/", username = "Unknown") {
    try {
      if (!this.client || !this.channel) {
        throw new Error("Telegram client not initialized");
      }

      const stats = fs.statSync(filePath);
      const fileSize = this.formatFileSize(stats.size);
      const caption = this.generateCaption(
        fileName,
        folderPath,
        fileSize,
        username,
      );

      console.log("Uploading file:", fileName);
      console.log("Uploaded by:", username);
      console.log("Folder path:", folderPath);

      const file = await this.client.sendFile(this.channel, {
        file: filePath,
        caption: caption,
        forceDocument: true,
      });

      fs.unlinkSync(filePath);

      console.log("File uploaded, message ID:", file.id);

      return {
        id: file.id,
        name: fileName,
        size: stats.size,
      };
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  }

  async deleteFile(telegramFileId) {
    try {
      const messageId = parseInt(telegramFileId);
      console.log("Attempting to delete message ID:", messageId);

      // Method 1: Delete by message ID
      const result = await this.client.invoke(
        new Api.messages.DeleteMessages({
          id: [messageId],
          revoke: true,
        }),
      );

      console.log("Delete result:", result);

      // Method 2: Juga coba hapus dari channel (sebagai backup)
      try {
        const result2 = await this.client.invoke(
          new Api.channels.DeleteMessages({
            channel: this.channel,
            id: [messageId],
          }),
        );
        console.log("Channel delete result:", result2);
      } catch (e) {
        console.log("Channel delete method skipped:", e.message);
      }

      // Method 3: Coba dengan deleteHistory (menghapus semua pesan dengan ID tersebut)
      try {
        const result3 = await this.client.invoke({
          _: "messages.deleteHistory",
          peer: this.channel,
          max_id: messageId,
          just_clear: false,
          revoke: true,
        });
        console.log("Delete history result:", result3);
      } catch (e) {
        console.log("Delete history method skipped:", e.message);
      }

      console.log("Delete operations completed for ID:", messageId);
      return true;
    } catch (error) {
      console.error("Delete error:", error);
      throw error;
    }
  }

  async downloadFile(telegramFileId, outputPath) {
    try {
      const messages = await this.client.getMessages(this.channel, {
        ids: [telegramFileId],
      });

      if (messages.length > 0 && messages[0].media) {
        await this.client.downloadMedia(messages[0].media, {
          outputFile: outputPath,
        });
        return outputPath;
      }
      throw new Error("File not found");
    } catch (error) {
      console.error("Download error:", error);
      throw error;
    }
  }
}

module.exports = TelegramStorage;
