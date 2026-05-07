const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require("readline");
const fs = require("fs");
const path = require("path");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

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
      phoneNumber: async () => {
        console.log("\n[Telegram Login Required]");
        return await question(
          "Please enter your phone number (e.g., +628123456789): ",
        );
      },
      phoneCode: async () => {
        console.log("\n[Verification code sent to Telegram]");
        return await question("Enter verification code: ");
      },
      password: async () => {
        console.log("\n[Two-factor authentication enabled]");
        return await question("Enter your password: ");
      },
      onError: (err) => {
        console.error("Login error:", err);
        return;
      },
    });

    console.log("Login successful!");

    // Get or create channel
    try {
      this.channel = await this.client.getInputEntity(this.channelUsername);
      console.log("Using channel: " + this.channelUsername);
    } catch (error) {
      console.log("Creating new channel: " + this.channelUsername);
      try {
        const result = await this.client.invoke({
          _: "createChannel",
          title: "Cloud Storage",
          about: "Telegram Cloud Storage for files",
          broadcast: true,
          megagroup: false,
        });
        this.channel = result.chats[0];
        console.log("Channel created successfully!");
      } catch (createError) {
        console.error("Failed to create channel:", createError);
        throw createError;
      }
    }

    // Save session string for future use
    const sessionString = this.client.session.save();
    if (sessionString && sessionString !== this.sessionString) {
      console.log("\n=========================================");
      console.log("SAVE THIS SESSION STRING:");
      console.log(sessionString);
      console.log("=========================================");
      console.log("Add to .env file:");
      console.log('TELEGRAM_SESSION="' + sessionString + '"');
      console.log("=========================================\n");

      // Save to file for persistence
      fs.writeFileSync("/app/.session_string", sessionString);
    }

    console.log("Telegram storage ready!\n");
    rl.close();
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
      await this.client.invoke({
        _: "deleteMessages",
        id: [telegramFileId],
        revoke: true,
      });
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

  getSessionString() {
    return this.client ? this.client.session.save() : "";
  }
}

module.exports = TelegramStorage;
