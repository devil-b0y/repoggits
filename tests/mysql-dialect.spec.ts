import { test, expect } from '@playwright/test';
import { bind, translate, UnsupportedSql } from '../lib/database/dialect/mysql';

// Pure translation tests: no database, no adapter, no network — just PostgreSQL SQL in, MySQL SQL and a positional
// value list out. Every statement below is lifted verbatim (or trivially reformatted onto one line) from the real
// call sites named in each test, so a passing suite here means the translator has actually been proven against the
// closed set of SQL this application emits, not against SQL nobody writes.

test('$n placeholders become positional ? in argument order, including a repeated and an out-of-order one', () => {
  // A repeated $1: WHERE (id=$1 OR user_id=$1), from the activity/prompt "q is a UUID" search pattern.
  const repeated = bind('SELECT * FROM t WHERE id=$1 OR user_id=$1', ['abc']);
  expect(repeated.sql).toBe('SELECT * FROM t WHERE id=? OR user_id=?');
  expect(repeated.values).toEqual(['abc', 'abc']);

  // $3 used before $2: the shape date_trunc's bucketing produces (bucket takes $3 for the time zone before $2, the range end).
  const outOfOrder = bind('SELECT $3,$1,$2', ['first', 'second', 'third']);
  expect(outOfOrder.sql).toBe('SELECT ?,?,?');
  expect(outOfOrder.values).toEqual(['third', 'first', 'second']);

  // A placeholder never bound is a translator bug waiting to corrupt a query, not something to guess at.
  expect(() => bind('SELECT $2', ['only one'])).toThrow(UnsupportedSql);
});

test('FILTER (WHERE …) becomes a CASE WHEN inside the aggregate, and ::int becomes an explicit CAST — lib/admin/metrics.ts countIf()', () => {
  // (count(*) FILTER (WHERE created_at>=$1 AND created_at<$2))::int, the exact shape countIf() emits.
  const t = translate('(count(*) FILTER (WHERE created_at>=$1 AND created_at<$2))::int', ['2026-01-01', '2026-02-01']);
  expect(t.sql).toBe('CAST((count(CASE WHEN created_at>=? AND created_at<? THEN 1 END)) AS SIGNED)');
  expect(t.sql).not.toContain('FILTER');
  expect(t.sql).not.toContain('::int');
  expect(t.values).toEqual(['2026-01-01', '2026-02-01']);
});

test('two FILTER aggregates in one SELECT each keep their own placeholder — activity-query.ts style multi-FILTER select', () => {
  const t = translate(
    'SELECT count(*) FILTER (WHERE status=$1) AS a, count(*) FILTER (WHERE status=$2) AS b FROM r.activity_events',
    ['success', 'failure'],
  );
  // `status` picks up defensive backtick-quoting; a plain identifier in backticks means exactly the same thing in MySQL.
  expect(t.sql).toBe('SELECT count(CASE WHEN `status`=? THEN 1 END) AS a, count(CASE WHEN `status`=? THEN 1 END) AS b FROM r.activity_events');
  expect(t.values).toEqual(['success', 'failure']);
});

test('ILIKE becomes LIKE — lib/admin/query.ts containsPattern searches', () => {
  const t = translate("SELECT * FROM r.users WHERE name ILIKE $1", ['%ada%']);
  expect(t.sql).toBe('SELECT * FROM r.users WHERE name LIKE ?');
  expect(t.values).toEqual(['%ada%']);
});

test("interval arithmetic — lib/admin/query.ts date presets and lib/auth.ts rateLimit's expiry", () => {
  const sevenDays = translate("SELECT now()-interval '6 days'", []);
  expect(sevenDays.sql).not.toContain('interval');
  expect(sevenDays.sql.toUpperCase()).toContain('INTERVAL 6 DAY');

  const parameterised = translate("INSERT INTO r.rate_limits(expires_at) VALUES(now()+$1*interval '1 second')", [900]);
  // Parenthesised: MySQL's INTERVAL takes an expr, and wrapping it is what makes a placeholder or a longer
  // expression (not just a bare literal) always parse the same way.
  expect(parameterised.sql.toUpperCase()).toContain('INTERVAL (?) SECOND');
  expect(parameterised.values).toEqual([900]);
});

