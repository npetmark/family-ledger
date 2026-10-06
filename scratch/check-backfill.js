import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkBackfill() {
  const { data: households, error: hError } = await supabase.from('households').select('*');
  console.log('Households:', households);

  const { data: members, error: mError } = await supabase.from('household_members').select('*');
  console.log('Members:', members);

  const { data: accounts, error: aError } = await supabase.from('accounts').select('id, name, account_type, starting_balance, user_id, household_id, owner_user_id');
  console.log('Accounts:', accounts);
}

checkBackfill().catch(console.error);
