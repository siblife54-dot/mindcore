ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS account_id bigint REFERENCES public.accounts(id);

ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS slug text;

ALTER TABLE public.courses
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
