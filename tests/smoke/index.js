const assert = require("assert");
const vscode = require("vscode");

async function run() {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(
    commands.includes("aisCode.openChat"),
    "Expected command aisCode.openChat to be registered"
  );
  assert.ok(
    commands.includes("aisCode.newConversation"),
    "Expected command aisCode.newConversation to be registered"
  );

  await vscode.commands.executeCommand("aisCode.openChat");
  await vscode.commands.executeCommand("aisCode.newConversation");

  await new Promise((resolve) => setTimeout(resolve, 500));
}

module.exports = { run };
