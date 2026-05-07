const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");
const fs = require("fs");
const path = require("path");

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
    const session = new StringSession(this.sessionString);
    this.client = new TelegramClient(session, this.apiId, this.apiHash, {
      connectionRetries: 5,
    });

    await this.client.start({
      phoneNumber: async () => await input.text("Enter phone number: "),
      password: async () => await input.text("Enter password: "),
      phoneCode: async () => await input.text("Enter code: "),
      onError: (err) => console.log(err),
    });

    // Get or create channel
    try {
      this.channel = await this.client.getInputEntity(this.channelUsername);
    } catch (error) {
      console.log("Channel not found, creating...");
      const result = await this.client.invoke(
        new CreateChannelRequest({
          title: "Cloud Storage",
          about: "Telegram Cloud Storage for files",
        }),
      );
      this.channel = result.chats[0];
    }

    console.log("Telegram client initialized successfully");
    return this;
  }

  async uploadFile(filePath, fileName) {
    try {
      const file = await this.client.sendFile(this.channel, {
        file: filePath,
        caption: fileName,
        forceDocument: true,
      });

      // Clean up temp file
      fs.unlinkSync(filePath);

      return {
        id: file.id,
        name: fileName,
        size: fs.statSync(filePath).size,
      };
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  }

  async deleteFile(telegramFileId) {
    try {
      await this.client.invoke(
        new DeleteMessagesRequest({
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

      if (messages.length > 0) {
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

  getSessionString() {
    return this.client.session.save();
  }
}

module.exports = TelegramStorage;
