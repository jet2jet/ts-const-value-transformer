// @internal
import { fileURLToPath, pathToFileURL } from 'url';
// @internal
import version from '../version.mjs';
import SyncLspClient from './SyncLspClient.mjs';

/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export default class TsLspClient extends SyncLspClient {
  private _supportPullDiagnostics: boolean;
  private _firstDiagnosticsReceived: boolean;
  private readonly _fileForDiagnostics: Map<string, object[]>;

  public constructor(
    command: string,
    argv: string[],
    encoding: BufferEncoding = 'utf8'
  ) {
    super(command, argv, encoding);
    this._supportPullDiagnostics = false;
    this._firstDiagnosticsReceived = false;
    this._fileForDiagnostics = new Map();
    this.registerServerMessageHandler('client/registerCapability', () => {
      return null;
    });
    this.registerServerMessageHandler('workspace/configuration', () => {
      return {};
    });
    this.registerNotificationHandler(
      'textDocument/publishDiagnostics',
      () => {
        this._firstDiagnosticsReceived = true;
      },
      true
    );
  }

  public initialize(rootDir: string): void {
    const uri = pathToFileURL(rootDir).href;
    const id = this.sendMessage('initialize', {
      processId: process.pid,
      clientInfo: {
        name: 'ts-const-value-transformer',
        version,
      },
      capabilities: {
        textDocument: {
          publishDiagnostics: {
            relatedInformation: true,
          },
          diagnostics: {
            relatedInformation: true,
          },
          declaration: {
            linkSupport: false,
          },
          typeDefinition: {
            linkSupport: false,
          },
          hover: {
            contentFormat: ['markdown', 'plaintext'],
          },
        },
      },
      workspaceFolders: [{ name: 'workspace', uri }],
      rootUri: uri,
      initializationOptions: {},
    });
    const r: any = this.receiveMessage(id);
    if (r?.capabilities == null) {
      throw new Error('Unexpected language server: no capabilities');
    }
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!r.capabilities.hoverProvider) {
      throw new Error('Unexpected language server: hover not supported');
    }
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!r.capabilities.typeDefinitionProvider) {
      throw new Error(
        'Unexpected language server: go to type definition not supported'
      );
    }
    this._supportPullDiagnostics = r.capabilities.diagnosticProvider != null;

    this.notifyMessage('initialized');

    if (!this.pumpMessage(true)) {
      throw new Error('Peer closed');
    }

    if (!this._supportPullDiagnostics) {
      this.registerNotificationHandler(
        'textDocument/publishDiagnostics',
        (_, params) => {
          if (!params || !('uri' in params) || !('diagnostics' in params)) {
            return;
          }
          this._fileForDiagnostics.set(
            params.uri as string,
            params.diagnostics as object[]
          );
        }
      );
    }
  }

  public waitForFirstDiagnosticsReceived(): void {
    if (this._firstDiagnosticsReceived) {
      return;
    }
    if (!this.pumpMessage(true)) {
      throw new Error('Peer closed');
    }
    while (!this._firstDiagnosticsReceived) {
      if (!this.pumpMessage()) {
        throw new Error('Peer closed');
      }
    }
  }

  public openDocument(fileName: string, content: string): void {
    const uri = pathToFileURL(fileName).href;

    this._fileForDiagnostics.delete(uri);

    this.notifyMessage('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId: 'typescript',
        version: 0,
        text: content,
      },
    });
  }

  public closeDocument(fileName: string): void {
    const uri = pathToFileURL(fileName).href;

    this._fileForDiagnostics.delete(uri);

    this.notifyMessage('textDocument/didClose', {
      textDocument: {
        uri,
      },
    });
  }

  // public receiveDiagnostics(fileName: string): object[] {
  //   const uri = pathToFileURL(fileName).href;
  //   if (this._supportPullDiagnostics) {
  //     const id = this.sendMessage('textDocument/diagnostic', {
  //       textDocument: {
  //         uri,
  //       },
  //     });
  //     const r: any = this.receiveMessage(id);
  //     // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  //     if (!r) {
  //       return [];
  //     }
  //     if (r.kind === 'unchanged') {
  //       return [];
  //     }
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  //     return r.items;
  //   } else {
  //     if (!this.pumpMessage(true)) {
  //       throw new Error('Peer closed');
  //     }
  //     for (;;) {
  //       const o = this._fileForDiagnostics.get(uri);
  //       if (o) {
  //         return o;
  //       }
  //       if (!this.pumpMessage()) {
  //         throw new Error('Peer closed');
  //       }
  //     }
  //   }
  // }

  /** Only returns first string from contents */
  public hoverForPosition(
    fileName: string,
    line: number,
    pos: number
  ): [markdown: boolean, value: string] {
    const uri = pathToFileURL(fileName).href;
    const id = this.sendMessage('textDocument/hover', {
      textDocument: {
        uri,
      },
      position: {
        line,
        character: pos,
      },
    });
    const r: any = this.receiveMessage(id);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!r?.contents) {
      return [false, ''];
    }
    if ('kind' in r.contents) {
      return [r.contents.kind === 'markdown', r.contents.value];
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const c = r.contents instanceof Array ? r.contents[0] : r.contents;
    if (typeof c === 'string') {
      return [true, c];
    }
    return [true, '```' + c.language + '\n' + c.value + '\n```'];
  }

  public getDefinition(
    fileName: string,
    line: number,
    pos: number
  ): {
    fileName: string;
    lineStart: number;
    posStart: number;
    lineEnd: number;
    posEnd: number;
  } | null {
    const uri = pathToFileURL(fileName).href;
    const id = this.sendMessage('textDocument/definition', {
      textDocument: {
        uri,
      },
      position: {
        line,
        character: pos,
      },
    });
    const r: any = this.receiveMessage(id);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!r) {
      return null;
    }
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const loc = r instanceof Array ? r[0] : r;
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!loc) {
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const defFileName = fileURLToPath(loc.uri);
    return {
      fileName: defFileName,
      lineStart: loc.range.start.line,
      posStart: loc.range.start.character,
      lineEnd: loc.range.end.line,
      posEnd: loc.range.end.character,
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  }

  public getTypeDefitition(
    fileName: string,
    line: number,
    pos: number
  ): Array<{
    fileName: string;
    lineStart: number;
    posStart: number;
    lineEnd: number;
    posEnd: number;
  }> {
    const uri = pathToFileURL(fileName).href;
    const id = this.sendMessage('textDocument/typeDefinition', {
      textDocument: {
        uri,
      },
      position: {
        line,
        character: pos,
      },
    });
    const r: any = this.receiveMessage(id);
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!r) {
      return [];
    }
    const a = r instanceof Array ? r : [r];
    return a.map((loc) => {
      /* eslint-disable @typescript-eslint/no-unsafe-assignment */
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const defFileName = fileURLToPath(loc.uri);
      return {
        fileName: defFileName,
        lineStart: loc.range.start.line,
        posStart: loc.range.start.character,
        lineEnd: loc.range.end.line,
        posEnd: loc.range.end.character,
      };
      /* eslint-enable @typescript-eslint/no-unsafe-assignment */
    });
  }

  public sendReplaceText(
    fileName: string,
    lineStart: number,
    posStart: number,
    lineEnd: number,
    posEnd: number,
    text: string
  ): void {
    const uri = pathToFileURL(fileName).href;

    this._fileForDiagnostics.delete(uri);

    this.notifyMessage('textDocument/didChange', {
      textDocument: {
        uri,
        version: 0,
      },
      contentChanges: [
        {
          range: {
            start: { line: lineStart, character: posStart },
            end: { line: lineEnd, character: posEnd },
          },
          text,
        },
      ],
    });
  }

  public exit(): void {
    const id = this.sendMessage('shutdown');
    try {
      this.receiveMessage(id);
      this.notifyMessage('exit');
    } catch {}
    this.close();
  }
}
