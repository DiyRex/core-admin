import { RecordService, SpecializedRecords } from '../../../../../services/recordService.js';
import { NextRequest } from 'next/server';

// GET method handler
export async function GET(request, { params }) {
  const { id } = params;
  const domainId = parseInt(id);
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  try {
    const records = await RecordService.getRecordsByDomain(domainId, type);
    return Response.json(records, { status: 200 });
  } catch (error) {
    console.error('Records API GET error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// POST method handler
export async function POST(request, { params }) {
  const { id } = params;
  const domainId = parseInt(id);

  try {
    const body = await request.json();
    const { recordType, bulk = false } = body;
    
    if (bulk && Array.isArray(body.records)) {
      // Bulk create records
      const records = await RecordService.createRecords(domainId, body.records);
      return Response.json(records, { status: 201 });
    }

    // Single record creation with specialized handlers
    let record;
    switch (recordType) {
      case 'A':
        const { hostname, ipAddress, ttl = 300 } = body;
        record = await SpecializedRecords.addARecord(domainId, hostname, ipAddress, ttl);
        break;
        
      case 'CNAME':
        const { alias, target, ttl: cnameTtl = 300 } = body;
        record = await SpecializedRecords.addCNAMERecord(domainId, alias, target, cnameTtl);
        break;
        
      case 'MX':
        const { hostname: mxHost, mailServer, priority = 10, ttl: mxTtl = 3600 } = body;
        record = await SpecializedRecords.addMXRecord(domainId, mxHost, mailServer, priority, mxTtl);
        break;
        
      case 'TXT':
        const { hostname: txtHost, text, ttl: txtTtl = 3600 } = body;
        record = await SpecializedRecords.addTXTRecord(domainId, txtHost, text, txtTtl);
        break;
        
      case 'subdomain':
        const { subdomain, ipAddress: subIp, ttl: subTtl = 300 } = body;
        record = await SpecializedRecords.addSubdomain(domainId, subdomain, subIp, subTtl);
        break;
        
      default:
        // Generic record creation
        record = await RecordService.createRecord(domainId, body);
    }
    
    return Response.json(record, { status: 201 });
  } catch (error) {
    console.error('Records API POST error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// If you need other HTTP methods, export them as named functions:
// export async function PUT(request, { params }) { ... }
// export async function DELETE(request, { params }) { ... }
// export async function PATCH(request, { params }) { ... }