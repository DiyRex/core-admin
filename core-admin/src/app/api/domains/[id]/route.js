import { DomainService } from '../../../../services/domainService.js';

// GET method handler - Retrieve domain with records
export async function GET(request, { params }) {
  const { id } = params;

  try {
    const domain = await DomainService.getDomainWithRecords(parseInt(id));
    return Response.json(domain, { status: 200 });
  } catch (error) {
    console.error('Domain API GET error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// PUT method handler - Update domain
export async function PUT(request, { params }) {
  const { id } = params;

  try {
    const body = await request.json();
    const updatedDomain = await DomainService.updateDomain(parseInt(id), body);
    return Response.json(updatedDomain, { status: 200 });
  } catch (error) {
    console.error('Domain API PUT error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// DELETE method handler - Delete domain
export async function DELETE(request, { params }) {
  const { id } = params;

  try {
    const result = await DomainService.deleteDomain(parseInt(id));
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error('Domain API DELETE error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}