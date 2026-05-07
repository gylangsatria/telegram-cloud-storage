const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");

class TelegramStorage {
  constructor(apiId, apiHash, sessionString, channelUsername) {
    this.apiId = parseInt(apiId);
    this.apiHash = apiHash;
    this.sessionString = sessionString;
    this.channelUsername = channelUsername;
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
      this.channel = await this.client.getInputEntity(this.channelUsername);
      console.log("Using channel: " + this.channelUsername);
    } catch (error) {
      console.log("Creating new channel: " + this.channelUsername);
      const result = await this.client.invoke({
        _: "createChannel",
        title: "Cloud Storage",
        about: "Telegram Cloud Storage for files",
        broadcast: true,
        megagroup: false,
      });
      this.channel = result.chats[0];
      console.log("Channel created successfully!");
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
