import * as vscode from 'vscode';

let ch: vscode.OutputChannel | undefined;

const channel = () => (ch ??= vscode.window.createOutputChannel('DebuggingAI'));

export const log     = (data: object) => channel().appendLine(`[${new Date().toISOString()}] ${JSON.stringify(data)}`);
export const show    = ()             => channel().show(true);
export const dispose = ()             => { ch?.dispose(); ch = undefined; };
