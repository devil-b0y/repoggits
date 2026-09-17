import { test, expect } from '@playwright/test';
import { SCHEMA_TABLES, SCHEMA_RELATIONS, copyPlan, specFor } from '../lib/database/sync/plan';
import { TABLES } from '../lib/database/dialect/ddl';

test('comment upvotes are registered in the sync plan with their own key',()=>{
  expect(specFor('comment_votes')).toEqual({name:'comment_votes',key:['user_id','comment_id'],time:'created_at'});
  expect(SCHEMA_RELATIONS).toEqual(expect.arrayContaining([
    {table:'comment_votes',references:'users',columns:['user_id'],required:true},
    {table:'comment_votes',references:'comments',columns:['comment_id'],required:true},
  ]));
});

test('the copy order inserts comment votes only after the users and comments they point at',()=>{
  const order=copyPlan().map(step=>step.table);
  expect(order.indexOf('comment_votes')).toBeGreaterThan(order.indexOf('comments'));
  expect(order.indexOf('comment_votes')).toBeGreaterThan(order.indexOf('users'));
  expect(copyPlan().find(step=>step.table==='comment_votes')?.deferred).toEqual([]);
});

test('every planned table has MySQL DDL, so a transfer to MySQL cannot silently skip one',()=>{
  const created=TABLES.map(statement=>/CREATE TABLE IF NOT EXISTS (\w+)/.exec(statement)?.[1]);
  for(const {name} of SCHEMA_TABLES)expect(created).toContain(name);
  expect(created.indexOf('comment_votes')).toBeGreaterThan(created.indexOf('comments'));
});
