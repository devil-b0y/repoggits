// The application schema in MySQL/MariaDB DDL, hand-written to match lib/db.ts's applySchema() table for table —
// not derived from the PostgreSQL DDL string mechanically, because that DDL is one multi-statement block with a
// PL/pgSQL DO $$ ... $$ body and an advisory lock, and regex-translating arbitrary DDL is far riskier than transcribing
// a schema with 21 known tables once. This only ever runs against a brand-new or already-migrated target, so every
// table is written in its FINAL shape — there is no need to replay Postgres's incremental ALTER history.
//
// Type choices, and why:
//   uuid              -> CHAR(36)     the app generates every id in JS with randomUUID(); nothing needs a native uuid type
//   timestamptz       -> DATETIME(6)  MySQL has no zoned type; every value is written and read as UTC (see mysql.ts)
//   boolean           -> TINYINT(1)   MySQL's own convention; mysql2 maps this back to a JS boolean
//   jsonb             -> JSON         MySQL 5.7.8+/MariaDB 10.2.7+; older servers reject this and are not supported
//   text (PRIMARY KEY -> VARCHAR(n)/  MySQL cannot put a UNIQUE or PRIMARY KEY index on unbounded TEXT. Where the
//     or indexed)         CHAR(n)     stored value has a known fixed length (a sha-256 hex digest, an HMAC index) a
//                                     CHAR of that exact length is used; otherwise VARCHAR(191), the largest length
//                                     that stays under InnoDB's 767-byte index-entry limit for utf8mb4 on older
//                                     row formats — the same ceiling a shared cPanel host is most likely to still have.
//   email UNIQUE      -> dropped      the column holds encrypted ciphertext with no fixed length; the constraint the
//                                     application actually enforces and queries by is email_hash (CHAR(64)), which
//                                     keeps its unique index. See EMAIL_MATCH in lib/encryption.ts.
//
// Two things PostgreSQL enforces that MySQL cannot, handled deliberately rather than silently dropped:
//   - the partial unique index "at most one draft/pending/changes_requested version per project" is reproduced with a
//     generated column that is NULL for every other status, because MySQL (and Postgres) exclude NULL from uniqueness.
//   - CHECK constraints are still written: MySQL 8.0.16+ and MariaDB 10.2+ enforce them; MySQL 5.7 parses and silently
//     ignores them. Some cPanel hosts still run 5.7, so this is a known, honest gap — not a silent one.
//
// NOT carried over, and why: the two Postgres GIN/expression indexes (versions_data_idx on jsonb_path_ops, and
// users_avatar_idx on profile->>'avatarId') have no direct MySQL equivalent that the query translator's rewritten SQL
// would actually hit (MySQL's functional indexes must match the query's expression verbatim). Dropping them costs
// query speed on two specific lookups, never correctness — every row is still found, just by a table scan.

export const CHARSET='utf8mb4';
export const COLLATION='utf8mb4_0900_ai_ci';
/** MariaDB has no utf8mb4_0900_ai_ci (that collation is MySQL 8's default); this falls back where the server rejects it. */
export const COLLATION_FALLBACK='utf8mb4_unicode_ci';

const T=(name:string,body:string)=>`CREATE TABLE IF NOT EXISTS ${name} (${body}) ENGINE=InnoDB DEFAULT CHARSET=${CHARSET}`;
const uuid='CHAR(36)',sha256='CHAR(64)',now='DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)',flag='TINYINT(1) NOT NULL DEFAULT 0';

/** Every CREATE TABLE, in an order that lets every foreign key point at a table already created. Matches
 *  lib/database/sync/plan.ts's SCHEMA_TABLES order, which is itself derived from these same relationships. */
