import { config } from '../config';
import { getModeLogLevel } from './utils';

export enum LogLevel {
	DEBUG = 10,
	INFO = 20,
	WARN = 30,
	ERROR = 40,
}

const LogColors: Record<keyof typeof LogLevel, string> = {
	DEBUG: '\x1b[90m', // gray
	INFO: '\x1b[36m', // cyan
	WARN: '\x1b[33m', // yellow
	ERROR: '\x1b[31m', // red
};

const ResetColor = '\x1b[0m';

/**
 * Logger utilify with LEVELs
 */
export class Logger {
	private logContext: string;
	private logLevel: LogLevel;

	constructor(level: LogLevel, context: string = 'default') {
		this.logLevel = level;
		this.logContext = context;
	}

	/**
	 * Set the current log level.
	 */
	level(level: LogLevel) {
		this.logLevel = level;
		return this;
	}

	/**
	 * Set the current log context name.
	 */
	context(context: string) {
		this.logContext = context;
		return this;
	}

	private log(severity: keyof typeof LogLevel, force: boolean, ...data: any[]): void {
		if (LogLevel[severity] >= this.logLevel || force) {
			const color = LogColors[severity];
			const paddedSeverity = severity.padEnd(5, ' ');
			console.log(`${new Date().toISOString()} ${color}${paddedSeverity}${ResetColor} [${this.logContext}]`, ...data);
		}
	}

	/** print log on any log level */
	print(...data: any[]): void {
		this.log('INFO', true, ...data);
	}

	debug(...data: any[]): void {
		this.log('DEBUG', false, ...data);
	}

	info(...data: any[]): void {
		this.log('INFO', false, ...data);
	}

	warn(...data: any[]): void {
		this.log('WARN', false, ...data);
	}

	error(...data: any[]): void {
		this.log('ERROR', false, ...data);
	}
}

/**
 * Creates a new `Logger` instance bound to the given context.
 *
 * If a log level is explicitly provided, it will be used.
 * Otherwise, the level is resolved from the current `ApiConfig` mode
 * via `getModeLogLevel()`.
 *
 * @param context - Name of the log context (e.g. module or subsystem).
 * @param level   - Optional log level to override the default resolved level.
 * @returns A configured `Logger` instance.
 */
export const createLogger = (context: string, level?: LogLevel) => {
	const logLevel = level ?? getModeLogLevel(config.get('mode'));
	return new Logger(logLevel).context(context);
};

/**
 * Global Logger instance within 'default' context
 */
export const logger = (() => {
	let instance = new Logger(LogLevel.DEBUG);

	return {
		instance,
		setLevel: (level: LogLevel) => instance.level(level),
		print: (...data: any[]) => instance.print(...data),
		debug: (...data: any[]) => instance.debug(...data),
		info: (...data: any[]) => instance.info(...data),
		warn: (...data: any[]) => instance.warn(...data),
		error: (...data: any[]) => instance.error(...data),
	};
})();
