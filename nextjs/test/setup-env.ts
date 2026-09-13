process.env.AUTH_PEPPER ??= "test-pepper-do-not-use-in-production";
process.env.ENCRYPTION_MASTER_KEY ??= Buffer.alloc(32, 7).toString("base64");
process.env.HIBP_USER_AGENT ??= "Ahaai-Password-Manager-Test";
