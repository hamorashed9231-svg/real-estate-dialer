const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables from .env.local dynamically to avoid hardcoding credentials
let env = {};
try {
  const envPath = path.join(__dirname, '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        env[key] = value.trim();
      }
    });
  }
} catch (err) {
  console.warn('Failed to parse .env.local file:', err.message);
}

const connectionString = env.DATABASE_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rvdtydmmsywqvyvwqqhn.supabase.co';
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  console.log('Starting end-to-end database migrations and seed script...');
  
  const client = new Client({ connectionString });
  
  try {
    // 1. Connect to PostgreSQL
    await client.connect();
    console.log('Successfully connected to Supabase PostgreSQL database.');

    // 2. Clean database before running schema migrations
    console.log('Cleaning existing tables for a fresh migration...');
    await client.query(`
      DROP TABLE IF EXISTS public.onboarding_status CASCADE;
      DROP TABLE IF EXISTS public.webhook_events CASCADE;
      DROP TABLE IF EXISTS public.notes CASCADE;
      DROP TABLE IF EXISTS public.calls CASCADE;
      DROP TABLE IF EXISTS public.campaign_leads CASCADE;
      DROP TABLE IF EXISTS public.campaigns CASCADE;
      DROP TABLE IF EXISTS public.leads CASCADE;
      DROP TABLE IF EXISTS public.profiles CASCADE;
      DROP TABLE IF EXISTS public.companies CASCADE;
    `);
    console.log('Database cleaned.');

    // 3. Read and execute supabase_schema.sql
    console.log('Reading supabase_schema.sql...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'supabase_schema.sql'), 'utf8');
    console.log('Executing schema migrations (creating tables, triggers, and RLS policies)...');
    await client.query(schemaSql);
    console.log('Schema migrations completed.');

    // 3. Read and execute supabase_queue_function.sql
    console.log('Reading supabase_queue_function.sql...');
    const queueSql = fs.readFileSync(path.join(__dirname, 'supabase_queue_function.sql'), 'utf8');
    console.log('Executing queue stored procedure migrations...');
    await client.query(queueSql);
    console.log('Queue stored procedure migrations completed.');

    // 4. Grant table privileges to service role
    console.log('Granting privileges on all tables to service_role...');
    await client.query(`
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
      GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
      GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
    `);
    console.log('Table privileges granted successfully.');

    // 5. Initialize Supabase Admin Client
    console.log('Initializing Supabase Admin client...');
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const testEmail = 'admin@apexrealty.com';
    const testPassword = 'password123';

    // 6. Cleanup existing user if any (to allow clean re-runs)
    console.log(`Checking if user ${testEmail} already exists...`);
    const { data: authUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      throw new Error(`Failed to list users: ${listError.message}`);
    }

    const existingUser = authUsers.users.find(u => u.email === testEmail);
    if (existingUser) {
      console.log(`User already exists (ID: ${existingUser.id}). Deleting for a fresh start...`);
      await supabaseAdmin.auth.admin.deleteUser(existingUser.id);
      console.log('Existing user deleted.');
    }

    // 7. Create Company
    console.log('Creating test Company: "Apex Realty Group"...');
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({ name: 'Apex Realty Group' })
      .select('id')
      .single();

    if (companyError || !company) {
      throw new Error(`Failed to create company: ${companyError?.message}`);
    }
    const companyId = company.id;
    console.log(`Company created with ID: ${companyId}`);

    // 8. Create Auth User
    console.log(`Registering test user: ${testEmail}...`);
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });

    if (authError || !authUser.user) {
      throw new Error(`Failed to create auth user: ${authError?.message}`);
    }
    const userId = authUser.user.id;
    console.log(`Auth user created with ID: ${userId}`);

    // 9. Create Profile
    console.log('Creating administrator Profile...');
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        company_id: companyId,
        role: 'admin',
        full_name: 'John Doe',
      });

    if (profileError) {
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }
    console.log('Profile created successfully.');

    // 10. Create Onboarding Status
    console.log('Logging onboarding progress in state machine...');
    const { error: onboardingError } = await supabaseAdmin
      .from('onboarding_status')
      .insert({
        email: testEmail,
        user_id: userId,
        company_id: companyId,
        status: 'completed',
        step: 'profile_created',
      });

    if (onboardingError) {
      throw new Error(`Failed to write onboarding status: ${onboardingError.message}`);
    }
    console.log('Onboarding status recorded.');

    // 11. Create Campaign
    console.log('Creating active Campaign: "Florida FSBO Outbound"...');
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('campaigns')
      .insert({
        company_id: companyId,
        name: 'Florida FSBO Outbound List',
        status: 'active',
      })
      .select('id')
      .single();

    if (campaignError || !campaign) {
      throw new Error(`Failed to create campaign: ${campaignError?.message}`);
    }
    const campaignId = campaign.id;
    console.log(`Campaign created with ID: ${campaignId}`);

    // 12. Create Mock Leads
    console.log('Adding 5 mock leads with custom metadata...');
    const { data: leads, error: leadsError } = await supabaseAdmin
      .from('leads')
      .insert([
        {
          company_id: companyId,
          name: 'Sarah Jenkins',
          phone: '+15550101',
          email: 'sarah@example.com',
          status: 'new',
          custom_fields: { propertyType: 'Single Family', bedrooms: 4, bathrooms: 3, listingPrice: 520000 },
        },
        {
          company_id: companyId,
          name: 'Michael Carter',
          phone: '+15550102',
          email: 'michael@example.com',
          status: 'new',
          custom_fields: { propertyType: 'Condo', bedrooms: 2, bathrooms: 2, listingPrice: 310000 },
        },
        {
          company_id: companyId,
          name: 'David Vance',
          phone: '+15550103',
          email: 'david@example.com',
          status: 'new',
          custom_fields: { propertyType: 'Townhouse', bedrooms: 3, bathrooms: 2.5, listingPrice: 415000 },
        },
        {
          company_id: companyId,
          name: 'Emily Rodriguez',
          phone: '+15550104',
          email: 'emily@example.com',
          status: 'new',
          custom_fields: { propertyType: 'Single Family', bedrooms: 5, bathrooms: 4, listingPrice: 750000 },
        },
        {
          company_id: companyId,
          name: 'Robert Chen',
          phone: '+15550105',
          email: 'robert@example.com',
          status: 'new',
          custom_fields: { propertyType: 'Multi-Family', bedrooms: 6, bathrooms: 4, listingPrice: 890000 },
        },
      ])
      .select('id, name');

    if (leadsError || !leads) {
      throw new Error(`Failed to create leads: ${leadsError?.message}`);
    }
    console.log(`5 leads created successfully.`);

    // 13. Queue Leads into Campaign Queue
    console.log('Queuing leads into campaign_leads...');
    const campaignLeads = leads.map((lead, index) => ({
      campaign_id: campaignId,
      lead_id: lead.id,
      company_id: companyId,
      status: 'pending',
      priority: index === 0 ? 10 : index === 1 ? 5 : 0,
    }));

    const { error: queueError } = await supabaseAdmin
      .from('campaign_leads')
      .insert(campaignLeads);

    if (queueError) {
      throw new Error(`Failed to queue campaign leads: ${queueError.message}`);
    }
    console.log('Campaign queue setup completed.');
    console.log('\n=============================================================');
    console.log('SUCCESS! Database is fully migrated and seeded.');
    console.log(`Login Email   : ${testEmail}`);
    console.log(`Login Password: ${testPassword}`);
    console.log('=============================================================');

  } catch (err) {
    console.error('\n❌ DATABASE MIGRATION/SEED CRASHED:', err.message);
  } finally {
    await client.end();
    console.log('Database connection closed.');
  }
}

run();
