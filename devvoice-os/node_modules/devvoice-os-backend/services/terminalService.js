import { exec } from "child_process";

const sanitizeCommand = (command) => command.replace(/\s+/g, " ").trim();

export const executeTerminalCommand = async ({ command, cwd }) =>
  new Promise((resolve) => {
    const safeCommand = sanitizeCommand(command);

    exec(
      safeCommand,
      {
        cwd: cwd || process.env.DEFAULT_WORKSPACE_PATH || process.cwd(),
        timeout: 60000,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            message: "The terminal command failed.",
            spokenResponse: "The command failed. I can explain the error if you want.",
            command: safeCommand,
            stdout: stdout.trim(),
            stderr: stderr.trim() || error.message,
            output: [stdout, stderr || error.message].filter(Boolean).join("\n").trim(),
            exitCode: error.code ?? 1
          });
          return;
        }

        resolve({
          success: true,
          message: "The terminal command completed successfully.",
          spokenResponse: "The command completed successfully.",
          command: safeCommand,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          output: stdout.trim(),
          exitCode: 0
        });
      }
    );
  });
