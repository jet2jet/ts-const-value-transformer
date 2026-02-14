// @internal
import * as console from 'console';
// @internal
import { SyncChildProcess } from 'sync-child-process';

interface SendData {
  jsonrpc: string;
  id: number | string;
  method: string;
  params?: object | undefined;
}
interface NotificationData {
  jsonrpc: string;
  method: string;
  params?: object | undefined;
}
interface ResultData {
  jsonrpc: string;
  id: number | string;
  result: object | null;
}

interface ServerMessageHandler {
  method: string;
  callback: (
    method: string,
    params: object | undefined
  ) => object | null | undefined;
}

interface NotificationHandler {
  method: string;
  callback: (method: string, params: object | undefined) => void;
}

export default class SyncLspClient {
  /** process */
  private readonly _p: SyncChildProcess;
  private _id: number;
  /** received data */
  private readonly _r: ResultData[];
  /** server message handlers */
  private readonly _s: ServerMessageHandler[];
  /** notification handlers */
  private readonly _n: NotificationHandler[];
  /** last buffer */
  private _l: Buffer | null | undefined;
  /** encoding */
  private readonly _e: BufferEncoding;

  public constructor(
    command: string,
    argv: string[],
    encoding: BufferEncoding = 'utf8'
  ) {
    this._p = new SyncChildProcess(command, argv);
    this._id = 0;
    this._r = [];
    this._s = [];
    this._n = [];
    this._e = encoding;
  }

  private sendRaw(jsonRpc: object) {
    const jsonRpcStr = JSON.stringify(jsonRpc);
    // console.log(`sending: ${jsonRpcStr}`);
    const contentLength = Buffer.from(jsonRpcStr, this._e).byteLength;
    this._p.stdin.write(
      `Content-Length: ${contentLength}\r\n\r\n${jsonRpcStr}`
    );
  }

  public sendMessage(method: string, params?: object): number | string {
    const id = this._id++;
    const jsonRpcRequest: SendData = {
      jsonrpc: '2.0',
      id,
      method,
    };
    if (params) {
      jsonRpcRequest.params = params;
    }
    this.sendRaw(jsonRpcRequest);
    return id;
  }

  public notifyMessage(method: string, params?: object): void {
    const jsonRpcRequest: NotificationData = {
      jsonrpc: '2.0',
      method,
    };
    if (params) {
      jsonRpcRequest.params = params;
    }
    this.sendRaw(jsonRpcRequest);
  }

  private pushReceived(json: string) {
    try {
      const jsonData: unknown = JSON.parse(json);
      // console.log('Received:', jsonData);
      if (typeof jsonData !== 'object' || !jsonData) {
        return;
      }
      if (!('jsonrpc' in jsonData) || jsonData.jsonrpc !== '2.0') {
        return;
      }
      if ('id' in jsonData) {
        if ('method' in jsonData) {
          for (let s = this._s, l = s.length, i = 0; i < l; ++i) {
            const o = s[i]!;
            if (o.method === jsonData.method) {
              const r = o.callback(o.method, (jsonData as SendData).params);
              this.sendRaw({
                jsonrpc: '2.0',
                id: jsonData.id as string | number,
                result: r ?? null,
              } satisfies ResultData);
              break;
            }
          }
        } else {
          this._r.push(jsonData as ResultData);
        }
      } else if ('method' in jsonData) {
        for (let n = this._n.slice(), l = n.length, i = 0; i < l; ++i) {
          const o = n[i]!;
          if (o.method === jsonData.method) {
            o.callback(o.method, (jsonData as NotificationData).params);
          }
        }
      }
    } catch {}
  }

  public pumpMessage(flushOnly = false): boolean {
    let returnIfNoData = flushOnly;
    for (;;) {
      const lastBuffer = this._l;
      this._l = null;
      if (lastBuffer) {
        const headers: Partial<Record<string, string>> = {};
        let start = 0;
        let cur = 0;
        while (cur < lastBuffer.length) {
          const c = lastBuffer[cur];
          if (
            c === 10 ||
            (c === 13 &&
              cur < lastBuffer.length - 1 &&
              lastBuffer[cur + 1] === 10)
          ) {
            if (start === cur) {
              if (c === 13) {
                ++cur;
              }
              ++cur;
              break;
            }
            const headerLine = lastBuffer
              .subarray(start, cur)
              .toString(this._e);
            const [n, v = ''] = headerLine.split(':', 2);
            headers[n!.trim().toLowerCase()] = v.trim();
            if (c === 13) {
              ++cur;
            }
            start = cur + 1;
          }
          ++cur;
        }
        if (cur === lastBuffer.length) {
          // buffer is not enough
          this._l = lastBuffer;
        } else {
          // If no content-length, drop
          if (headers['content-length'] != null) {
            const last = cur + (Number(headers['content-length']) || 0);
            if (last > lastBuffer.length) {
              // buffer is not enough
              this._l = lastBuffer;
            } else {
              const bin = lastBuffer.subarray(cur, last);
              if (last < lastBuffer.length) {
                this._l = lastBuffer.subarray(last);
              }
              this.pushReceived(bin.toString(this._e));
              returnIfNoData = true;
              continue;
            }
          }
        }
      }

      if (returnIfNoData) {
        return true;
      }

      for (;;) {
        const r = this._p.next();
        if (r.done) {
          return false;
        }
        const recv = r.value;
        if (recv.type === 'stderr') {
          console.error(recv.data.toString(this._e));
          continue;
        }
        this._l = this._l ? Buffer.concat([this._l, recv.data]) : recv.data;
        break;
      }
    }
  }

  public receiveMessage(id: number | string): object | null | undefined {
    for (;;) {
      for (let r = this._r, i = 0, l = r.length; i < l; ++i) {
        const obj = r[i]!;
        if (obj.id === id) {
          r.splice(i, 1);
          return obj.result;
        }
      }
      if (!this.pumpMessage()) {
        throw new Error('Peer closed');
      }
    }
  }

  public registerServerMessageHandler(
    method: string,
    callback: (
      method: string,
      params: object | undefined
    ) => object | null | undefined,
    once = false
  ): () => void {
    // eslint-disable-next-line prefer-const
    let unsub: () => void;
    if (once) {
      const cb = (
        (callback) =>
        (
          method: string,
          params: object | undefined
        ): object | null | undefined => {
          const r = callback(method, params);
          unsub!();
          return r;
        }
      )(callback);
      callback = cb;
    }
    this._s.push({ method, callback });
    unsub = () => {
      for (let s = this._s, l = s.length, i = 0; i < l; ++i) {
        const o = s[i]!;
        if (o.method === method && o.callback === callback) {
          s.splice(i, 1);
          break;
        }
      }
    };
    return unsub;
  }

  public registerNotificationHandler(
    method: string,
    callback: (method: string, params: object | undefined) => void,
    once = false
  ): () => void {
    // eslint-disable-next-line prefer-const
    let unsub: () => void;
    if (once) {
      const cb = (
        (callback) =>
        (method: string, params: object | undefined): void => {
          callback(method, params);
          unsub!();
        }
      )(callback);
      callback = cb;
    }
    this._n.push({ method, callback });
    unsub = () => {
      for (let n = this._n, l = n.length, i = 0; i < l; ++i) {
        const o = n[i]!;
        if (o.method === method && o.callback === callback) {
          n.splice(i, 1);
          break;
        }
      }
    };
    return unsub;
  }

  public close(): void {
    this._p.stdin.end();
  }
}
