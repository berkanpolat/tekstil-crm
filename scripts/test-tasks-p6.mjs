// P6.12 — Faz 6 DB mantığı testi (görev/hedef/YZ). BEGIN…ROLLBACK; üretime yazılmaz.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const PGURL = process.env.PGURL ?? readFileSync('/tmp/pgurl.txt', 'utf8').trim()
const run = (s) => execFileSync('psql', [PGURL, '-qtAX', '-v', 'ON_ERROR_STOP=1', '-c', s], { encoding: 'utf8' }).trim()
let fails = 0
const ok = (l, c) => { if (!c) fails++; console.log(`  ${c ? '✓' : '✗ HATA'} ${l}`) }
const scenario = (body) => { const out = run(`begin;\n${body}\nrollback;`); const m = {}; for (const line of out.split('\n')) { const i = line.indexOf('='); if (i > 0) m[line.slice(0, i)] = line.slice(i + 1) } return m }
const U = `(select id from public.users where is_active limit 1)`

console.log('[1] task_assigned trigger — atamada sorumluya bildirim + geçmiş')
{
  const r = scenario(`
    create temp table _t on commit drop as with x as (insert into public.tasks(title, assigned_to) values('T1',${U}) returning id) select id from x;
    select 'BILDIRIM='||count(*) from public.notifications where type='task_assigned' and entity_id=(select id from _t)::text;
    select 'GECMIS='||count(*) from public.task_assignments where task_id=(select id from _t);`)
  ok('atamada task_assigned bildirimi', Number(r.BILDIRIM) === 1)
  ok('sorumluluk geçmişi kaydı', Number(r.GECMIS) === 1)
}

console.log('[2] Bağımlılık yumuşak kapı + task_blocked bildirimi')
{
  const r = scenario(`
    create temp table _a on commit drop as with x as (insert into public.tasks(title) values('A') returning id) select id from x;
    create temp table _b on commit drop as with x as (insert into public.tasks(title, assigned_to) values('B',${U}) returning id) select id from x;
    insert into public.task_dependencies(task_id, depends_on_task_id) values((select id from _b),(select id from _a));
    select 'BLOK_ONCE='||count(*) from public.task_blocking((select id from _b));
    update public.tasks set status_id=(select id from public.task_statuses where key='tamamlandi') where id=(select id from _a);
    select 'BLOK_SONRA='||count(*) from public.task_blocking((select id from _b));
    select 'UNBLOCK_BILDIRIM='||count(*) from public.notifications where type='task_blocked' and entity_id=(select id from _b)::text;`)
  ok('A açıkken B bekliyor', Number(r.BLOK_ONCE) === 1)
  ok('A tamamlanınca B serbest', Number(r.BLOK_SONRA) === 0)
  ok('serbest kalınca task_blocked bildirimi', Number(r.UNBLOCK_BILDIRIM) === 1)
}

console.log('[3] process_task_due_warnings — geçmiş vadeli görev → task_overdue')
{
  const r = scenario(`
    create temp table _t on commit drop as with x as (insert into public.tasks(title, assigned_to, due_at) values('Geç',${U}, now()-interval '1 day') returning id) select id from x;
    select 'URETTI='||public.process_task_due_warnings();
    select 'OVERDUE='||count(*) from public.notifications where type='task_overdue' and entity_id=(select id from _t)::text;`)
  ok('overdue bildirimi üretildi', Number(r.OVERDUE) >= 1)
}

console.log('[4] Öneri kabul — görev source=otomatik + tekrar önerilmez')
{
  const r = scenario(`
    create temp table _o on commit drop as select id from public.operations where deleted_at is null limit 1;
    create temp table _tpl on commit drop as select template_id from public.operation_task_suggestions((select id from _o)) limit 1;
    select 'ONCE='||count(*) from public.operation_task_suggestions((select id from _o)) where template_id=(select template_id from _tpl);
    select public.accept_task_suggestion((select id from _o),'template',(select template_id from _tpl),'X',null,null,null, now());
    select 'SONRA='||count(*) from public.operation_task_suggestions((select id from _o)) where template_id=(select template_id from _tpl);`)
  ok('kabulden önce öneri var', Number(r.ONCE) === 1)
  ok('kabulden sonra aynı öneri gitti', Number(r.SONRA) === 0)
}

console.log('[5] goal_at_risk — dönem sonu yakın + geride → uyarı')
{
  const r = scenario(`
    create temp table _g on commit drop as with x as (insert into public.goals(name,goal_type,scope,scope_user_id,period_type,period_start,period_end,target_value)
      values('Risk','siparis_sayisi','kisi',${U},'aylik',current_date-25,current_date+2,1000) returning id) select id from x;
    select 'URETTI='||public.process_goal_notifications();
    select 'RISK='||count(*) from public.notifications where type='goal_at_risk' and entity_id=(select id from _g)::text;`)
  ok('geride kalan hedefte goal_at_risk uyarısı', Number(r.RISK) === 1)
}

console.log('[6] YZ maliyet fonksiyonları — tahmini maliyet toplanıyor')
{
  const r = scenario(`
    insert into public.ai_requests(feature, status, estimated_cost_usd) values('musteri_ozeti','ok',0.012),('siparis_cikarma','ok',0.05);
    select 'BUGUN='||public.ai_cost_today();
    select 'OZELLIK='||public.ai_feature_calls_today('siparis_cikarma');`)
  ok('bugünkü maliyet toplandı (0.062)', Math.abs(Number(r.BUGUN) - 0.062) < 0.0001)
  ok('özellik-başı çağrı sayısı', Number(r.OZELLIK) >= 1)
}

console.log(`\n${fails === 0 ? '✓ TÜM FAZ 6 DB TESTLERİ GEÇTİ' : `✗ ${fails} TEST BAŞARISIZ`}`)
process.exit(fails === 0 ? 0 : 1)
