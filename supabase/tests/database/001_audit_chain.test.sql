-- T-DB-audit-001/002: hash chain verifies, rejects edits, and detects tampering.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select lives_ok($$select audit.append('test.one', 'thing', '1', null, '{"a":1}')$$, 'append works');
select lives_ok($$select audit.append('test.two', 'thing', '2', '{"a":1}', '{"a":2}')$$, 'second append works');
select lives_ok($$select audit.append('test.three')$$, 'append with defaults works');

select is((select ok from audit.verify_chain()), true, 'chain verifies after appends');

select throws_ok(
  $$update audit.log set action = 'forged' where action = 'test.two'$$,
  '42501', 'audit.log is append-only', 'updates are rejected');

-- Simulate a privileged attacker bypassing the trigger: verification must catch it.
set local session_replication_role = replica;
update audit.log set action = 'forged' where action = 'test.two';
set local session_replication_role = origin;
select is((select ok from audit.verify_chain()), false, 'tampering is detected');

select * from finish();
rollback;
