import type { MatchedRoute, MethodData, Node, RouterContext } from './types';

export interface RouterCompilerOptions {
	matchAll?: boolean;
}

/**
 * Compiles the router instance into a faster route-matching function.
 *
 * **IMPORTANT:** `compileRouter` requires eval support with `new Function()` in the runtime for JIT compilation.
 *
 * @example
 * import { createRouter, addRoute } from "rou3";
 * import { compileRouter } from "rou3/compiler";
 * const router = createRouter();
 * // [add some routes]
 * const findRoute = compileRouter(router);
 * const matchAll = compileRouter(router, { matchAll: true });
 * findRoute("GET", "/path/foo/bar");
 *
 * @param router - The router context to compile.
 */
export function compileRouter<T, O extends RouterCompilerOptions = RouterCompilerOptions>(
	router: RouterContext<T>,
	opts?: O,
): (method: string, path: string) => O['matchAll'] extends true ? MatchedRoute<T>[] : MatchedRoute<T> | undefined {
	const deps: any[] = [];
	const compiled = compileRouteMatch(router, deps, opts?.matchAll);
	return new Function(...deps.map((_, i) => 'd' + (i + 1)), `return(m,p)=>{${compiled}}`)(...deps);
}

/**
 * Compile the router instance into a compact runnable code.
 *
 * **IMPORTANT:** Route data must be serializable to JSON (i.e., no functions or classes) or implement the `toJSON()` method to render custom code.
 *
 * @example
 * import { createRouter, addRoute } from "rou3";
 * import { compileRouterToString } from "rou3/compiler";
 * const router = createRouter();
 * // [add some routes with serializable data]
 * const compilerCode = compileRouterToString(router, "findRoute");
 * // "const findRoute=(m, p) => {}"
 */
export function compileRouterToString(router: RouterContext, functionName?: string, opts?: RouterCompilerOptions): string {
	const compiled = `(m,p)=>{${compileRouteMatch(router, undefined, opts?.matchAll)}}`;
	return functionName ? `const ${functionName}=${compiled};` : compiled;
}

// ------- internal functions -------

// p: path
// s: path parts
// l: path parts length
// m: method
// r: matchAll matches

/**
 * Compile a router to pattern matching statements
 * @param router
 * @param deps - Dependencies of the function scope
 */
function compileRouteMatch(router: RouterContext<any>, deps?: any[], matchAll?: boolean): string {
	// Ignore trailing slash
	let str = `${matchAll ? `let r=[];` : ''}if(p[p.length-1]==='/')p=p.slice(0,-1)||'/';`;

	const staticNodes = new Set<Node>();

	for (const key in router.static) {
		const node = router.static[key];
		if (node?.methods) {
			staticNodes.add(node);
			str += `if(p===${JSON.stringify(key.replace(/\/$/, '') || '/')}){${compileMethodMatch(node.methods, [], deps, -1, matchAll)[1]}}`;
		}
	}

	const [existsTail, tail] = compileNode(router.root, [], 0, deps, false, staticNodes, matchAll);
	return str + (existsTail ? "let s=p.split('/'),l=s.length-1;" + tail + (matchAll ? ';return r' : '') : '');
}

function compileMethodMatch(
	methods: Record<string, MethodData<any>[] | undefined>,
	params: string[],
	deps: any[] | undefined,
	currentIdx: number, // Set to -1 for non-param node
	matchAll: boolean | undefined,
): [boolean, string] {
	let str = '';
	let exists = false;
	for (const key in methods) {
		const data = methods[key];
		if (data && data?.length > 0) {
			exists = true;
			// Don't check for matchAll method handler
			if (key !== '') str += `if(m==='${key}')`;
			const dataValue = data[0].data;
			let res = deps
				? `{data:d${deps.push(dataValue)}`
				: `{data:${typeof dataValue?.toJSON === 'function' ? dataValue.toJSON() : JSON.stringify(dataValue)}`;

			// Add param properties
			const { paramsMap } = data[0];
			if (paramsMap && paramsMap.length > 0) {
				// Check for optional end parameters
				const required = !paramsMap[paramsMap.length - 1][2] && currentIdx !== -1;
				if (required) str += `if(l>=${currentIdx})`;

				// Create the param object based on previous parameters
				res += ',params:{';
				for (let i = 0; i < paramsMap.length; i++) {
					const map = paramsMap[i];

					res +=
						typeof map[1] === 'string'
							? `${JSON.stringify(map[1])}:${params[i]},`
							: `...(${map[1].toString()}.exec(${params[i]}))?.groups,`;
				}
				res += '}';
			}

			str += matchAll ? `r.unshift(${res}});` : `return ${res}};`;
		}
	}
	return [exists, str];
}

/**
 * Compile a node to matcher logic
 */
function compileNode(
	node: Node<any>,
	params: string[],
	startIdx: number,
	deps: any[] | undefined,
	isParamNode: boolean,
	staticNodes: Set<Node>,
	matchAll: boolean | undefined,
): [boolean, string] {
	let str = '';
	let exists = false;

	if (node.methods && !staticNodes.has(node)) {
		const [existsChild, match] = compileMethodMatch(node.methods, params, deps, isParamNode ? startIdx : -1, matchAll);
		if (existsChild) {
			exists = true;
			str += `if(l===${startIdx}${isParamNode ? `||l===${startIdx - 1}` : ''}){${match}}`;
		}
	}

	if (node.static) {
		for (const key in node.static) {
			const [existsChild, match] = compileNode(node.static[key], params, startIdx + 1, deps, false, staticNodes, matchAll);
			if (existsChild) {
				exists = true;
				str += `if(s[${startIdx + 1}]===${JSON.stringify(key)}){${match}}`;
			}
		}
	}

	if (node.param) {
		const [existsChild, match] = compileNode(
			node.param,
			[...params, `s[${startIdx + 1}]`],
			startIdx + 1,
			deps,
			true,
			staticNodes,
			matchAll,
		);
		if (existsChild) {
			exists = true;
			str += match;
		}
	}

	if (node.wildcard) {
		const { wildcard } = node;
		if (hasChild(wildcard)) {
			throw new Error('Compiler mode does not support patterns after wildcard');
		}

		if (wildcard.methods) {
			const [existsChild, match] = compileMethodMatch(
				wildcard.methods,
				[...params, `s.slice(${startIdx + 1}).join('/')`],
				deps,
				startIdx,
				matchAll,
			);
			if (existsChild) {
				exists = true;
				str += match;
			}
		}
	}

	return [exists, str];
}

/**
 * Whether the current node has children nodes
 * @param n
 */
function hasChild(n: Node<any>): boolean {
	return !!(n.static || n.param || n.wildcard);
}
