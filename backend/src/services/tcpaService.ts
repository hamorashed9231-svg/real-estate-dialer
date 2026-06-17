import prisma from '../lib/prisma';
import redis from '../lib/redis';

// Map of top US Area Codes to their corresponding IANA Timezone ID
export const AREA_CODE_TIMEZONE_MAP: Record<string, string> = {
  // Eastern Time (America/New_York)
  '201': 'America/New_York', '202': 'America/New_York', '203': 'America/New_York',
  '207': 'America/New_York', '212': 'America/New_York', '215': 'America/New_York',
  '216': 'America/New_York', '229': 'America/New_York', '234': 'America/New_York',
  '239': 'America/New_York', '240': 'America/New_York', '252': 'America/New_York',
  '267': 'America/New_York', '276': 'America/New_York', '301': 'America/New_York',
  '302': 'America/New_York', '304': 'America/New_York', '305': 'America/New_York',
  '315': 'America/New_York', '321': 'America/New_York', '330': 'America/New_York',
  '336': 'America/New_York', '347': 'America/New_York', '351': 'America/New_York',
  '352': 'America/New_York', '380': 'America/New_York', '401': 'America/New_York',
  '407': 'America/New_York', '410': 'America/New_York', '412': 'America/New_York',
  '413': 'America/New_York', '419': 'America/New_York', '434': 'America/New_York',
  '440': 'America/New_York', '443': 'America/New_York', '470': 'America/New_York',
  '478': 'America/New_York', '484': 'America/New_York', '508': 'America/New_York',
  '513': 'America/New_York', '516': 'America/New_York', '518': 'America/New_York',
  '540': 'America/New_York', '561': 'America/New_York', '567': 'America/New_York',
  '570': 'America/New_York', '585': 'America/New_York', '607': 'America/New_York',
  '609': 'America/New_York', '610': 'America/New_York', '614': 'America/New_York',
  '617': 'America/New_York', '631': 'America/New_York', '678': 'America/New_York',
  '704': 'America/New_York', '706': 'America/New_York', '716': 'America/New_York',
  '717': 'America/New_York', '718': 'America/New_York', '724': 'America/New_York',
  '727': 'America/New_York', '732': 'America/New_York', '740': 'America/New_York',
  '754': 'America/New_York', '757': 'America/New_York', '762': 'America/New_York',
  '770': 'America/New_York', '774': 'America/New_York', '781': 'America/New_York',
  '786': 'America/New_York', '802': 'America/New_York', '803': 'America/New_York',
  '804': 'America/New_York', '813': 'America/New_York', '814': 'America/New_York',
  '828': 'America/New_York', '843': 'America/New_York', '845': 'America/New_York',
  '848': 'America/New_York', '856': 'America/New_York', '857': 'America/New_York',
  '860': 'America/New_York', '862': 'America/New_York', '863': 'America/New_York',
  '864': 'America/New_York', '878': 'America/New_York', '904': 'America/New_York',
  '908': 'America/New_York', '910': 'America/New_York', '912': 'America/New_York',
  '914': 'America/New_York', '917': 'America/New_York', '919': 'America/New_York',
  '929': 'America/New_York', '937': 'America/New_York', '941': 'America/New_York',
  '954': 'America/New_York', '973': 'America/New_York', '978': 'America/New_York',
  '980': 'America/New_York', '984': 'America/New_York',

  // Central Time (America/Chicago)
  '205': 'America/Chicago', '217': 'America/Chicago', '218': 'America/Chicago',
  '219': 'America/Chicago', '224': 'America/Chicago', '225': 'America/Chicago',
  '228': 'America/Chicago', '251': 'America/Chicago', '256': 'America/Chicago',
  '260': 'America/Chicago', '262': 'America/Chicago', '269': 'America/Chicago',
  '309': 'America/Chicago', '312': 'America/Chicago', '313': 'America/Chicago',
  '314': 'America/Chicago', '317': 'America/Chicago', '318': 'America/Chicago',
  '319': 'America/Chicago', '320': 'America/Chicago', '325': 'America/Chicago',
  '331': 'America/Chicago', '334': 'America/Chicago', '337': 'America/Chicago',
  '402': 'America/Chicago', '409': 'America/Chicago', '414': 'America/Chicago',
  '417': 'America/Chicago', '423': 'America/Chicago', '463': 'America/Chicago',
  '479': 'America/Chicago', '501': 'America/Chicago', '504': 'America/Chicago',
  '507': 'America/Chicago', '512': 'America/Chicago', '515': 'America/Chicago',
  '517': 'America/Chicago', '534': 'America/Chicago', '563': 'America/Chicago',
  '573': 'America/Chicago', '574': 'America/Chicago', '586': 'America/Chicago',
  '601': 'America/Chicago', '605': 'America/Chicago', '608': 'America/Chicago',
  '612': 'America/Chicago', '615': 'America/Chicago', '616': 'America/Chicago',
  '618': 'America/Chicago', '629': 'America/Chicago', '630': 'America/Chicago',
  '636': 'America/Chicago', '641': 'America/Chicago', '651': 'America/Chicago',
  '660': 'America/Chicago', '662': 'America/Chicago', '701': 'America/Chicago',
  '708': 'America/Chicago', '712': 'America/Chicago', '715': 'America/Chicago',
  '731': 'America/Chicago', '734': 'America/Chicago', '763': 'America/Chicago',
  '765': 'America/Chicago', '769': 'America/Chicago', '773': 'America/Chicago',
  '779': 'America/Chicago', '810': 'America/Chicago', '812': 'America/Chicago',
  '815': 'America/Chicago', '816': 'America/Chicago', '847': 'America/Chicago',
  '865': 'America/Chicago', '870': 'America/Chicago', '872': 'America/Chicago',
  '901': 'America/Chicago', '903': 'America/Chicago', '906': 'America/Chicago',
  '920': 'America/Chicago', '931': 'America/Chicago', '936': 'America/Chicago',
  '938': 'America/Chicago', '940': 'America/Chicago', '947': 'America/Chicago',
  '952': 'America/Chicago', '979': 'America/Chicago', '985': 'America/Chicago',
  '989': 'America/Chicago',

  // Mountain Time (America/Denver)
  '303': 'America/Denver', '307': 'America/Denver', '308': 'America/Denver',
  '385': 'America/Denver', '406': 'America/Denver', '435': 'America/Denver',
  '480': 'America/Denver', '505': 'America/Denver', '520': 'America/Denver',
  '575': 'America/Denver', '602': 'America/Denver', '623': 'America/Denver',
  '719': 'America/Denver', '720': 'America/Denver', '801': 'America/Denver',
  '928': 'America/Denver', '970': 'America/Denver', '986': 'America/Denver',

  // Pacific Time (America/Los_Angeles)
  '206': 'America/Los_Angeles', '209': 'America/Los_Angeles', '213': 'America/Los_Angeles',
  '253': 'America/Los_Angeles', '310': 'America/Los_Angeles', '323': 'America/Los_Angeles',
  '360': 'America/Los_Angeles', '408': 'America/Los_Angeles', '415': 'America/Los_Angeles',
  '424': 'America/Los_Angeles', '425': 'America/Los_Angeles', '442': 'America/Los_Angeles',
  '458': 'America/Los_Angeles', '503': 'America/Los_Angeles', '509': 'America/Los_Angeles',
  '510': 'America/Los_Angeles', '530': 'America/Los_Angeles', '541': 'America/Los_Angeles',
  '559': 'America/Los_Angeles', '562': 'America/Los_Angeles', '564': 'America/Los_Angeles',
  '619': 'America/Los_Angeles', '626': 'America/Los_Angeles', '628': 'America/Los_Angeles',
  '650': 'America/Los_Angeles', '657': 'America/Los_Angeles', '661': 'America/Los_Angeles',
  '669': 'America/Los_Angeles', '702': 'America/Los_Angeles', '707': 'America/Los_Angeles',
  '714': 'America/Los_Angeles', '747': 'America/Los_Angeles', '760': 'America/Los_Angeles',
  '775': 'America/Los_Angeles', '805': 'America/Los_Angeles', '818': 'America/Los_Angeles',
  '820': 'America/Los_Angeles', '831': 'America/Los_Angeles', '858': 'America/Los_Angeles',
  '909': 'America/Los_Angeles', '916': 'America/Los_Angeles', '925': 'America/Los_Angeles',
  '949': 'America/Los_Angeles', '951': 'America/Los_Angeles', '971': 'America/Los_Angeles',
};

