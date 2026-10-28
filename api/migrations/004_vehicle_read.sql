BEGIN;

CREATE OR REPLACE FUNCTION public.rp_api_list_vehicles(p_api_key text, p_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_vehicles jsonb;
BEGIN
  IF p_api_key IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rp_service_secrets
    WHERE key_name = 'server'
      AND key_hash = encode(digest(p_api_key, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rp_accounts WHERE id = p_account_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ACCOUNT_NOT_FOUND', 'vehicles', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', v.id,
    'accountId', v.account_id,
    'characterId', v.character_id,
    'modelId', v.model_id,
    'displayName', v.display_name,
    'properties', v.properties,
    'state', v.state,
    'createdAt', v.created_at,
    'updatedAt', v.updated_at
  ) ORDER BY v.created_at), '[]'::jsonb)
  INTO v_vehicles
  FROM public.rp_vehicles v
  WHERE v.account_id = p_account_id;

  RETURN jsonb_build_object('ok', true, 'vehicles', v_vehicles);
END
$$;

REVOKE ALL ON FUNCTION public.rp_api_list_vehicles(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rp_api_list_vehicles(text, uuid) TO rp_anon;

COMMIT;
