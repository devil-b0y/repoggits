// The contract every part of the database manager builds against: what a configured database is, what an adapter must
// do, and what a synchronisation reports. Safe to import from client components — it holds no driver and no secret.
// Passwords never appear in any type here; a stored connection carries a secret *reference*, resolved server-side only.

export const PROVIDERS={postgres:'PostgreSQL',mysql:'MySQL / MariaDB'} as const;
export type Provider=keyof typeof PROVIDERS;
export const SSL_MODES=['disable','no-verify','require','verify-ca','verify-full'] as const;
export type SslMode=typeof SSL_MODES[number];

export const HEALTH={unknown:'Not checked',healthy:'Healthy',degraded:'Degraded',unreachable:'Unreachable'} as const;
export type Health=keyof typeof HEALTH;
/** Where a connection sits in the switching lifecycle. Exactly one is `active`; the one before it stays `standby` for rollback. */
export const ROLES={active:'Active',standby:'Standby',configured:'Configured',disabled:'Disabled'} as const;
export type Role=keyof typeof ROLES;

/** One configured database, as the admin panel sees it. Never carries a password — see `secretRef`. */
export type DatabaseRecord={
  id:string;name:string;provider:Provider;
  host:string;port:number;database:string;username:string;schema:string;
  ssl:SslMode;
  /** Names where the password lives: an env var (`env:TARGET_DATABASE_PASSWORD`) or the sealed store (`vault:<id>`). */
  secretRef:string;
  enabled:boolean;role:Role;
  createdAt:string;
  lastTestedAt:string|null;lastTestError:string;health:Health;latencyMs:number|null;
  lastSyncAt:string|null;lastSyncRows:number|null;
  schemaVersion:number|null;serverVersion:string;
  /** True for the connection that came from DATABASE_URL, which cannot be removed — it is the bootstrap. */
  bootstrap:boolean;
};
/** What an administrator submits. The password is accepted here and immediately sealed; it is never read back out. */
export type DatabaseInput=Pick<DatabaseRecord,'name'|'provider'|'host'|'port'|'database'|'username'|'schema'|'ssl'>&{password?:string};

// ----- Adapters -----
export type Row=Record<string,unknown>;
/** A column as the adapter reports it, in provider-neutral terms so two providers can be compared. */
export type ColumnInfo={name:string;type:string;nullable:boolean;default:string|null};
export type TableInfo={name:string;columns:ColumnInfo[];indexes:string[];primaryKey:string[]};
export type Snapshot={serverVersion:string;tables:TableInfo[];rows:Record<string,number>};

/**
 * What every provider must be able to do. The application never talks to a driver directly: it asks the manager for the
 * active adapter and calls `query`, so the rest of the codebase does not know which provider is answering.
 * `query` always receives PostgreSQL-flavoured SQL with $1 placeholders — the adapter translates for its own dialect.
 */
export type Adapter={
  readonly provider:Provider;
  readonly id:string;
  query<T extends Row=Row>(statement:string,values?:unknown[]):Promise<T[]>;
  transaction<T>(run:(tx:Pick<Adapter,'query'>)=>Promise<T>):Promise<T>;
  /** Creates or upgrades the application schema in this provider's own DDL. Non-destructive: it only adds. */
  applySchema():Promise<void>;
  /** Tables, columns, indexes and row counts, for comparison and verification. */
  snapshot():Promise<Snapshot>;
  /** A stable hash over a table's rows, used to prove a copy matches without shipping every row back. */
  checksum(table:string,columns:string[]):Promise<string>;
  ping():Promise<{ok:boolean;latencyMs:number;serverVersion:string}>;
  close():Promise<void>;
};

// ----- Comparison and synchronisation -----
export type TableDiff={table:string;onlyInSource:string[];onlyInTarget:string[];typeMismatches:{column:string;source:string;target:string}[];sourceRows:number;targetRows:number};
export type Comparison={generatedAt:string;source:string;target:string;missingTables:string[];extraTables:string[];tables:TableDiff[];rowTotals:{source:number;target:number};schemaVersion:{source:number|null;target:number|null};compatible:boolean};

export type SyncMode='full'|'incremental';
export type SyncPhase='connecting'|'schema'|'copying'|'verifying'|'done'|'failed';
export type TableResult={table:string;copied:number;sourceRows:number;targetRows:number;checksumMatch:boolean|null;error:string};
/** The outcome of one synchronisation. `verified` is the only thing a switch is allowed to trust. */
export type SyncReport={
  id:string;mode:SyncMode;source:string;target:string;phase:SyncPhase;
  startedAt:string;finishedAt:string|null;durationMs:number;
  tables:TableResult[];totalCopied:number;
  verified:boolean;errors:string[];
};

/** Counts the admin panel shows after a sync, and that a switch refuses to proceed without. */
export type IntegrityCheck={users:{source:number;target:number};projects:{source:number;target:number};events:{source:number;target:number};audit:{source:number;target:number};foreignKeysOk:boolean;checksumsOk:boolean;passed:boolean};

export type SwitchStep='test'|'compare'|'schema'|'sync'|'freeze'|'final-sync'|'verify'|'activate'|'unfreeze'|'rollback';
export type SwitchReport={id:string;from:string;to:string;startedAt:string;finishedAt:string|null;steps:{step:SwitchStep;ok:boolean;detail:string;ms:number}[];integrity:IntegrityCheck|null;succeeded:boolean;rolledBack:boolean;error:string};

/** What GET /api/admin/database returns. */
export type DatabaseOverview={databases:DatabaseRecord[];activeId:string;writesFrozen:boolean;registrySource:string};