export const TABLES:readonly string[]=[
  T('users',`
    id ${uuid} PRIMARY KEY, email TEXT NOT NULL, email_hash ${sha256}, password_hash VARCHAR(255),
    name VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK(role IN ('student','teacher','superadmin')),
    verified ${flag}, suspended ${flag}, ai_blocked ${flag},
    scopes JSON NOT NULL, profile JSON NOT NULL, created_at ${now},
    UNIQUE KEY users_email_hash_idx (email_hash)
  `),
  T('visitors',`
    id ${uuid} PRIMARY KEY, token_hash ${sha256} NOT NULL, user_id ${uuid},
    first_seen_at ${now}, last_seen_at ${now},
    UNIQUE KEY visitors_token_hash_idx (token_hash),
    KEY visitors_user_idx (user_id), KEY visitors_last_seen_idx (last_seen_at),
    CONSTRAINT visitors_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  `),
  T('tracked_sessions',`
    id ${uuid} PRIMARY KEY, kind VARCHAR(20) NOT NULL CHECK(kind IN ('authenticated','anonymous')),
    user_id ${uuid}, visitor_id ${uuid}, started_at ${now}, last_seen_at ${now}, ended_at DATETIME(6),
    end_reason VARCHAR(20) NOT NULL DEFAULT '' CHECK(end_reason IN ('','logout','expired','revoked','password_reset','inactive','signed_in')),
    ip_address VARCHAR(64) NOT NULL DEFAULT '', device_type VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK(device_type IN ('desktop','mobile','tablet','bot','unknown')),
    os VARCHAR(60) NOT NULL DEFAULT '', os_version VARCHAR(30) NOT NULL DEFAULT '', browser VARCHAR(60) NOT NULL DEFAULT '', browser_version VARCHAR(30) NOT NULL DEFAULT '',
    user_agent VARCHAR(500) NOT NULL DEFAULT '', platform VARCHAR(120) NOT NULL DEFAULT '',
    screen_width INT, screen_height INT, pixel_ratio FLOAT, touch TINYINT(1),
    language VARCHAR(20) NOT NULL DEFAULT '', timezone VARCHAR(64) NOT NULL DEFAULT '', network_online TINYINT(1), referrer VARCHAR(500) NOT NULL DEFAULT '',
    current_path VARCHAR(500) NOT NULL DEFAULT '', current_project_id ${uuid},
    CHECK(kind='anonymous' OR user_id IS NOT NULL),
    KEY tracked_sessions_user_idx (user_id,last_seen_at), KEY tracked_sessions_last_seen_idx (last_seen_at),
    KEY tracked_sessions_started_idx (started_at), KEY tracked_sessions_visitor_idx (visitor_id), KEY tracked_sessions_ip_idx (ip_address),
    CONSTRAINT tracked_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT tracked_sessions_visitor_fk FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL
  `),
  T('sessions',`
    hash ${sha256} PRIMARY KEY, user_id ${uuid} NOT NULL, expires_at DATETIME(6) NOT NULL,
    created_at ${now}, tracked_session_id ${uuid},
    KEY sessions_user_idx (user_id), KEY sessions_tracked_idx (tracked_session_id),
    CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT sessions_tracked_fk FOREIGN KEY (tracked_session_id) REFERENCES tracked_sessions(id) ON DELETE SET NULL
  `),
  T('tokens',`
    hash ${sha256} PRIMARY KEY, user_id ${uuid} NOT NULL, purpose VARCHAR(20) NOT NULL,
    expires_at DATETIME(6) NOT NULL, code_hash ${sha256}, code_attempts INT NOT NULL DEFAULT 0,
    KEY tokens_user_purpose_idx (user_id,purpose),
    CONSTRAINT tokens_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  `),
  T('projects',`
    id ${uuid} PRIMARY KEY, owner_id ${uuid} NOT NULL, featured ${flag}, archived ${flag}, example ${flag},
    views INT NOT NULL DEFAULT 0, downloads INT NOT NULL DEFAULT 0, created_at ${now},
    parent_project_id ${uuid}, parent_version_id ${uuid},
    KEY projects_owner_idx (owner_id), KEY projects_parent_idx (parent_project_id), KEY projects_created_idx (created_at),
    CONSTRAINT projects_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id)
  `),
  // parent_project_id/parent_version_id reference tables created after this one; added as a second pass below.
  T('versions',`
    id ${uuid} PRIMARY KEY, project_id ${uuid} NOT NULL, number INT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK(status IN ('draft','pending','approved','rejected','changes_requested')),
    data JSON NOT NULL, changelog TEXT NOT NULL, required_approvals INT NOT NULL DEFAULT 1 CHECK(required_approvals IN (1,2)),
    created_at ${now}, updated_at ${now},
    -- The generated column stands in for PostgreSQL's partial unique index: NULL for every status outside the three
    -- that count as "still active", and MySQL (like Postgres) never lets two NULLs collide in a unique index.
    active_slot ${uuid} GENERATED ALWAYS AS (CASE WHEN status IN ('draft','pending','changes_requested') THEN project_id END) STORED,
    UNIQUE KEY versions_project_number_idx (project_id,number),
    UNIQUE KEY one_active_version_idx (active_slot),
    KEY versions_status_idx (status,project_id),
    CONSTRAINT versions_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  `),
  T('reviews',`
    id ${uuid} PRIMARY KEY, version_id ${uuid} NOT NULL, admin_id ${uuid} NOT NULL,
    action VARCHAR(30) NOT NULL, reason TEXT NOT NULL, created_at ${now},
    UNIQUE KEY reviews_version_admin_idx (version_id,admin_id),
    CONSTRAINT reviews_version_fk FOREIGN KEY (version_id) REFERENCES versions(id) ON DELETE CASCADE,
    CONSTRAINT reviews_admin_fk FOREIGN KEY (admin_id) REFERENCES users(id)
  `),
  T('comments',`
    id ${uuid} PRIMARY KEY, project_id ${uuid}, user_id ${uuid}, body TEXT NOT NULL, created_at ${now}, parent_id ${uuid},
    KEY comments_project_thread_idx (project_id,parent_id,created_at),
    CONSTRAINT comments_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    CONSTRAINT comments_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT comments_parent_fk FOREIGN KEY (parent_id) REFERENCES comments(id) ON DELETE CASCADE
  `),
  T('reactions',`
    user_id ${uuid} NOT NULL, project_id ${uuid} NOT NULL, kind VARCHAR(10) NOT NULL CHECK(kind IN ('star','like')),
    created_at ${now}, PRIMARY KEY(user_id,project_id,kind),
    KEY reactions_project_idx (project_id,kind),
    CONSTRAINT reactions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT reactions_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  `),
  T('bookmarks',`
    user_id ${uuid} NOT NULL, project_id ${uuid} NOT NULL, PRIMARY KEY(user_id,project_id),
    KEY bookmarks_project_idx (project_id),
    CONSTRAINT bookmarks_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT bookmarks_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  `),
  T('notifications',`
    id ${uuid} PRIMARY KEY, user_id ${uuid} NOT NULL, message TEXT NOT NULL, project_id ${uuid},
    \`read\` ${flag}, created_at ${now},
    KEY notifications_user_idx (user_id,created_at),
    CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT notifications_project_fk FOREIGN KEY (project_id) REFERENCES projects(id)
  `),
  T('files',`
    id ${uuid} PRIMARY KEY, owner_id ${uuid} NOT NULL, filename VARCHAR(255) NOT NULL, mime VARCHAR(120) NOT NULL,
    size INT NOT NULL, content LONGBLOB NOT NULL,
    scan_status VARCHAR(30) NOT NULL CHECK(scan_status IN ('clean','trusted_sample','validated_internal')), created_at ${now},
    CONSTRAINT files_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id)
  `),
  T('rate_limits',`
    \`key\` VARCHAR(191) PRIMARY KEY, count INT NOT NULL, expires_at DATETIME(6) NOT NULL
  `),
  T('outbox',`
    id ${uuid} PRIMARY KEY, recipient TEXT NOT NULL, recipient_hash VARCHAR(191) NOT NULL DEFAULT '',
    subject VARCHAR(500) NOT NULL, body TEXT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'pending', created_at ${now},
    KEY outbox_recipient_hash_idx (recipient_hash), KEY outbox_pending_idx (created_at,status)
  `),
  T('ai_requests',`
    id ${uuid} PRIMARY KEY, user_id ${uuid} NOT NULL, prompt TEXT NOT NULL, prompt_chars INT NOT NULL,
    status VARCHAR(20) NOT NULL CHECK(status IN ('pending','completed','blocked','failed')), reason VARCHAR(500) NOT NULL DEFAULT '',
    fields JSON NOT NULL, model VARCHAR(60) NOT NULL DEFAULT '', duration_ms INT, created_at ${now},
    feature VARCHAR(40) NOT NULL DEFAULT 'project_draft',
    outcome VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK(outcome IN ('pending','success','failed','cancelled','rate_limited','timeout','refused')),
    session_id ${uuid}, project_id ${uuid}, ip_address VARCHAR(64) NOT NULL DEFAULT '',
    device_type VARCHAR(20) NOT NULL DEFAULT 'unknown', os VARCHAR(60) NOT NULL DEFAULT '', browser VARCHAR(60) NOT NULL DEFAULT '',
    prompt_tokens INT, response_tokens INT, total_tokens INT,
    KEY ai_requests_user_idx (user_id,created_at), KEY ai_requests_created_idx (created_at),
    KEY ai_requests_outcome_idx (outcome,created_at), KEY ai_requests_session_idx (session_id),
    KEY ai_requests_project_idx (project_id,created_at), KEY ai_requests_ip_idx (ip_address),
    CONSTRAINT ai_requests_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT ai_requests_session_fk FOREIGN KEY (session_id) REFERENCES tracked_sessions(id) ON DELETE SET NULL,
    CONSTRAINT ai_requests_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  `),
  T('activity_events',`
    id ${uuid} PRIMARY KEY, event_type VARCHAR(40) NOT NULL CHECK(event_type REGEXP '^[A-Z][A-Z_]{2,39}$'),
    category VARCHAR(20) NOT NULL CHECK(category IN ('navigation','auth','project','community','file','ai','account','security','admin')),
    status VARCHAR(10) NOT NULL DEFAULT 'success' CHECK(status IN ('success','failure')),
    user_id ${uuid}, session_id ${uuid}, visitor_id ${uuid}, project_id ${uuid}, prompt_id ${uuid},
    page VARCHAR(500) NOT NULL DEFAULT '', ip_address VARCHAR(64) NOT NULL DEFAULT '', device_type VARCHAR(20) NOT NULL DEFAULT 'unknown',
    os VARCHAR(60) NOT NULL DEFAULT '', browser VARCHAR(60) NOT NULL DEFAULT '', user_agent VARCHAR(500) NOT NULL DEFAULT '',
    metadata JSON NOT NULL, created_at ${now},
    KEY activity_created_idx (created_at), KEY activity_type_created_idx (event_type,created_at),
    KEY activity_category_created_idx (category,created_at), KEY activity_user_created_idx (user_id,created_at),
    KEY activity_session_created_idx (session_id,created_at), KEY activity_visitor_created_idx (visitor_id,created_at),
    KEY activity_project_created_idx (project_id,created_at), KEY activity_ip_created_idx (ip_address,created_at), KEY activity_prompt_idx (prompt_id),
    CONSTRAINT activity_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT activity_session_fk FOREIGN KEY (session_id) REFERENCES tracked_sessions(id) ON DELETE SET NULL,
    CONSTRAINT activity_visitor_fk FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE SET NULL,
    CONSTRAINT activity_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CONSTRAINT activity_prompt_fk FOREIGN KEY (prompt_id) REFERENCES ai_requests(id) ON DELETE SET NULL
  `),
  T('audit',`
    id ${uuid} PRIMARY KEY, actor_id ${uuid}, action VARCHAR(80) NOT NULL, target_id VARCHAR(200) NOT NULL,
    details JSON NOT NULL, created_at ${now},
    KEY audit_created_idx (created_at), KEY audit_target_idx (target_id,created_at),
    CONSTRAINT audit_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id)
  `),
  T('error_log',`
    id ${uuid} PRIMARY KEY, method VARCHAR(10) NOT NULL, path VARCHAR(500) NOT NULL, status INT NOT NULL,
    name VARCHAR(120) NOT NULL DEFAULT '', message VARCHAR(1000) NOT NULL DEFAULT '', created_at ${now},
    KEY error_log_created_idx (created_at)
  `),
  T('api_usage',`
    bucket DATETIME(6) PRIMARY KEY, requests INT NOT NULL DEFAULT 0, client_errors INT NOT NULL DEFAULT 0, server_errors INT NOT NULL DEFAULT 0
  `),
  T('settings',`\`key\` VARCHAR(60) PRIMARY KEY, value JSON NOT NULL`),
];

