import type { Credentials } from "../auth.js";
import { buildHeaders } from "../auth.js";
import type { StreamEvent } from "../types.js";

/**
 * O(1) linked-list queue — replaces Array.shift() which is O(N).
 */
interface QueueNode<T> {
  value: T;
  next: QueueNode<T> | null;
}

class SimpleQueue<T> {
  private head: QueueNode<T> | null = null;
  private tail: QueueNode<T> | null = null;
  private _length = 0;

  get length() {
    return this._length;
  }

  enqueue(value: T) {
    const node: QueueNode<T> = { value, next: null };
    if (this.tail) this.tail.next = node;
    else this.head = node;
    this.tail = node;
    this._length++;
  }

  dequeue(): T | undefined {
    if (!this.head) return undefined;
    const value = this.head.value;
    this.head = this.head.next;
    if (!this.head) this.tail = null;
    this._length--;
    return value;
  }
}

/**
 * WebSocket event stream for real-time Council updates.
 */
export class EventStream {
  private ws: WebSocket | null = null;
  private subscriptions: string[] = [];
  private closed = false;
  private credentials: Credentials;

  constructor(credentials: Credentials) {
    this.credentials = credentials;
  }

  /**
   * Connect to the WebSocket event stream.
   */
  async connect(): Promise<void> {
    const base = this.credentials.baseUrl
      .replace("http://", "ws://")
      .replace("https://", "wss://");
    const url = `${base}/events`;

    // Use native WebSocket (browser/Node 21+) or ws package
    if (typeof WebSocket !== "undefined") {
      this.ws = new WebSocket(url);
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const wsModule = await import("ws");
        const WS = wsModule.default ?? wsModule;
        // ws package constructor accepts options as second param
        this.ws = new (WS as any)(url, {
          headers: buildHeaders(this.credentials),
        }) as unknown as WebSocket;
      } catch {
        throw new Error(
          "WebSocket not available. Install the ws package: npm install ws",
        );
      }
    }

    return new Promise<void>((resolve, reject) => {
      if (!this.ws) return reject(new Error("WebSocket not initialized"));

      this.ws.onopen = () => {
        // Send auth
        this.ws?.send(
          JSON.stringify({
            type: "auth",
            token:
              this.credentials.accessToken ??
              this.credentials.jwtToken ??
              this.credentials.apiKey,
          }),
        );
        resolve();
      };

      this.ws.onerror = (err) => {
        reject(new Error(`WebSocket error: ${err}`));
      };
    });
  }

  /**
   * Subscribe to a channel (e.g., 'agent:agent_abc123', 'jury:*').
   */
  async subscribe(channel: string): Promise<void> {
    this.subscriptions.push(channel);
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: "subscribe", channel }));
    }
  }

  /**
   * Unsubscribe from a channel.
   */
  async unsubscribe(channel: string): Promise<void> {
    this.subscriptions = this.subscriptions.filter((s) => s !== channel);
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify({ type: "unsubscribe", channel }));
    }
  }

  /**
   * Close the WebSocket connection.
   */
  async close(): Promise<void> {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Async iterator for events.
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<StreamEvent> {
    if (!this.ws) {
      await this.connect();
    }

    // Re-subscribe
    for (const channel of this.subscriptions) {
      this.ws?.send(JSON.stringify({ type: "subscribe", channel }));
    }

    const ws = this.ws!;
    const eventQueue = new SimpleQueue<StreamEvent>();
    let resolveWait: (() => void) | null = null;
    let done = false;

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>;
        const msgType = String(data.type ?? "");

        // Skip internal messages
        if (
          [
            "subscribe_ack",
            "unsubscribe_ack",
            "ping",
            "pong",
            "auth_success",
          ].includes(msgType)
        ) {
          return;
        }

        eventQueue.enqueue({
          type: msgType,
          data: (data.data ?? data) as Record<string, unknown>,
          timestamp: data.timestamp
            ? new Date(data.timestamp as string)
            : undefined,
        });

        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      done = true;
      if (resolveWait) {
        resolveWait();
        resolveWait = null;
      }
    };

    while (!done && !this.closed) {
      if (eventQueue.length > 0) {
        yield eventQueue.dequeue()!;
      } else {
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }
    }

    // Drain remaining
    while (eventQueue.length > 0) {
      yield eventQueue.dequeue()!;
    }
  }
}
