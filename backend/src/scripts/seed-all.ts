import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('⏳ Starting seed...')
  
  // 1. Create or Find Company
  let company = await prisma.company.findFirst({
    where: { name: 'PropDial Demo' }
  })
  
  if (!company) {
    company = await prisma.company.create({
      data: { name: 'PropDial Demo' }
    })
    console.log('✅ Created company: PropDial Demo')
  } else {
    console.log('ℹ️ Company already exists')
  }

  // 2. Create Admin User
  let admin = await prisma.user.findFirst({
    where: { email: 'hamo@propdial.com' }
  })
  if (!admin) {
    admin = await prisma.user.create({
      data: {
        firstName: 'Hamo',
        lastName: 'Admin',
        email: 'hamo@propdial.com',
        // '$2b$12$mjS/pcQEcomn7tyIntqXFe/uQnHAJ626lt9L.IrN80h4mjiod86Wa' is bcrypt of 'PropDial2025!'
        password: '$2b$12$mjS/pcQEcomn7tyIntqXFe/uQnHAJ626lt9L.IrN80h4mjiod86Wa',
        role: 'admin',
        companyId: company.id,
      }
    })
    await prisma.agentState.create({
      data: {
        userId: admin.id,
        status: 'offline',
      }
    })
    console.log('✅ Created admin user: hamo@propdial.com')
  }

  // 3. Create Agents
  const agentEmails = ['ahmed@propdial.com', 'sara@propdial.com', 'manager@propdial.com']
  const agentRoles = ['agent', 'agent', 'manager']
  const agentFirstNames = ['Ahmed', 'Sara', 'Mohamed']
  const agentLastNames = ['Agent', 'Agent', 'Manager']

  for (let i = 0; i < agentEmails.length; i++) {
    const existing = await prisma.user.findFirst({ where: { email: agentEmails[i] } })
    if (!existing) {
      const u = await prisma.user.create({
        data: {
          firstName: agentFirstNames[i],
          lastName: agentLastNames[i],
          email: agentEmails[i],
          password: '$2b$12$mjS/pcQEcomn7tyIntqXFe/uQnHAJ626lt9L.IrN80h4mjiod86Wa',
          role: agentRoles[i],
          companyId: company.id,
        }
      })
      await prisma.agentState.create({
        data: {
          userId: u.id,
          status: 'offline',
        }
      })
      console.log(`✅ Created user: ${agentEmails[i]}`)
    }
  }

  // 4. Create Campaign
  let campaign = await prisma.campaign.findFirst({
    where: { companyId: company.id, name: 'NYC Expired Listings - June 2025' }
  })
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        name: 'NYC Expired Listings - June 2025',
        mode: 'power',
        status: 'paused',
        companyId: company.id,
      }
    })
    console.log('✅ Campaign created:', campaign.name)
  }

  // 5. Create 20 Demo Leads
  const existingLeadsCount = await prisma.lead.count({ where: { companyId: company.id } })
  if (existingLeadsCount === 0) {
    const leads = []
    const firstNames = ['James','Robert','Mary','Patricia','John','Linda','Michael','Barbara','William','Elizabeth','David','Jennifer','Richard','Maria','Joseph','Susan','Thomas','Margaret','Charles','Dorothy']
    const lastNames = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Wilson','Taylor','Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Young','Robinson','Lewis']
    const cities = ['New York','Brooklyn','Queens','Bronx','Staten Island','Newark','Jersey City','Hoboken','White Plains','Yonkers']
    const states = ['NY','NY','NY','NY','NY','NJ','NJ','NJ','NY','NY']
    const areaCodes = ['212','718','347','646','917','201','732','908','914','516']

    for (let i = 0; i < 20; i++) {
      const areaCode = areaCodes[i % areaCodes.length]
      leads.push({
        name: `${firstNames[i]} ${lastNames[i]}`,
        phone: `+1${areaCode}${Math.floor(1000000 + Math.random() * 9000000)}`,
        email: `${firstNames[i].toLowerCase()}.${lastNames[i].toLowerCase()}@email.com`,
        customFields: JSON.stringify({
          city: cities[i % cities.length],
          state: states[i % states.length],
          zip: `${10001 + i}`,
          source: i % 3 === 0 ? 'FSBO' : i % 3 === 1 ? 'Expired Listing' : 'Cold List',
          notes: `Demo note for ${firstNames[i]}`,
        }),
        status: 'New',
        companyId: company.id,
      })
    }
    await prisma.lead.createMany({ data: leads as any })
    console.log('✅ Created 20 demo leads')

    // Link leads to campaign
    const createdLeads = await prisma.lead.findMany({
      where: { companyId: company.id },
      take: 20
    })

    await prisma.campaignLead.createMany({
      data: createdLeads.map((lead, i) => ({
        campaignId: campaign!.id,
        leadId: lead.id,
        status: 'pending',
        priority: 20 - i,
        companyId: company!.id,
      }))
    })
    console.log('✅ Leads added to campaign')

    // Create call history
    const dispositions = ['Interested', 'Not Interested', 'Callback Scheduled', 'No Answer', 'Left Voicemail']
    for (let i = 0; i < 10; i++) {
      const lead = createdLeads[i]
      const duration = Math.floor(30 + Math.random() * 270)
      const hoursAgo = Math.floor(Math.random() * 8)
      const startTime = new Date(Date.now() - hoursAgo * 3600000)
      
      await prisma.call.create({
        data: {
          leadId: lead.id,
          userId: admin.id,
          companyId: company.id,
          campaignId: campaign!.id,
          phoneNumber: lead.phone,
          voipCallSid: `CA${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
          status: 'completed',
          disposition: dispositions[i % dispositions.length],
          duration,
          createdAt: startTime,
        }
      })
    }
    console.log('✅ Created 10 demo call records')
  }

  // 6. Create Caller ID Pool
  const existingPoolCount = await prisma.callerIDPool.count({ where: { companyId: company.id } })
  if (existingPoolCount === 0) {
    await prisma.callerIDPool.createMany({
      data: [
        { phoneNumber: '+12125550100', areaCode: '212', state: 'NY', companyId: company.id, isActive: true },
        { phoneNumber: '+17185550101', areaCode: '718', state: 'NY', companyId: company.id, isActive: true },
        { phoneNumber: '+13475550102', areaCode: '347', state: 'NY', companyId: company.id, isActive: true },
        { phoneNumber: '+12015550103', areaCode: '201', state: 'NJ', companyId: company.id, isActive: true },
      ]
    })
    console.log('✅ CallerID Pool created')
  }

  console.log('\n🎉 Seed completed!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Login credentials:')
  console.log('Admin:   hamo@propdial.com / PropDial2025!')
  console.log('Manager: manager@propdial.com / PropDial2025!')  
  console.log('Agent:   ahmed@propdial.com / PropDial2025!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
