import { DomainService } from '../../../services/domainService.js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const domains = await DomainService.listDomains(page, limit);
    return NextResponse.json(domains);
  } catch (error) {
    console.error('Domain API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { 
      name, 
      type = 'NATIVE',
      autoCreateRecords = true,
      nameservers,
      adminEmail 
    } = body;
    
    if (!name) {
      return NextResponse.json({ error: 'Domain name is required' }, { status: 400 });
    }

    // Note: You'll need to handle user authentication differently in App Router
    // const user = await getUser(request); // Implement your auth logic
    
    const domain = await DomainService.createDomain(name, {
      type,
      autoCreateRecords,
      nameservers,
      adminEmail,
      createdBy: 'api' // You'll need to get the actual user ID from your auth system
    });
    
    return NextResponse.json(domain, { status: 201 });
  } catch (error) {
    console.error('Domain API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}