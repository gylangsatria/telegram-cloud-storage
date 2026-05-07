const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const readline = require("readline");
require("dotenv").config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function getSession() {
  console.log("\n=== TELEGRAM SESSION GENERATOR ===\n");

  const apiId = parseInt(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const channelName = process.env.STORAGE_CHANNEL || "my_storage";

  if (!apiId || !apiHash) {
    console.error(
      "Error: Please set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env file",
    );
    process.exit(1);
  }

  console.log("API ID: " + apiId);
  console.log("API Hash: " + apiHash.substring(0, 10) + "...");
  console.log("Channel: " + channelName);

  const phoneNumber = await question(
    "\nEnter phone number (e.g., +628123456789): ",
  );

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 5,
  });

  console.log("\nConnecting to Telegram...");

  try {
    await client.start({
      phoneNumber: async () => phoneNumber,
      phoneCode: async () => {
        const code = await question("Enter verification code from Telegram: ");
        return code;
      },
      password: async () => {
        const pwd = await question("Enter your 2FA password (if any): ");
        return pwd;
      },
    });

    console.log("\nLogin successful!");

    const sessionString = client.session.save();

    console.log("\n=========================================");
    console.log("COPY THIS SESSION STRING:");
    console.log(sessionString);
    console.log("=========================================\n");

    await client.disconnect();
    rl.close();

    console.log("Add this line to your .env file:");
    console.log('TELEGRAM_SESSION="' + sessionString + '"');
  } catch (error) {
    console.error("\nLogin failed:", error.message);
    rl.close();
    process.exit(1);
  }
}

getSession();
