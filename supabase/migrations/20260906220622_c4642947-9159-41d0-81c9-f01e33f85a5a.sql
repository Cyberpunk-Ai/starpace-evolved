CREATE OR REPLACE FUNCTION public.__install_schema(sql text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN EXECUTE sql; END;
$fn$;
REVOKE ALL ON FUNCTION public.__install_schema(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.__install_schema(text) TO sandbox_exec;