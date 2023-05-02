import WebSocket from 'ws';
import { AsksSchema, Chains, DataType } from '../types';
import { InsertionService } from './InsertionService';
import { LoggerService } from './LoggerService';
import { PARSER_METHODS } from './SyncService';

// should it emit or insert on its own?

export interface ToConnect {
  asks: boolean;
}

export interface WebSocketConfig {
  contracts?: string[];
  apiKey: string;
  chain: Chains;
  toConnect: ToConnect;
}
export type MessageType = 'connection';
export type MessageEvent = 'subscribe' | 'ask.created' | 'ask.updated';
export interface SocketMessage {
  type: MessageType;
  event: MessageEvent;
  status: string;
  data: AsksSchema;
}
export interface SocketError {
  name: string;
  message: string;
  stack?: string;
}

enum URLS {
  'goerli' = 'wss://ws.dev.reservoir.tools?',
  'mainnet' = 'wss://ws.reservoir.tools?',
}

class _WebSocketService {
  /**
   * # _ws
   * WebSocket connection
   * @access private
   */
  private _ws: WebSocket | null;

  private _url: URLS | null;

  private _config: WebSocketConfig | null;

  /**
   * # _isConnected
   */
  private _isConnected: boolean | null;

  constructor() {
    this._ws = null;
    this._url = null;
    this._config = null;
    this._isConnected = null;
  }

  /**
   * # set
   * @access public
   * @returns void
   */
  public set(config: WebSocketConfig): void {
    this._config = config;
    this._url = URLS[this._config.chain];
  }
  /**
   * # launch
   * @access public
   * @returns void
   */
  public launch(): void {
    this._connect();
  }

  /**
   * # _connect
   * Connects to the websocket
   */
  private _connect(): void {
    if (this._isConnected) return;
    this._ws = new WebSocket(`${this._url}?api_key=${this._config?.apiKey}`);

    this._ws.on('close', this._onClose.bind(this));
    this._ws.on('error', this._onError.bind(this));
    this._ws.on('message', this._onMessage.bind(this));
  }
  /**
   * # _onOpen
   * Connection
   * @returns void
   */
  private _onConnected(): void {
    if (this._config?.contracts && this._config.contracts.length > 0) {
      this._config.contracts.forEach((contract) => {
        if (this._config?.toConnect.asks) {
          this._subscribe('ask.created', contract);
          this._subscribe('ask.updated', contract);
        }
      });
    }

    if (this._config?.toConnect.asks) {
      this._subscribe('ask.created');
      this._subscribe('ask.updated');
    }
  }
  /**
   * # _onMessage
   * Callback binded to WebSocket message event
   * @param {Buffer} message - WebSocket message
   * @returns void
   */
  private _onMessage(message: Buffer): void {
    try {
      const { type, status, data, event }: SocketMessage = JSON.parse(
        message.toString('utf-8')
      );

      if (!event || event === 'subscribe') return;
      if (type === 'connection' && status === 'ready') {
        this._isConnected = true;
        this._onConnected();
        return;
      }

      if (event.includes('ask')) {
        InsertionService.upsert({
          table: 'asks',
          data: PARSER_METHODS['asks'](
            [data] as DataType<'asks'>,
            this._config?.contracts
          ),
        });
      }
    } catch (err) {
      LoggerService.error(err);
    }
  }
  private _onClose(code: number, reason: Buffer): void {
    this._isConnected = false;
    try {
      this._ws?.close();
      const reconnect = setInterval(() => {
        this._connect();
        if (this._isConnected) clearInterval(reconnect);
      }, 5000);
    } catch (err) {
      LoggerService.error(err);
    }
  }
  private _onError(err: SocketError): void {
    LoggerService.error(err);
  }
  /**
   * # _subscribe
   * Subcribe to WebSocket events
   */
  private _subscribe(event: MessageEvent, contract?: string): void {
    console.log(`CALLED`);
    console.log(
      JSON.stringify(
        `Sending message: ${{
          type: 'subscribe',
          event,
          ...(contract && { contract }),
        }}`
      )
    );
    this._ws?.send(
      JSON.stringify({
        type: 'subscribe',
        event,
        ...(contract && { contract }),
      })
    );
  }
}

export const WebSocketService = new _WebSocketService();