test('=ANY($n::text[]) becomes IN (…) with the array expanded into its own placeholders — activity-query.ts device/browser filters', () => {
  const t = translate('SELECT * FROM r.activity_events WHERE device_type=ANY($1::text[])', [['desktop', 'mobile', 'tablet']]);
  expect(t.sql).toBe('SELECT * FROM r.activity_events WHERE device_type IN (?,?,?)');
  expect(t.values).toEqual(['desktop', 'mobile', 'tablet']);
});

test('a jsonb ->> lookup — lib/api-files.ts avatar check', () => {
  const t = translate("SELECT 1 FROM r.users WHERE profile->>'avatarId'=$1 AND NOT suspended LIMIT 1", ['file-id']);
  expect(t.sql).not.toContain('->>');
  expect(t.sql.toUpperCase()).toContain('JSON_UNQUOTE');
  expect(t.sql.toUpperCase()).toContain('JSON_EXTRACT');
  expect(t.values).toEqual(['file-id']);
});

test('jsonb containment (@>) is refused rather than silently mis-parsed as a MySQL session variable — lib/projects.ts fileReference()', () => {
  // @ opens a user-variable reference in MySQL, so `data @> $1` would not fail loudly there — it would just answer
  // wrong. This must throw before any SQL reaches a connection.
  expect(() => translate('SELECT 1 FROM r.versions WHERE data @> $1::jsonb', ['{}'])).toThrow(UnsupportedSql);
  expect(() => translate('SELECT 1 FROM r.versions WHERE $1::jsonb <@ data', ['{}'])).toThrow(UnsupportedSql);
});

test('DELETE … RETURNING becomes a companion SELECT that reads the doomed rows first — lib/admin/sessions.ts revokeSession, lib/api-auth.ts token consumption', () => {
  const revoke = translate('DELETE FROM r.sessions WHERE tracked_session_id=$1 RETURNING user_id', ['session-id']);
  expect(revoke.sql.toUpperCase()).not.toContain('RETURNING');
  expect(revoke.sql).toBe('DELETE FROM r.sessions WHERE tracked_session_id=?');
  expect(revoke.pre?.sql).toBe('SELECT user_id FROM r.sessions WHERE tracked_session_id=?');
  expect(revoke.pre?.values).toEqual(['session-id']);
  expect(revoke.post).toBeUndefined();

  const consumeToken = translate(
    'DELETE FROM r.tokens WHERE hash=$1 AND purpose=$2 AND expires_at>now() RETURNING user_id',
    ['token-hash', 'verify'],
  );
  expect(consumeToken.pre?.sql).toBe('SELECT user_id FROM r.tokens WHERE hash=? AND purpose=? AND expires_at>now()');
  expect(consumeToken.pre?.values).toEqual(['token-hash', 'verify']);
});

test('UPDATE … RETURNING becomes a companion SELECT before the write, and refuses to return a column the UPDATE itself changes — lib/ai-usage.ts setAiBlocked', () => {
  const t = translate('UPDATE r.users SET ai_blocked=$1 WHERE id=$2 RETURNING id', [true, 'user-id']);
  expect(t.sql).toBe('UPDATE r.users SET ai_blocked=? WHERE id=?');
  expect(t.pre?.sql).toBe('SELECT id FROM r.users WHERE id=?');
  expect(t.pre?.values).toEqual(['user-id']);

  expect(() => translate('UPDATE r.users SET ai_blocked=$1 WHERE id=$2 RETURNING ai_blocked', [true, 'user-id']))
    .toThrow(UnsupportedSql);
});

