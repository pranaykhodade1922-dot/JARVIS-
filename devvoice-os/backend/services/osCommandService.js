import { exec } from "child_process";

const APP_COMMANDS = {
  vscode: "code",
  chrome: "start chrome",
  terminal: "start powershell"
};

const runCommand = (command) =>
  new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }

      resolve({ stdout, stderr });
    });
  });

export const executeOsCommand = async ({ action, target, targetPath }) => {
  if (action === "open_folder") {
    await runCommand(`start "" "${targetPath}"`);

    return {
      success: true,
      message: `Opened folder at ${targetPath}.`,
      spokenResponse: "Opening your folder now."
    };
  }

  if (action === "open_app" && APP_COMMANDS[target]) {
    await runCommand(APP_COMMANDS[target]);

    return {
      success: true,
      message: `Opened ${target}.`,
      spokenResponse: target === "vscode" ? "Opening Visual Studio Code." : `Opening ${target}.`
    };
  }

  throw new Error("Unsupported OS command.");
};
