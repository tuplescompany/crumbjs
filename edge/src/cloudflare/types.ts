// CF type: ExecutionContext
export interface IExecutionContext {
	waitUntil(promise: Promise<any>): void;
	passThroughOnException(): void;
	props: any;
}

// Execution Context implementation eg. For testing runtimes
export class DefaultExecutionContext implements IExecutionContext {
	readonly #waitUntil: Promise<any>[] = [];
	#passThrough = false;
	props: Record<string, any> = {};

	waitUntil(promise: Promise<any>): void {
		this.#waitUntil.push(promise);
	}

	passThroughOnException(): void {
		this.#passThrough = true;
	}

	async run(): Promise<void> {
		// Wait for all registered async tasks
		await Promise.allSettled(this.#waitUntil);
	}

	get passThroughEnabled(): boolean {
		return this.#passThrough;
	}
}

// CF type: Fetcher
export interface IFetcher {
	fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
	connect(
		address:
			| {
					hostname: string;
					port: number;
			  }
			| string,
		options?: {
			secureTransport?: string;
			allowHalfOpen: boolean;
			highWaterMark?: number | bigint;
		},
	): ISocket;
}

// CF type: Socket
interface ISocket {
	get readable(): ReadableStream;
	get writable(): WritableStream;
	get closed(): Promise<void>;
	get opened(): Promise<ISocketInfo>;
	get upgraded(): boolean;
	get secureTransport(): 'on' | 'off' | 'starttls';
	close(): Promise<void>;
	startTls(options?: ITlsOptions): ISocket;
}

// CF type: SocketInfo
interface ISocketInfo {
	remoteAddress?: string;
	localAddress?: string;
}

// CF type: TlsOptions
interface ITlsOptions {
	expectedServerHostname?: string;
}
