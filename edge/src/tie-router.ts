import type { Handler, Method, Route, RouteConfig } from './types';

/**
 * A single trie node that represents one step in the path:
 * - `statics`: static children (e.g. "users" → node)
 * - `param`:   one parameter child (e.g. "{id}" → node) with the param name
 * - `splat`:   a wildcard child for "*" that consumes the rest of the path
 * - terminal payload (`handler`, `config`, `isProxy`) when a route ends here
 */
type TrieNode = {
	statics: Map<string, TrieNode>;
	param?: { name: string; node: TrieNode };
	splat?: TrieNode;
	handler?: Handler;
	config?: RouteConfig;
	isProxy?: boolean;
};

/** Helper: create a properly typed empty node to avoid union-widening issues. */
function createNode(): TrieNode {
	return { statics: new Map<string, TrieNode>() };
}

/** One trie (root) per HTTP method. */
type MethodTries = Partial<Record<Method, TrieNode>>;

/** Param segment: accepts "{name}" where name starts with [A-Za-z_] and continues with \w */
const PARAM_SEGMENT_RE = /^\{([A-Za-z_]\w*)\}$/;

/** Return type when we found a matching route */
type MatchHit = {
	kind: 'hit';
	handler: Handler;
	params: Record<string, string>;
	config: RouteConfig;
};

/** Nothing matched at all */
type MatchResult = MatchHit | null;

/**
 * Ultra-fast router: builds a trie per HTTP method and matches in O(k),
 * where k is the number of path segments. No RegExp in hot path.
 */
export class TrieRouter {
	private readonly rootsByMethod: MethodTries = {};

	constructor(routes: Route[]) {
		this.build(routes);
	}

	/**
	 * Build the tries once at boot time.
	 * Notes:
	 * - We normalize each route's path by trimming leading/trailing slashes.
	 * - "*" consumes the remainder of the path; anything after "*" is ignored.
	 * - "{param}" becomes a param edge storing the param name for extraction.
	 */
	private build(routes: Route[]): void {
		for (const route of routes) {
			// Get/create the root for this method (typed as TrieNode, not a bare object).
			const methodRoot: TrieNode = (this.rootsByMethod[route.method] ??= createNode());

			// Normalize route path to internal form: no leading/trailing slashes.
			const normalizedRoutePath = route.path.replace(/(?:^\/+|\/+$)/g, ''); // "" means "/"

			// If route is root "/"
			if (!normalizedRoutePath) {
				methodRoot.handler = route.handler;
				methodRoot.config = route.config;
				methodRoot.isProxy = route.isProxy;
				continue;
			}

			const segments = normalizedRoutePath.split('/');
			let node = methodRoot;

			for (const segment of segments) {
				// Wildcard: attach/descend into splat node and stop; nothing after "*" matters
				if (segment === '*') {
					node.splat ??= createNode();
					node = node.splat;
					break;
				}

				// Param: "{name}" → create or reuse the param child
				const paramMatch = PARAM_SEGMENT_RE.exec(segment);
				if (paramMatch) {
					const paramName = paramMatch[1];
					node.param ??= { name: paramName, node: createNode() };
					// If param already existed, keep the original name for consistency
					node = node.param.node;
					continue;
				}

				// Static: descend/create the static child
				let next = node.statics.get(segment);
				if (!next) {
					next = createNode();
					node.statics.set(segment, next);
				}
				node = next;
			}

			// Mark terminal route data at the final node
			node.handler = route.handler;
			node.config = route.config;
			node.isProxy = route.isProxy;
		}
	}

	/**
	 * Find a route for (method, path). If nothing matches exactly on that method,
	 * returns null. Here no 405/Allow logic—other methods don't matter.
	 *
	 * @param method HTTP method of the request.
	 * @param path   Request pathname (e.g. "/api/users/123/").
	 */
	match(method: Method, path: string): MatchResult {
		// Normalize path: treat "/foo/" and "/foo" as the same (except root "/")
		const normalizedPath = path.endsWith('/') && path !== '/' ? path.slice(0, -1) : path;

		// Only try the requested method
		return this.matchOnSingleMethod(method, normalizedPath);
	}

	/**
	 * Match against a single method trie. No regex, only string comparisons.
	 * Returns a full hit with extracted params, or null.
	 */
	private matchOnSingleMethod(method: Method, path: string): MatchHit | null {
		const root = this.rootsByMethod[method];
		if (!root) return null;

		// Remove leading slashes; keep root as empty string
		const cleaned = path.replace(/^\/+/, '');
		const segments = cleaned ? cleaned.split('/') : [];

		let node: TrieNode = root;
		const extractedParams: Record<string, string> = {};

		for (const current of segments) {
			// 1) Exact static edge
			const staticChild = node.statics.get(current);
			if (staticChild) {
				node = staticChild;
				continue;
			}

			// 2) Param edge
			if (node.param) {
				extractedParams[node.param.name] = current;
				node = node.param.node;
				continue;
			}

			// 3) Splat edge: consume the rest (including nothing) and stop walking
			if (node.splat) {
				node = node.splat;
				break;
			}

			// No edge matches this segment → no route for this method
			return null;
		}

		// Only a terminal node with a handler actually matches
		if (node.handler) {
			return {
				kind: 'hit',
				handler: node.handler,
				params: extractedParams,
				config: node.config ?? {},
			};
		}
		return null;
	}
}
