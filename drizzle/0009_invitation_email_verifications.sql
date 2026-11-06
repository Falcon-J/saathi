CREATE TABLE invitation_email_verifications (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(trim(email)) AND length(email) > 0),
  verified_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE invitation_email_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invitation_email_verifications FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
-- Intentionally empty: confirmation timestamps do not prove mailbox ownership.
-- Only a server-verified OTP may create a proof. An email change removes it,
-- including a later change back to a previously verified address.
CREATE FUNCTION public.invalidate_invitation_email_verification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF lower(trim(OLD.email)) IS DISTINCT FROM lower(trim(NEW.email)) THEN
    DELETE FROM public.invitation_email_verifications WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_invitation_email_verification() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER invalidate_invitation_email_verification
AFTER UPDATE OF email ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.invalidate_invitation_email_verification();
