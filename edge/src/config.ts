import { defaultApiConfig, locales, modes, openapiUis, pathRegex } from './constants';
import { logger } from './logger';
import { APIConfig, AppLocale, AppMode, OpenApiUi } from './types';
import { objectCleanUndefined } from './utils';

class Config {
	private static instance: Config;

	private settings: APIConfig;

	private constructor() {
		this.settings = defaultApiConfig;
	}

	static getInstance(): Config {
		this.instance ??= new Config();
		return this.instance;
	}

	private warnInvalidEnv(envIndex: string, invalidValue: any) {
		logger.warn(
			`${new Date().toISOString()} ⚠️  '${envIndex}' contains an invalid value (${invalidValue}). Falling back to the configured fallback value.`,
		);
	}

	/** nosonar */ mergeEnv(env: any) {
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
		Object.assign(this.settings, objectCleanUndefined(settings));

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
