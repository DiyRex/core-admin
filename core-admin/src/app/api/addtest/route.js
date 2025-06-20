// src/app/api/addtest/route.js - App Router API Route
import { DomainService } from '../../../services/domainService.js';
import { SpecializedRecords } from '../../../services/recordService.js';
import { NextResponse } from 'next/server';

// GET method for testing
export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'DNS Test API is working!',
    availableMethods: ['GET', 'POST'],
    usage: {
      test: 'GET /api/addtest',
      createDomain: 'POST /api/addtest',
      exampleBody: {
        domain: 'mytest.local',
        ip: '192.168.1.200',
        clear: true
      }
    },
    endpoints: {
      'GET /api/addtest': 'Test if API is working',
      'POST /api/addtest': 'Create test domain with records'
    }
  });
}

// POST method for creating domains
export async function POST(request) {
  try {
    const body = await request.json();
    
    // Get domain name and IP from request, or use defaults
    const { 
      domain = 'testapi.local', 
      ip = '192.168.100.50',
      clear = false 
    } = body;

    console.log(`🧪 Testing domain creation: ${domain} -> ${ip}`);

    // Optional: Clear existing domain first
    if (clear) {
      try {
        const existingDomain = await DomainService.getDomainByName(domain);
        if (existingDomain) {
          await DomainService.deleteDomain(existingDomain.id);
          console.log(`🗑️ Cleared existing domain: ${domain}`);
        }
      } catch (error) {
        // Domain doesn't exist, that's fine
        console.log(`ℹ️ Domain ${domain} doesn't exist, creating new one`);
      }
    }

    // Step 1: Create domain with automatic SOA and NS records
    console.log('📝 Step 1: Creating domain...');
    const newDomain = await DomainService.createDomain(domain, {
      type: 'NATIVE',
      autoCreateRecords: true,
      nameservers: [`ns1.${domain}`, `ns2.${domain}`],
      adminEmail: `admin.${domain}`,
      createdBy: 'test-api'
    });

    console.log(`✅ Domain created with ID: ${newDomain.id}`);

    // Step 2: Add main domain A record
    console.log('📝 Step 2: Adding main A record...');
    const mainARecord = await SpecializedRecords.addARecord(
      newDomain.id, 
      domain, 
      ip, 
      300
    );

    // Step 3: Add www subdomain
    console.log('📝 Step 3: Adding www subdomain...');
    const wwwRecord = await SpecializedRecords.addARecord(
      newDomain.id, 
      `www.${domain}`, 
      ip, 
      300
    );

    // Step 4: Add API subdomain
    console.log('📝 Step 4: Adding api subdomain...');
    const apiRecord = await SpecializedRecords.addSubdomain(
      newDomain.id, 
      'api', 
      ip, 
      300
    );

    // Step 5: Add nameserver A records
    console.log('📝 Step 5: Adding nameserver A records...');
    const ns1Record = await SpecializedRecords.addARecord(
      newDomain.id, 
      `ns1.${domain}`, 
      ip, 
      3600
    );

    const ns2Record = await SpecializedRecords.addARecord(
      newDomain.id, 
      `ns2.${domain}`, 
      ip, 
      3600
    );

    // Step 6: Get final domain with all records
    const finalDomain = await DomainService.getDomainWithRecords(newDomain.id);

    console.log('🎉 Test completed successfully!');

    // Return comprehensive response
    return NextResponse.json({
      success: true,
      message: `Domain ${domain} created successfully!`,
      domain: finalDomain,
      records: {
        total: finalDomain.records.length,
        byType: finalDomain.records.reduce((acc, record) => {
          acc[record.type] = (acc[record.type] || 0) + 1;
          return acc;
        }, {})
      },
      testCommands: {
        mainDomain: `dig @127.0.0.1 -p 53 ${domain} A`,
        wwwSubdomain: `dig @127.0.0.1 -p 53 www.${domain} A`,
        apiSubdomain: `dig @127.0.0.1 -p 53 api.${domain} A`,
        soaRecord: `dig @127.0.0.1 -p 53 ${domain} SOA`,
        nsRecords: `dig @127.0.0.1 -p 53 ${domain} NS`
      },
      nextSteps: [
        'Wait 5-10 seconds for zone file generation',
        `Run: dig @127.0.0.1 -p 53 ${domain} A`,
        `Expected result: ${domain} should resolve to ${ip}`,
        'Check for authoritative answer (aa flag) in dig output'
      ]
    }, { status: 201 });

  } catch (error) {
    console.error('❌ Test API error:', error);
    return NextResponse.json({ 
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}