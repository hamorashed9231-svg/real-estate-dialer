import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

// Zero-dependency CSV parser to parse comma-separated values correctly
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0 || !lines[0].trim()) return [];

  const headers = parseCSVLine(lines[0]);
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] || '';
    });
    result.push(record);
  }
  return result;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map(val => val.replace(/^"|"$/g, '')); // Remove outer quotes
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const supabase = getSupabaseClient(authHeader);

    // 1. Authenticate user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch company_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'Tenant profile not found' },
        { status: 403 }
      );
    }

    const { company_id } = profile;

    // 3. Parse request payload
    // csvData: raw CSV text
    // fieldMappings: e.g., { name: 'Full Name', phone: 'Phone Number', email: 'Email Address' }
    // campaignId: optional string
    const { csvData, fieldMappings, campaignId } = await req.json();

    if (!csvData || !fieldMappings || !fieldMappings.name || !fieldMappings.phone) {
      return NextResponse.json(
        { error: 'csvData and fieldMappings (must map name and phone) are required.' },
        { status: 400 }
      );
    }

    // 4. Parse CSV records
    const parsedRecords = parseCSV(csvData);
    if (parsedRecords.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty or invalid.' }, { status: 400 });
    }

    const leadsToUpsert: any[] = [];

    for (const record of parsedRecords) {
      const nameKey = fieldMappings.name;
      const phoneKey = fieldMappings.phone;
      const emailKey = fieldMappings.email;

      const name = record[nameKey];
      const rawPhone = record[phoneKey];
      const email = emailKey ? record[emailKey] : null;

      if (!name || !rawPhone) continue; // Skip rows missing mandatory fields

      // Format phone number
      const digitsOnly = rawPhone.replace(/\D/g, '');
      const formattedPhone = digitsOnly.length === 10 ? `+1${digitsOnly}` : `+${digitsOnly}`;

      // Aggregate all other columns into custom_fields JSONB
      const custom_fields: Record<string, any> = {};
      const mappedHeaders = Object.values(fieldMappings);

      for (const [key, value] of Object.entries(record)) {
        if (!mappedHeaders.includes(key)) {
          custom_fields[key] = value;
        }
      }

      leadsToUpsert.push({
        company_id,
        name,
        phone: formattedPhone,
        email: email || null,
        status: 'new',
        custom_fields,
      });
    }

    if (leadsToUpsert.length === 0) {
      return NextResponse.json({ error: 'No valid leads found in CSV to import.' }, { status: 400 });
    }

    // 5. Batch upsert leads (using ON CONFLICT to avoid duplicate phones in company)
    const { data: insertedLeads, error: upsertError } = await supabase
      .from('leads')
      .upsert(leadsToUpsert, { onConflict: 'company_id,phone' })
      .select('id, phone');

    if (upsertError || !insertedLeads) {
      return NextResponse.json(
        { error: 'Failed to import leads database', details: upsertError.message },
        { status: 500 }
      );
    }

    // 6. Connect imported leads to the target campaign queue
    if (campaignId) {
      const campaignLeads = insertedLeads.map((lead, index) => ({
        company_id,
        campaign_id: campaignId,
        lead_id: lead.id,
        status: 'pending',
        priority: 0,
      }));

      // Upsert into campaign_leads (ignores duplicates)
      const { error: queueError } = await supabase
        .from('campaign_leads')
        .upsert(campaignLeads, { onConflict: 'campaign_id,lead_id' });

      if (queueError) {
        return NextResponse.json(
          { error: 'Leads imported, but queue assignment failed.', details: queueError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      imported_count: insertedLeads.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
