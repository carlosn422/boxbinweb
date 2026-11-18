begin;
alter table public.image_requests add column if not exists result jsonb;
create or replace function public.processing_complete(p_actor uuid,p_kind text,p_id text,p_tokens integer,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id text:=public.copilot_owner(p_actor); debit jsonb;
begin
 if p_kind='image' then
  perform 1 from public.image_requests where id=p_id and "userId"=owner_id for update;
 elsif p_kind='video' then
  perform 1 from public.video_processing_jobs where id=p_id and "userId"=owner_id for update;
 else raise exception 'PROCESSING_INVALID_KIND';end if;
 if not found then raise exception 'PROCESSING_NOT_FOUND';end if;
 debit:=public.processing_debit_tokens(p_actor,p_kind||':'||p_id,p_tokens);
 if not (debit->>'debited')::boolean then return debit;end if;
 if p_kind='image' then
  update public.image_requests set success=true,cost=(p_payload->>'cost')::numeric,"processingId"=p_payload->>'processingId',"costAnalysis"=p_payload->'costAnalysis',result=p_payload->'result' where id=p_id and "userId"=owner_id;
 else
  update public.video_processing_jobs set status='completed',status_message='Processing finished successfully.',"finishedAt"=to_jsonb(now()::text),cost=(p_payload->>'cost')::numeric,"costBreakdown"=p_payload->'costBreakdown',result=p_payload->'result' where id=p_id and "userId"=owner_id;
 end if;
 return debit;
end $$;
revoke all on function public.processing_complete(uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.processing_complete(uuid,text,text,integer,jsonb) to service_role;
commit;
