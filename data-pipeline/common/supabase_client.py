from supabase import Client, create_client

from .config import SUPABASE_SECRET_KEY, SUPABASE_URL


def get_client() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
