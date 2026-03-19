const DEBUG_PATTERNS = [
  {
    name: "ModuleNotFoundError",
    test: (text) => /ModuleNotFoundError: No module named ['"]?([^'"\n]+)['"]?/i.test(text),
    explain: (text) => {
      const match = text.match(/ModuleNotFoundError: No module named ['"]?([^'"\n]+)['"]?/i);
      const moduleName = match?.[1] || "the required module";
      return `The error occurs because the ${moduleName} library is not installed or is not available in the active Python environment. Install it using pip install ${moduleName} and rerun the program.`;
    }
  },
  {
    name: "ImportError",
    test: (text) => /ImportError/i.test(text),
    explain: () =>
      "The import failed because Python could not load the requested symbol or module. Check the package version, file names, and whether your local module structure shadows an installed package."
  },
  {
    name: "SyntaxError",
    test: (text) => /SyntaxError/i.test(text),
    explain: () =>
      "This is a syntax error, which means Python could not parse the file. Check the line shown in the traceback for missing colons, unmatched brackets, incorrect indentation, or invalid keyword usage."
  },
  {
    name: "TypeError",
    test: (text) => /TypeError/i.test(text),
    explain: () =>
      "This TypeError usually means a function or operation received a value of the wrong type. Compare the expected argument types against the actual data being passed at the failing line."
  },
  {
    name: "ReferenceError",
    test: (text) => /ReferenceError/i.test(text),
    explain: () =>
      "A ReferenceError means the code is using a variable that has not been declared or is not available in the current scope. Check the exact variable name and where it is defined."
  },
  {
    name: "npm_missing_script",
    test: (text) => /Missing script/i.test(text),
    explain: () =>
      "npm could not find the script you tried to run. Check the scripts section in package.json and confirm the command name matches exactly."
  }
];

export const analyzeErrorOutput = (text = "") => {
  const normalized = text.trim();

  if (!normalized) {
    return {
      success: true,
      message: "I do not have an error output to analyze yet. Run a command first or paste the error details.",
      errorType: "NoErrorContext"
    };
  }

  const match = DEBUG_PATTERNS.find((pattern) => pattern.test(normalized));

  if (!match) {
    return {
      success: true,
      message:
        "I could not map this to a known common error pattern, but the failure output suggests you should inspect the exact failing line, dependencies, environment, and command arguments.",
      errorType: "UnknownError",
      source: normalized
    };
  }

  return {
    success: true,
    message: match.explain(normalized),
    errorType: match.name,
    source: normalized
  };
};
