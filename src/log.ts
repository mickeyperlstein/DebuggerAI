let ch: import('vscode').OutputChannel | undefined;

function tryVscode(): typeof import('vscode') | undefined {
  try { return require('vscode'); } catch { return undefined; }
}

const channel = () => {
  const vscode = tryVscode();
  if (!vscode) return undefined;
  return (ch ??= vscode.window.createOutputChannel('DebuggingAI'));
};

export const log     = (data: object): void => {
  const line = `[${new Date().toISOString()}] ${JSON.stringify(data)}`;
  channel()?.appendLine(line) ?? process.stdout.write(line + '\n');
};
export const show    = (): void => channel()?.show(true);
export const dispose = (): void => { ch?.dispose(); ch = undefined; };
