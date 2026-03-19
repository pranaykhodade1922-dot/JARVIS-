const INTENT_KEYWORDS = {
  os_control: [
    "open",
    "launch",
    "start",
    "close",
    "browser",
    "chrome",
    "visual studio code",
    "vscode",
    "terminal",
    "folder"
  ],
  terminal_command: [
    "run",
    "execute",
    "npm",
    "node",
    "python",
    "pip",
    "install",
    "start server",
    "build"
  ],
  code_debugging: [
    "error",
    "debug",
    "fix",
    "failed",
    "traceback",
    "exception",
    "why is",
    "problem"
  ],
  code_explanation: [
    "explain",
    "what does",
    "how does",
    "tell me about"
  ],
  git_operation: [
    "git",
    "commit",
    "branch",
    "push",
    "pull request",
    "repository",
    "repo",
    "initialize git"
  ]
};

const matchesAnyKeyword = (input, keywords) => keywords.some((keyword) => input.includes(keyword));

export const classifyIntent = (transcript) => {
  const normalized = transcript.toLowerCase();

  if (matchesAnyKeyword(normalized, INTENT_KEYWORDS.git_operation)) {
    return "git_operation";
  }

  if (matchesAnyKeyword(normalized, INTENT_KEYWORDS.os_control) && normalized.startsWith("open")) {
    return "os_control";
  }

  if (matchesAnyKeyword(normalized, INTENT_KEYWORDS.terminal_command)) {
    return "terminal_command";
  }

  if (matchesAnyKeyword(normalized, INTENT_KEYWORDS.code_debugging)) {
    return "code_debugging";
  }

  if (matchesAnyKeyword(normalized, INTENT_KEYWORDS.code_explanation)) {
    return "code_explanation";
  }

  if (normalized.startsWith("open")) {
    return "os_control";
  }

  return "general";
};

const extractCommitMessage = (input) => {
  const match = input.match(/commit changes(?: with message)? (.+)$/i);
  return match ? match[1].trim() : "voice commit";
};

const extractBranchName = (input) => {
  const match = input.match(/(?:create|checkout|switch to) branch (.+)$/i);
  return match ? match[1].trim().replace(/\s+/g, "-") : "voice-branch";
};

export const parseCommandEntities = (transcript, context = {}) => {
  const normalized = transcript.toLowerCase();

  if (normalized.includes("visual studio code") || normalized.includes("vscode")) {
    return { action: "open_app", target: "vscode" };
  }

  if (normalized.includes("chrome")) {
    return { action: "open_app", target: "chrome" };
  }

  if (normalized.includes("terminal")) {
    return { action: "open_app", target: "terminal" };
  }

  if (normalized.includes("folder")) {
    return {
      action: "open_folder",
      targetPath: context.folderPath || process.env.DEFAULT_WORKSPACE_PATH || process.cwd()
    };
  }

  if (/run my python file/i.test(transcript)) {
    return {
      action: "run_command",
      command: context.pythonFile ? `python "${context.pythonFile}"` : "python file.py",
      cwd: context.cwd
    };
  }

  if (/npm start|run npm start/i.test(normalized)) {
    return { action: "run_command", command: "npm start", cwd: context.cwd };
  }

  if (
    /pip install /i.test(transcript) ||
    /npm install /i.test(transcript) ||
    /node .+/i.test(transcript) ||
    /python .+/i.test(transcript)
  ) {
    return { action: "run_command", command: transcript.replace(/^run /i, "").trim(), cwd: context.cwd };
  }

  if (/initialize git/i.test(normalized)) {
    return { action: "git_init", cwd: context.cwd };
  }

  if (/show current branch/i.test(normalized)) {
    return { action: "git_current_branch", cwd: context.cwd };
  }

  if (/commit changes/i.test(normalized)) {
    return { action: "git_commit", message: extractCommitMessage(transcript), cwd: context.cwd };
  }

  if (/create branch/i.test(normalized)) {
    return { action: "git_create_branch", branch: extractBranchName(transcript), cwd: context.cwd };
  }

  if (/push to github|git push|push changes/i.test(normalized)) {
    return { action: "git_push", cwd: context.cwd };
  }

  return {
    action: "raw_transcript",
    command: transcript,
    cwd: context.cwd
  };
};
