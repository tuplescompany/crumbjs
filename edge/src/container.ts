// ─────────────────────────────── Types ───────────────────────────────

export type Service<T> = {
	type: 'singleton' | 'transient';
	instance?: T;
	factory?: (di: Container<any, any>) => T;
};

export type Deps = Record<string, Service<any>>;
export type InstanceOf<S> = S extends Service<infer R> ? R : never;
export type Merge<A, B> = Omit<A, keyof B> & B;

export type Dependencies<D extends Deps> = {
	readonly [K in keyof D]: InstanceOf<D[K]>;
};

// ─────────────────────────────── Container ───────────────────────────────

export class Container<D extends Deps, E extends Record<string, any>> {
	private constructor(
		private readonly defs: D,
		public readonly env: E,
	) {}

	/** Punto de entrada: crea un contenedor vacío (y opcionalmente su env). */
	static create<E extends Record<string, any> = {}>(env?: E) {
		return new Container<{}, E>({} as {}, (env ?? {}) as E);
	}

	/** Tipado del logger (helper opcional) */
	logger(ctx: string = 'default') {
		return new Logger((this.env as any).LOG_LEVEL ?? 'DEBUG').ctx(ctx);
	}

	/** Proxy para destructuring tipado: const { db } = di.export() */
	export(): Dependencies<D> {
		const di = this;
		return new Proxy<Dependencies<D>>({} as any, {
			get(_t, prop: string) {
				return di.inject(prop as any);
			},
		});
	}

	/** Inyecta una dependencia registrada. */
	inject<K extends keyof D & string>(key: K): InstanceOf<D[K]> {
		const entry = (this.defs as any)[key] as Service<any> | undefined;
		if (!entry) throw new Error(`Service "${String(key)}" not registered`);
		return this.#resolve(key, entry);
	}

	/** Añade/mergea variables de entorno (devuelve NUEVO contenedor). */
	withEnv<NE extends Record<string, any>>(env: NE): Container<D, Merge<E, NE>> {
		return new Container(this.defs, { ...this.env, ...env } as Merge<E, NE>);
	}

	/** Registra una instancia ya creada como singleton (fluido + tipado). */
	value<K extends string, T>(key: K, instance: T): Container<Merge<D, Record<K, Service<T>>>, E> {
		const next = { ...(this.defs as object) } as D & Record<K, Service<T>>;
		(next as any)[key] = { type: 'singleton', instance };
		return new Container(next, this.env as E);
	}

	/** Registra un factory transient (se ejecuta en cada inject). */
	transient<K extends string, T>(key: K, factory: (di: Container<D, E>) => T): Container<Merge<D, Record<K, Service<T>>>, E> {
		const next = { ...(this.defs as object) } as D & Record<K, Service<T>>;
		(next as any)[key] = { type: 'transient', factory };
		return new Container(next, this.env as E);
	}

	/** Registra un factory lazy singleton (se ejecuta 1ra vez). */
	lazy<K extends string, T>(key: K, factory: (di: Container<D, E>) => T): Container<Merge<D, Record<K, Service<T>>>, E> {
		const next = { ...(this.defs as object) } as D & Record<K, Service<T>>;
		(next as any)[key] = { type: 'singleton', factory };
		return new Container(next, this.env as E);
	}

	/** Composición de módulos: last-writer-wins en deps y env. */
	mount<C extends Deps, SubEnv extends Record<string, any>>(other: Container<C, SubEnv>): Container<Merge<D, C>, Merge<E, SubEnv>> {
		// Copia superficial para mantener inmutabilidad.
		const mergedDefs = { ...(this.defs as object) } as Merge<D, C>;
		for (const k of Object.keys(other.defs as object)) {
			(mergedDefs as any)[k] = (other.defs as any)[k];
		}
		const mergedEnv = { ...this.env, ...other.env } as Merge<E, SubEnv>;
		return new Container<Merge<D, C>, Merge<E, SubEnv>>(mergedDefs, mergedEnv);
	}

	// ─────────── internals ───────────
	#resolve<T>(key: string, entry: Service<any>): T {
		if (entry.type === 'singleton') {
			if ('instance' in entry && entry.instance !== undefined) {
				return entry.instance as T;
			}
			if (!entry.factory) throw new Error(`Service "${key}" lacks factory`);
			const inst = entry.factory(this);
			// cache in-place (los defs son “propios” en cada instancia)
			(entry as Service<T>).instance = inst;
			return inst as T;
		}
		// transient
		if (!entry.factory) throw new Error(`Service "${key}" lacks factory`);
		return entry.factory(this) as T;
	}
}

// ─────────────────────────────── Uso ───────────────────────────────
// Tipado incremental sin builder:
const di = Container.create({ DB_URL: 'postgres://…', LOG_LEVEL: 'INFO' })
	.lazy('db', (di) => new DB(di.env.DB_URL))
	.lazy('userRepo', (di) => new UserRepo(di.inject('db')))
	.value('myClass', new MyClass());

// destructuring tipado:
const { userRepo } = di.export();
