export interface IExecutionContext {
	waitUntil(promise: Promise<any>): void;
	passThroughOnException(): void;
	props: any;
}

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
interface ITlsOptions {
	expectedServerHostname?: string;
}
interface ISocketInfo {
	remoteAddress?: string;
	localAddress?: string;
}
