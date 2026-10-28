BEGIN;

-- Every newly-created character gets initialized roleplay stats automatically.
CREATE OR REPLACE FUNCTION public.rp_initialize_character_stats()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.rp_character_stats (character_id)
  VALUES (NEW.id)
  ON CONFLICT (character_id) DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS rp_characters_initialize_stats ON public.rp_characters;
CREATE TRIGGER rp_characters_initialize_stats
AFTER INSERT ON public.rp_characters
FOR EACH ROW EXECUTE FUNCTION public.rp_initialize_character_stats();

INSERT INTO public.rp_character_stats (character_id)
SELECT c.id FROM public.rp_characters c
ON CONFLICT (character_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.rp_api_get_character(p_api_key text, p_character_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_character jsonb;
  v_stats jsonb;
BEGIN
  IF p_api_key IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rp_service_secrets
    WHERE key_name = 'server'
      AND key_hash = encode(digest(p_api_key, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT to_jsonb(c) INTO v_character
  FROM public.rp_characters c
  WHERE c.id = p_character_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CHARACTER_NOT_FOUND');
  END IF;

  SELECT to_jsonb(s) INTO v_stats
  FROM public.rp_character_stats s
  WHERE s.character_id = p_character_id;

  RETURN jsonb_build_object('ok', true, 'character', v_character, 'stats',
    COALESCE(v_stats, jsonb_build_object('health', 100, 'hunger', 100, 'thirst', 100, 'experience', 0, 'job_code', 'unemployed')));
END
$$;

CREATE OR REPLACE FUNCTION public.rp_api_update_character_stats(
  p_api_key text,
  p_character_id uuid,
  p_health numeric,
  p_hunger integer,
  p_thirst integer,
  p_experience bigint,
  p_job_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_stats public.rp_character_stats%ROWTYPE;
BEGIN
  IF p_api_key IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rp_service_secrets
    WHERE key_name = 'server'
      AND key_hash = encode(digest(p_api_key, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_health IS NULL OR p_health < 0 OR p_health > 100
     OR p_hunger IS NULL OR p_hunger < 0 OR p_hunger > 100
     OR p_thirst IS NULL OR p_thirst < 0 OR p_thirst > 100
     OR p_experience IS NULL OR p_experience < 0
     OR p_job_code IS NULL OR p_job_code !~ '^[a-z][a-z0-9_]{1,39}$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_CHARACTER_STATS');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rp_characters WHERE id = p_character_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CHARACTER_NOT_FOUND');
  END IF;

  INSERT INTO public.rp_character_stats (character_id, health, hunger, thirst, experience, job_code, updated_at)
  VALUES (p_character_id, p_health, p_hunger, p_thirst, p_experience, p_job_code, now())
  ON CONFLICT (character_id) DO UPDATE SET
    health = EXCLUDED.health,
    hunger = EXCLUDED.hunger,
    thirst = EXCLUDED.thirst,
    experience = EXCLUDED.experience,
    job_code = EXCLUDED.job_code,
    updated_at = now()
  RETURNING * INTO v_stats;

  RETURN jsonb_build_object('ok', true, 'stats', to_jsonb(v_stats));
END
$$;

CREATE OR REPLACE FUNCTION public.rp_api_inventory_add(
  p_api_key text,
  p_character_id uuid,
  p_item_code text,
  p_quantity integer,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stackable boolean;
  v_item public.rp_character_inventory%ROWTYPE;
BEGIN
  IF p_api_key IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rp_service_secrets
    WHERE key_name = 'server'
      AND key_hash = encode(digest(p_api_key, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 1000
     OR p_item_code IS NULL OR p_item_code !~ '^[a-z][a-z0-9_]{1,47}$'
     OR p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_INVENTORY_ITEM');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rp_characters WHERE id = p_character_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CHARACTER_NOT_FOUND');
  END IF;

  SELECT stackable INTO v_stackable FROM public.rp_items WHERE item_code = p_item_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNKNOWN_ITEM');
  END IF;
  IF NOT v_stackable AND p_quantity <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NON_STACKABLE_QUANTITY_MUST_BE_ONE');
  END IF;

  IF v_stackable THEN
    PERFORM pg_advisory_xact_lock(hashtext(p_character_id::text || ':' || p_item_code || ':' || p_metadata::text));
    SELECT * INTO v_item
    FROM public.rp_character_inventory
    WHERE character_id = p_character_id AND item_code = p_item_code AND metadata = p_metadata
    ORDER BY created_at
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      IF v_item.quantity + p_quantity > 1000000 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ITEM_QUANTITY_LIMIT');
      END IF;
      UPDATE public.rp_character_inventory
      SET quantity = quantity + p_quantity, updated_at = now()
      WHERE id = v_item.id
      RETURNING * INTO v_item;
    ELSE
      INSERT INTO public.rp_character_inventory (character_id, item_code, quantity, metadata)
      VALUES (p_character_id, p_item_code, p_quantity, p_metadata)
      RETURNING * INTO v_item;
    END IF;
  ELSE
    INSERT INTO public.rp_character_inventory (character_id, item_code, quantity, metadata)
    VALUES (p_character_id, p_item_code, 1, p_metadata)
    RETURNING * INTO v_item;
  END IF;

  RETURN jsonb_build_object('ok', true, 'item', to_jsonb(v_item));
END
$$;

CREATE OR REPLACE FUNCTION public.rp_api_inventory_list(p_api_key text, p_character_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_items jsonb;
BEGIN
  IF p_api_key IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.rp_service_secrets
    WHERE key_name = 'server'
      AND key_hash = encode(digest(p_api_key, 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rp_characters WHERE id = p_character_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CHARACTER_NOT_FOUND', 'items', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'itemCode', i.item_code,
    'displayName', catalog.display_name,
    'quantity', i.quantity,
    'metadata', i.metadata,
    'updatedAt', i.updated_at
  ) ORDER BY i.created_at), '[]'::jsonb)
  INTO v_items
  FROM public.rp_character_inventory i
  JOIN public.rp_items catalog ON catalog.item_code = i.item_code
  WHERE i.character_id = p_character_id;

  RETURN jsonb_build_object('ok', true, 'items', v_items);
END
$$;

REVOKE ALL ON FUNCTION public.rp_initialize_character_stats() FROM PUBLIC, rp_anon;
REVOKE ALL ON FUNCTION public.rp_api_get_character(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rp_api_update_character_stats(text, uuid, numeric, integer, integer, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rp_api_inventory_add(text, uuid, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rp_api_inventory_list(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rp_api_get_character(text, uuid) TO rp_anon;
GRANT EXECUTE ON FUNCTION public.rp_api_update_character_stats(text, uuid, numeric, integer, integer, bigint, text) TO rp_anon;
GRANT EXECUTE ON FUNCTION public.rp_api_inventory_add(text, uuid, text, integer, jsonb) TO rp_anon;
GRANT EXECUTE ON FUNCTION public.rp_api_inventory_list(text, uuid) TO rp_anon;

COMMIT;
