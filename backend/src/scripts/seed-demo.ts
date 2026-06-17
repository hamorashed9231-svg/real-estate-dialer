import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // جيب الـ company اللي اتعملت
  const company = await prisma.company.findFirst({
    where: { name: 'PropDial Demo' }
  })
  
  if (!company) {
    console.error('❌ Company مش موجودة. اعمل register الأول.')
    return
  }

  console.log('✅ Company found:', company.name)

  // اعمل 3 agents
  const agents = await Promise.all([
    prisma.user.create({
      data: {
        firstName: 'Ahmed',
        lastName: 'Agent',
        email: 'ahmed@propdial.com',
        password: '$2b$12$mjS/pcQEcomn7tyIntqXFe/uQnHAJ626lt9L.IrN80h4mjiod86Wa',
        role: 'agent',
        companyId: company.id,
      }
    }),
    prisma.user.create({
      data: {
        firstName: 'Sara',
        lastName: 'Agent',
        email: 'sara@propdial.com',
        password: '$2b$12$mjS/pcQEcomn7tyIntqXFe/uQnHAJ626lt9L.IrN80h4mjiod86Wa',
        role: 'agent',
        companyId: company.id,
      }
    }),
    prisma.user.create({
      data: {
        firstName: 'Mohamed',
        lastName: 'Manager',
        email: 'manager@propdial.com',
        password: '$2b$12$mjS/pcQEcomn7tyIntqXFe/uQnHAJ626lt9L.IrN80h4mjiod86Wa',
        role: 'manager',
        companyId: company.id,
      }
    }),
  ])
  console.log('✅ Created', agents.length, 'users')

  // اعمل campaign
  const campaign = await prisma.campaign.create({
    data: {
      name: 'NYC Expired Listings - June 2025',
      mode: 'power',
      status: 'paused',
      companyId: company.id,
    }
  })
  console.log('✅ Campaign created:', campaign.name)

  // اعمل 20 lead تجريبي
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

  // اربط الـ leads بالـ campaign
  const createdLeads = await prisma.lead.findMany({
    where: { companyId: company.id },
    take: 20
  })

  await prisma.campaignLead.createMany({
    data: createdLeads.map((lead, i) => ({
      campaignId: campaign.id,
      leadId: lead.id,
      status: 'pending',
      priority: 20 - i,
      companyId: company.id,
    }))
  })
  console.log('✅ Leads added to campaign')

  // اعمل caller ID pool
  await prisma.callerIDPool.createMany({
    data: [
      { phoneNumber: '+12125550100', areaCode: '212', state: 'NY', companyId: company.id, isActive: true },
      { phoneNumber: '+17185550101', areaCode: '718', state: 'NY', companyId: company.id, isActive: true },
      { phoneNumber: '+13475550102', areaCode: '347', state: 'NY', companyId: company.id, isActive: true },
      { phoneNumber: '+12015550103', areaCode: '201', state: 'NJ', companyId: company.id, isActive: true },
    ]
  })
  console.log('✅ CallerID Pool created')

  // اعمل call history تجريبي
  const admin = await prisma.user.findFirst({
    where: { companyId: company.id, role: 'admin' }
  })

  const dispositions = ['Interested', 'Not Interested', 'Callback Scheduled', 'No Answer', 'Left Voicemail']
  
  for (let i = 0; i < 10; i++) {
    const lead = createdLeads[i]
    const duration = Math.floor(30 + Math.random() * 270)
    const hoursAgo = Math.floor(Math.random() * 8)
    const startTime = new Date(Date.now() - hoursAgo * 3600000)
    
    await prisma.call.create({
      data: {
        leadId: lead.id,
        userId: admin!.id,
        companyId: company.id,
        campaignId: campaign.id,
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

  console.log('\n🎉 Seed completed!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('Login credentials:')
  console.log('Admin:   hamo@propdial.com / PropDial2025!')
  console.log('Manager: manager@propdial.com / PropDial2025!')  
  console.log('Agent:   ahmed@propdial.com / PropDial2025!')
  console.log('URL:     http://localhost:5173')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
