import { exec } from "child_process";

const escapeDoubleQuotes = (value = "") => value.replace(/"/g, '\\"');

const runGit = (command, cwd) =>
  new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd: cwd || process.env.DEFAULT_WORKSPACE_PATH || process.cwd(),
        timeout: 60000,
        windowsHide: true
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }

        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    );
  });

export const executeGitCommand = async ({ action, cwd, message, branch }) => {
  if (action === "git_init") {
    await runGit("git init", cwd);
    return {
      success: true,
      message: "Git repository initialized.",
      spokenResponse: "Git has been initialized."
    };
  }

  if (action === "git_commit") {
    const result = await runGit(`git add . && git commit -m "${escapeDoubleQuotes(message)}"`, cwd);
    return {
      success: true,
      message: result.stdout || `Committed changes with message: ${message}`,
      spokenResponse: `Committed your changes with message ${message}.`,
      output: result.stdout
    };
  }

  if (action === "git_create_branch") {
    const result = await runGit(`git checkout -b "${escapeDoubleQuotes(branch)}"`, cwd);
    return {
      success: true,
      message: result.stdout || `Created branch ${branch}.`,
      spokenResponse: `Created branch ${branch}.`,
      output: result.stdout
    };
  }

  if (action === "git_push") {
    const result = await runGit("git push", cwd);
    return {
      success: true,
      message: result.stdout || "Pushed the current branch to the remote.",
      spokenResponse: "Pushed your changes to GitHub.",
      output: result.stdout
    };
  }

  if (action === "git_current_branch") {
    const result = await runGit("git branch --show-current", cwd);
    return {
      success: true,
      message: `Current branch: ${result.stdout}`,
      spokenResponse: `You are on branch ${result.stdout}.`,
      output: result.stdout
    };
  }

  throw new Error("Unsupported Git command.");
};
