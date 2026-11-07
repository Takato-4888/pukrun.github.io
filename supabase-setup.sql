CREATE TABLE IF NOT EXISTS public.pukrun_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object')
);

ALTER TABLE public.pukrun_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pukrun_state REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Anyone can read PUKRUN state" ON public.pukrun_state;
CREATE POLICY "Anyone can read PUKRUN state"
  ON public.pukrun_state FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.pukrun_state TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pukrun_state FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.initialize_pukrun_state(p_state jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state jsonb;
BEGIN
  IF jsonb_typeof(p_state) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Initial state must be a JSON object';
  END IF;
  IF jsonb_typeof(p_state->'unitPrice') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_state->'materialCosts') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_state->'sales') IS DISTINCT FROM 'array'
    OR (
      p_state->>'activeDay' IS DISTINCT FROM '1'
      AND p_state->>'activeDay' IS DISTINCT FROM '2'
    ) THEN
    RAISE EXCEPTION 'Initial state has an invalid shape';
  END IF;

  INSERT INTO public.pukrun_state (id, state)
  VALUES (1, p_state)
  ON CONFLICT (id) DO NOTHING
  RETURNING state INTO v_state;

  IF NOT FOUND THEN
    SELECT state INTO v_state
    FROM public.pukrun_state
    WHERE id = 1;
  END IF;

  RETURN v_state;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pukrun_state(p_action text, p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state jsonb;
  v_records jsonb;
  v_amount numeric;
BEGIN
  SELECT state INTO v_state
  FROM public.pukrun_state
  WHERE id = 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUKRUN state has not been initialized';
  END IF;

  CASE p_action
    WHEN 'set_unit_price' THEN
      IF jsonb_typeof(p_payload->'value') IS DISTINCT FROM 'number'
        OR COALESCE(p_payload->>'value' ~ '^(0|[1-9][0-9]*)$', false) = false THEN
        RAISE EXCEPTION 'Invalid unit price';
      END IF;
      v_amount := (p_payload->>'value')::numeric;
      IF v_amount > 9007199254740991 THEN
        RAISE EXCEPTION 'Unit price is too large';
      END IF;
      v_state := jsonb_set(v_state, '{unitPrice}', p_payload->'value', true);

    WHEN 'set_active_day' THEN
      IF p_payload->>'value' IS DISTINCT FROM '1'
        AND p_payload->>'value' IS DISTINCT FROM '2' THEN
        RAISE EXCEPTION 'Invalid active day';
      END IF;
      v_state := jsonb_set(v_state, '{activeDay}', p_payload->'value', true);

    WHEN 'add_material' THEN
      IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
        OR NULLIF(p_payload->>'id', '') IS NULL
        OR NULLIF(btrim(p_payload->>'name'), '') IS NULL
        OR length(p_payload->>'name') > 100
        OR jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'number'
        OR COALESCE(p_payload->>'amount' ~ '^(0|[1-9][0-9]*)$', false) = false
        OR NULLIF(p_payload->>'createdAt', '') IS NULL THEN
        RAISE EXCEPTION 'Invalid material record';
      END IF;
      v_amount := (p_payload->>'amount')::numeric;
      IF v_amount > 9007199254740991 THEN
        RAISE EXCEPTION 'Material amount is too large';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_state->'materialCosts', '[]'::jsonb)) AS records(item)
        WHERE item->>'id' = p_payload->>'id'
      ) THEN
        v_state := jsonb_set(
          v_state,
          '{materialCosts}',
          COALESCE(v_state->'materialCosts', '[]'::jsonb) || jsonb_build_array(p_payload),
          true
        );
      END IF;
      SELECT COALESCE(SUM((item->>'amount')::numeric), 0) INTO v_amount
      FROM jsonb_array_elements(COALESCE(v_state->'materialCosts', '[]'::jsonb)) AS records(item);
      IF v_amount > 9007199254740991 THEN
        RAISE EXCEPTION 'Total material cost is too large';
      END IF;

    WHEN 'delete_materials' THEN
      IF jsonb_typeof(p_payload->'ids') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Invalid material IDs';
      END IF;
      SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_records
      FROM jsonb_array_elements(COALESCE(v_state->'materialCosts', '[]'::jsonb)) AS records(item)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(p_payload->'ids') AS ids(id)
        WHERE ids.id = item->>'id'
      );
      v_state := jsonb_set(v_state, '{materialCosts}', v_records, true);

    WHEN 'add_sale' THEN
      IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
        OR NULLIF(p_payload->>'id', '') IS NULL
        OR NULLIF(p_payload->>'createdAt', '') IS NULL
        OR (
          p_payload->>'day' IS DISTINCT FROM '1'
          AND p_payload->>'day' IS DISTINCT FROM '2'
        )
        OR jsonb_typeof(p_payload->'quantity') IS DISTINCT FROM 'number'
        OR COALESCE(p_payload->>'quantity' ~ '^[1-9][0-9]*$', false) = false
        OR jsonb_typeof(p_payload->'revenue') IS DISTINCT FROM 'number'
        OR COALESCE(p_payload->>'revenue' ~ '^(0|[1-9][0-9]*)$', false) = false THEN
        RAISE EXCEPTION 'Invalid sale record';
      END IF;
      IF (p_payload->>'quantity')::numeric > 9007199254740991
        OR (p_payload->>'revenue')::numeric > 9007199254740991 THEN
        RAISE EXCEPTION 'Sale value is too large';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_state->'sales', '[]'::jsonb)) AS records(item)
        WHERE item->>'id' = p_payload->>'id'
      ) THEN
        v_state := jsonb_set(
          v_state,
          '{sales}',
          COALESCE(v_state->'sales', '[]'::jsonb) || jsonb_build_array(p_payload),
          true
        );
      END IF;

    WHEN 'delete_sales' THEN
      IF jsonb_typeof(p_payload->'ids') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Invalid sale IDs';
      END IF;
      SELECT COALESCE(jsonb_agg(item), '[]'::jsonb) INTO v_records
      FROM jsonb_array_elements(COALESCE(v_state->'sales', '[]'::jsonb)) AS records(item)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(p_payload->'ids') AS ids(id)
        WHERE ids.id = item->>'id'
      );
      v_state := jsonb_set(v_state, '{sales}', v_records, true);

    ELSE
      RAISE EXCEPTION 'Unsupported PUKRUN state action';
  END CASE;

  UPDATE public.pukrun_state
  SET state = v_state
  WHERE id = 1;

  RETURN v_state;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_pukrun_state(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_pukrun_state(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_pukrun_state(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_pukrun_state(text, jsonb) TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'pukrun_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pukrun_state;
  END IF;
END
$$;