test("an upsert's ON CONFLICT … DO UPDATE … RETURNING becomes ON DUPLICATE KEY UPDATE with a companion SELECT run AFTER the write — lib/auth.ts rateLimit", () => {
  const sql = `INSERT INTO r.rate_limits(key,count,expires_at) VALUES($1,1,now()+$2*interval '1 second')
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN r.rate_limits.expires_at<now() THEN 1 ELSE r.rate_limits.count+1 END,
    expires_at=CASE WHEN r.rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE r.rate_limits.expires_at END RETURNING count`;
  const t = translate(sql, ['login:global', 900]);
  expect(t.sql.toUpperCase()).toContain('ON DUPLICATE KEY UPDATE');
  expect(t.sql.toUpperCase()).not.toContain('RETURNING');
  expect(t.sql).not.toContain('EXCLUDED');
  // EXCLUDED.expires_at becomes VALUES(expires_at), MySQL's own name for "the row that was proposed for insertion".
  expect(t.sql).toContain('VALUES(expires_at)');
  // count and key both pick up defensive backtick-quoting as MySQL reserved words; this is what the fix for the
  // conflict-key comparison (matching by unmasked text, not by sentinel identity) makes come out correctly.
  expect(t.post?.sql).toBe('SELECT `count` FROM r.rate_limits WHERE `key`=?');
  expect(t.post).toBeDefined();
  expect(t.pre).toBeUndefined();
});

test('ON CONFLICT (…) DO NOTHING becomes INSERT IGNORE — lib/db.ts settings seed pattern', () => {
  const t = translate("INSERT INTO r.settings(key,value) VALUES($1,$2) ON CONFLICT DO NOTHING", ['retention', '{}']);
  expect(t.sql.toUpperCase()).toContain('INSERT IGNORE INTO');
  expect(t.sql.toUpperCase()).not.toContain('ON CONFLICT');
  expect(t.values).toEqual(['retention', '{}']);
});

test('an INSERT … RETURNING id used to discover a generated key is refused — this app never needs it (ids come from randomUUID in JS), so a translation would be dead code masking a real gap', () => {
  expect(() => translate("INSERT INTO r.comments(id,body) VALUES($1,$2) RETURNING id", ['id', 'body'])).toThrow(UnsupportedSql);
});

test('date_trunc with AT TIME ZONE — lib/admin/query.ts bucketSql, the admin analytics charts', () => {
  const t = translate(
    `to_char(date_trunc('day',created_at AT TIME ZONE $3::text),'YYYY-MM-DD"T"HH24:MI')`,
    ['a', 'b', 'Asia/Kolkata'],
  );
  expect(t.sql).not.toContain('date_trunc');
  expect(t.sql).not.toContain('AT TIME ZONE');
  expect(t.sql.toUpperCase()).toContain('CONVERT_TZ');
  expect(t.sql.toUpperCase()).toContain('DATE_FORMAT');
});

test('PostgreSQL catalogue references, DISTINCT ON and string_agg are all refused rather than guessed at', () => {
  expect(() => translate('SELECT * FROM pg_class', [])).toThrow(UnsupportedSql);
  expect(() => translate('SELECT pg_advisory_xact_lock(1)', [])).toThrow(UnsupportedSql);
  expect(() => translate('SELECT DISTINCT ON (project_id) * FROM r.versions', [])).toThrow(UnsupportedSql);
  expect(() => translate("SELECT string_agg(name,',') FROM r.users", [])).toThrow(UnsupportedSql);
  expect(() => translate('SELECT $$literal$$', [])).toThrow(UnsupportedSql);
});

test('a plain SELECT with no PostgreSQL-only construct passes through with only its placeholders rewritten', () => {
  const t = translate('SELECT id,name FROM r.users WHERE role=$1 AND suspended=$2 ORDER BY created_at DESC LIMIT $3', ['teacher', false, 25]);
  expect(t.sql).toBe('SELECT id,name FROM r.users WHERE role=? AND suspended=? ORDER BY created_at DESC LIMIT ?');
  expect(t.values).toEqual(['teacher', false, 25]);
  expect(t.pre).toBeUndefined();
  expect(t.post).toBeUndefined();
});
