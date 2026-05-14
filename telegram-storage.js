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

  async uploadFile(filePath, fileName) {
    try {
      if (!this.client || !this.channel) {
        throw new Error("Telegram client not initialized");
      }

      const file = await this.client.sendFile(this.channel, {
        file: filePath,
        caption: fileName,
        forceDocument: true,
      });

      const stats = fs.statSync(filePath);
      fs.unlinkSync(filePath);

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
      const { Api } = require("telegram");

      await this.client.invoke(
        new Api.messages.DeleteMessages({
          id: [telegramFileId],
          revoke: true,
        }),
      );
      console.log("File deleted successfully:", telegramFileId);
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