/**
 * Extracts the area code from E.164 phone string and maps it to a timezone.
 * Defaults to 'America/Chicago' if the area code is unknown.
 */
export function getTimezoneFromPhone(phoneE164: string): string {
  const cleanPhone = phoneE164.replace(/[^\d+]/g, '');
  let areaCode = '';

  if (cleanPhone.startsWith('+1') && cleanPhone.length >= 5) {
    areaCode = cleanPhone.substring(2, 5);
  } else if (cleanPhone.startsWith('1') && cleanPhone.length >= 4) {
    areaCode = cleanPhone.substring(1, 4);
  } else if (cleanPhone.length >= 3) {
    areaCode = cleanPhone.replace('+', '').substring(0, 3);
  }

  return AREA_CODE_TIMEZONE_MAP[areaCode] || 'America/Chicago';
}

/**
 * Enforces TCPA Calling Hours: 8:00 AM to 9:00 PM local time of the recipient.
 */
export function isWithinCallingHours(phoneE164: string): boolean {
  const timezone = getTimezoneFromPhone(phoneE164);
  
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    
    const formattedHour = parseInt(formatter.format(now), 10);
    return formattedHour >= 8 && formattedHour < 21; // 8 AM to 9 PM
  } catch (error) {
    console.error(`[TCPA TIMEZONE ERROR] Failed parsing time for tz ${timezone}:`, error);
    return false; // Conservatively block calls if timezone computation crashes
  }
}

