import type { OARoute } from '../core/src/types';
/**
 * Container for Open Api documentation
 * It integrates automagically with RouteConfigr routes
 */
export declare class OpenApi {
	private builder;
	constructor(title: string, version: string, description: string);
	private getRequestBody;
	private getParameters;
	private getParameter;
	private getResponses;
	private inferOperationId;
	private toOpenApiPath;
	register(route: OARoute): void;
	getDocument(): any;
	getJson(): any;
	getYaml(): any;
	getResponse(): Response;
}