/** projects.parent_project_id/parent_version_id point at tables created after `projects`, so their foreign keys are
 *  added in a second pass — MySQL, unlike the single Postgres statement, needs every referenced table to exist first. */
export const DEFERRED_CONSTRAINTS:readonly string[]=[
  `ALTER TABLE projects ADD CONSTRAINT projects_parent_project_fk FOREIGN KEY (parent_project_id) REFERENCES projects(id)`,
  `ALTER TABLE projects ADD CONSTRAINT projects_parent_version_fk FOREIGN KEY (parent_version_id) REFERENCES versions(id)`,
];

/** Seed rows, using INSERT IGNORE for Postgres's ON CONFLICT DO NOTHING. */
export const SEEDS:readonly string[]=[
  `INSERT IGNORE INTO settings(\`key\`,value) VALUES ('retention','{"activityDays":90,"sessionDays":30,"securityDays":180}')`,
  `INSERT IGNORE INTO settings(\`key\`,value) VALUES ('ai','{"enabled":true,"hourlyLimit":10,"dailyLimit":40,"siteDailyLimit":300}')`,
  `INSERT IGNORE INTO settings(\`key\`,value) VALUES ('moderation','{"requiredApprovals":1,"allowedEmailDomains":[]}')`,
  `INSERT IGNORE INTO settings(\`key\`,value) VALUES ('categories','{"departments":["Computer Science","Electronics & Communication","Mechanical Engineering","Electrical Engineering"],"subjects":["Final Year Project","Mini Project","Research"],"tags":["Next.js","Python","Arduino","IoT","Robotics"]}')`,
];

/** True for a server error that means "this statement already ran" (an idempotent CREATE/ALTER/INSERT retried),
 *  so applySchema() can be called safely more than once, exactly like the Postgres side's IF NOT EXISTS does. */
export function alreadyApplied(error:unknown) {
  const code=String((error as {code?:unknown})?.code??'');
  return ['ER_TABLE_EXISTS_ERROR','ER_DUP_KEYNAME','ER_DUP_ENTRY','ER_FK_DUP_NAME','ER_CANT_CREATE_TABLE'].includes(code)
    || /already exists|duplicate (key|column) name/i.test(String((error as {message?:unknown})?.message??''));
}