/**
 * Scrubs a phone number against local database DNC list and external PAID API stubs.
 */
export async function checkDNC(phoneE164: string, companyId: string): Promise<boolean> {
  // 1. Check local database for company-specific DNC records
  const localDnc = await prisma.dNCRecord.findFirst({
    where: {
      phone: phoneE164,
      companyId: companyId,
    },
  });

  if (localDnc) {
    return true; // Number is in local DNC list
  }

  // 2. ⚠️ PAID API STUB - DNC.com / Telnyx DNC Scrubbing
  // To activate, provide DNC_API_KEY in .env and uncomment code below
  if (process.env.DNC_API_KEY) {
    // ⚠️ PAID API - DNC.com or Telnyx DNC Check
    // Example implementation:
    // try {
    //   const response = await fetch(`https://api.dnc.com/scrub?number=${phoneE164}&key=${process.env.DNC_API_KEY}`);
    //   const result = await response.json();
    //   return result.isDnc;
    // } catch (err) {
    //   console.error('[PAID DNC API ERROR]', err);
    // }
  }

  return false;
}

/**
 * Aggregates TCPA and DNC rules to validate if an outbound call is legal to initiate.
 */
export async function validateCallLegal(
  phoneE164: string,
  companyId: string
): Promise<{ allowed: boolean; reason?: string }> {
  // A. Calling Hours Guardrail
  if (!isWithinCallingHours(phoneE164)) {
    const tz = getTimezoneFromPhone(phoneE164);
    return {
      allowed: false,
      reason: `Calling hours restricted (8:00 AM - 9:00 PM). Target timezone is ${tz}.`,
    };
  }

  // B. DNC scrubbing check
  const isDnc = await checkDNC(phoneE164, companyId);
  if (isDnc) {
    const todayStr = new Date().toISOString().split('T')[0];
    await redis.incr(`dncblocks:${companyId}:${todayStr}`);
    return {
      allowed: false,
      reason: 'Recipient number is registered on the Do Not Call (DNC) list.',
    };
  }

  return { allowed: true };
}
