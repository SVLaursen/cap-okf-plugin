// Errors for setup mistakes in a cds command (a bad option or config value). The cds CLI prints
// an error with console.error, which shows its stack; a user who typed a wrong value needs the
// [okf] message and its fix, not cap-okf's call stack. Programming errors keep their stack.

/** An error whose stack is only its message, so the CLI shows the [okf] message and nothing else. */
export function setupError(message: string): Error {
  const error = new Error(message);
  error.stack = message;
  return error;
}
