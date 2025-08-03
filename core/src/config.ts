import { defaultApiConfig, locales, modes, openapiUis, pathRegex } from './constants';
import { APIConfig, AppLocale, AppMode, OpenApiUi } from './types';

class Config {
	private static instance: Config;

	private settings: APIConfig;

	private constructor() {
		this.settings = defaultApiConfig;
		this.mergeFromProcessEnv();
	}

	static getInstance(): Config {
		if (!Config.instance) {
			Config.instance = new Config();
		}
		return Config.instance;
	}

	private warnInvalidEnv(envIndex: string, invalidValue: any) {
		console.warn(
			`${new Date().toISOString()} ⚠️ Invalid '${envIndex}' env value: '${invalidValue}', i will use default or user defined value`,
		);
	}

	mergeFromProcessEnv() {
		const env = typeof process !== 'undefined' && typeof process.env !== 'undefined' ? process.env : false;
		if (!env) return this;

		const appModeValue = env.NODE_ENV ?? env.APP_MODE;
		if (appModeValue && !modes.includes(appModeValue as AppMode)) this.warnInvalidEnv('APP_MODE', appModeValue);
		else if (appModeValue) this.set('mode', appModeValue as AppMode);

		if (env.APP_VERSION) this.set('version', env.APP_VERSION);

		const portValue = env.PORT;
		if (portValue && isNaN(Number(portValue))) this.warnInvalidEnv('PORT', portValue);
		else if (portValue) this.set('port', Number(portValue));

		if (env.OPENAPI) this.set('withOpenapi', env.OPENAPI === 'true' || env.OPENAPI === '1');

		const localeValue = env.LOCALE;
		if (localeValue && !locales.includes(localeValue as AppLocale)) this.warnInvalidEnv('LOCALE', localeValue);
		else if (localeValue) this.set('locale', localeValue as AppLocale);

		if (env.OPENAPI_TITLE) this.set('openapiTitle', env.OPENAPI_TITLE);
		if (env.OPENAPI_DESCRIPTION) this.set('openapiDescription', env.OPENAPI_DESCRIPTION);

		const openapiPathValue = env.OPENAPI_PATH;
		if (openapiPathValue && !pathRegex.test(openapiPathValue)) this.warnInvalidEnv('OPENAPI_PATH', openapiPathValue);
		else if (openapiPathValue) this.set('openapiBasePath', openapiPathValue);

		const openapiUiValue = env.OPENAPI_UI;
		if (openapiUiValue && !openapiUis.includes(openapiUiValue as OpenApiUi)) this.warnInvalidEnv('OPENAPI_UI', openapiUiValue);
		else if (openapiUiValue) this.set('openapiUi', openapiUiValue as OpenApiUi);

		return this;
	}

	merge(settings: Partial<APIConfig>) {
		const filtered = Object.fromEntries(Object.entries(settings).filter(([_, v]) => v !== undefined));

		Object.assign(this.settings, filtered);

		return this;
	}

	set<K extends keyof APIConfig>(key: K, value: APIConfig[K]) {
		this.settings[key] = value;
		return this;
	}

	get<K extends keyof APIConfig>(key: K): APIConfig[K] {
		return this.settings[key];
	}

	all() {
		return this.settings;
	}
}

export const config = Config.getInstance();
