import { exec } from "child_process";

const SYSTEM_COMMANDS = [
  {
    aliases: ["stop", "stop listening", "stop jarvis", "jarvis stop"],
    response: "Stopping voice control.",
    intent: "assistant-control",
    action: { type: "stop_assistant" },
  },
  {
    aliases: ["clear", "clear history", "clear chat", "clear conversation"],
    response: "Clearing the current assistant history.",
    intent: "assistant-control",
    action: { type: "clear_history" },
  },
  {
    aliases: ["open chrome", "open google chrome"],
    response: "Opening Google Chrome",
    mappedCommand: 'start "" chrome',
  },
  {
    aliases: ["open visual studio code", "open vscode", "open code"],
    response: "Opening Visual Studio Code",
    mappedCommand: 'start "" code',
  },
  {
    aliases: ["open notepad"],
    response: "Opening Notepad",
    mappedCommand: 'start "" notepad',
  },
  {
    aliases: ["open calculator"],
    response: "Opening Calculator",
    mappedCommand: 'start "" calc',
  },
  {
    aliases: ["open cmd", "open command prompt"],
    response: "Opening Command Prompt",
    mappedCommand: 'start "" cmd',
  },
  {
    aliases: ["open file explorer", "open explorer"],
    response: "Opening File Explorer",
    mappedCommand: 'start "" explorer',
  },
  {
    aliases: ["open youtube"],
    response: "Opening YouTube",
    mappedCommand: 'start "" https://www.youtube.com',
  },
  {
    aliases: ["open google"],
    response: "Opening Google",
    mappedCommand: 'start "" https://www.google.com',
  },
  {
    aliases: ["open github"],
    response: "Opening GitHub",
    mappedCommand: 'start "" https://github.com',
  },
  {
    aliases: ["open chatgpt"],
    response: "Opening ChatGPT",
    mappedCommand: 'start "" https://chatgpt.com',
  },
  {
    aliases: ["open downloads"],
    response: "Opening Downloads",
    mappedCommand: 'start "" "%USERPROFILE%\\Downloads"',
  },
  {
    aliases: ["open documents"],
    response: "Opening Documents",
    mappedCommand: 'start "" "%USERPROFILE%\\Documents"',
  },
  {
    aliases: ["open desktop"],
    response: "Opening Desktop",
    mappedCommand: 'start "" "%USERPROFILE%\\Desktop"',
  },
];

export const normalizeSystemCommand = (text = "") =>
  text
    .toLowerCase()
    .replace(/\b(jarvis|hello|hey|please|can you|could you|would you|for me)\b/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const matchSystemCommand = (text = "") => {
  const normalized = normalizeSystemCommand(text);
  const match = SYSTEM_COMMANDS.find((command) =>
    command.aliases.some((alias) => normalized.includes(alias)),
  );

  return {
    normalized,
    match: match || null,
  };
};

const executeMappedCommand = (mappedCommand) =>
  new Promise((resolve, reject) => {
    exec(`cmd.exe /c ${mappedCommand}`, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        console.error("[systemCommandService] execution failed", {
          mappedCommand,
          stderr,
          message: error.message,
        });
        reject(error);
        return;
      }

      console.log("[systemCommandService] execution ok", { mappedCommand, stdout, stderr });
      resolve();
    });
  });

export const runSystemCommand = async (text = "") => {
  const { normalized, match } = matchSystemCommand(text);
  console.log("[systemCommandService] normalized", normalized);
  console.log("[systemCommandService] match", match?.response || "none");

  if (!match) {
    return {
      response: "I could not match that to a safe system command.",
      intent: "unknown",
      resolved: false,
      error: null,
      normalized,
    };
  }

  if (!match.mappedCommand) {
    return {
      response: match.response,
      intent: match.intent || "assistant-control",
      resolved: true,
      error: null,
      normalized,
      action: match.action || null,
    };
  }

  try {
    await executeMappedCommand(match.mappedCommand);

    return {
      response: match.response,
      intent: "os-control",
      resolved: true,
      error: null,
      normalized,
      action: null,
    };
  } catch (error) {
    return {
      response: "The system command was matched but Windows failed to launch it.",
      intent: "os-control",
      resolved: false,
      error: error?.message || "System command execution failed.",
      normalized,
      action: null,
    };
  }
};
