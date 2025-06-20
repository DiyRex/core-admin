export class DNSApiClient {
  
  // Domain operations
  static async createDomain(domainData) {
    const response = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(domainData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create domain');
    }
    
    return response.json();
  }

  static async getDomains(page = 1, limit = 50) {
    const response = await fetch(`/api/domains?page=${page}&limit=${limit}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch domains');
    }
    
    return response.json();
  }

  static async getDomain(domainId) {
    const response = await fetch(`/api/domains/${domainId}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch domain');
    }
    
    return response.json();
  }

  static async updateDomain(domainId, updates) {
    const response = await fetch(`/api/domains/${domainId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update domain');
    }
    
    return response.json();
  }

  static async deleteDomain(domainId) {
    const response = await fetch(`/api/domains/${domainId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete domain');
    }
    
    return response.json();
  }

  // Record operations
  static async createRecord(domainId, recordData) {
    const response = await fetch(`/api/domains/${domainId}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recordData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create record');
    }
    
    return response.json();
  }

  static async getRecords(domainId, recordType = null) {
    const url = recordType 
      ? `/api/domains/${domainId}/records?type=${recordType}`
      : `/api/domains/${domainId}/records`;
      
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error('Failed to fetch records');
    }
    
    return response.json();
  }

  static async updateRecord(recordId, updates) {
    const response = await fetch(`/api/records/${recordId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update record');
    }
    
    return response.json();
  }

  static async deleteRecord(recordId) {
    const response = await fetch(`/api/records/${recordId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete record');
    }
    
    return response.json();
  }

  // Specialized record creation methods
  static async addARecord(domainId, hostname, ipAddress, ttl = 300) {
    return this.createRecord(domainId, {
      recordType: 'A',
      hostname,
      ipAddress,
      ttl
    });
  }

  static async addCNAME(domainId, alias, target, ttl = 300) {
    return this.createRecord(domainId, {
      recordType: 'CNAME',
      alias,
      target,
      ttl
    });
  }

  static async addMXRecord(domainId, hostname, mailServer, priority = 10, ttl = 3600) {
    return this.createRecord(domainId, {
      recordType: 'MX',
      hostname,
      mailServer,
      priority,
      ttl
    });
  }

  static async addTXTRecord(domainId, hostname, text, ttl = 3600) {
    return this.createRecord(domainId, {
      recordType: 'TXT',
      hostname,
      text,
      ttl
    });
  }

  static async addSubdomain(domainId, subdomain, ipAddress, ttl = 300) {
    return this.createRecord(domainId, {
      recordType: 'subdomain',
      subdomain,
      ipAddress,
      ttl
    });
  }
}

// Usage Examples
export const usageExamples = {
  // Create a domain with automatic SOA and NS records
  createDomain: async () => {
    const domain = await DNSApiClient.createDomain({
      name: 'example.com',
      type: 'NATIVE',
      autoCreateRecords: true,
      nameservers: ['ns1.example.com', 'ns2.example.com'],
      adminEmail: 'admin@example.com'
    });
    console.log('Created domain:', domain);
  },

  // Add A record
  addARecord: async (domainId) => {
    const record = await DNSApiClient.addARecord(domainId, 'www.example.com', '192.168.1.100');
    console.log('Added A record:', record);
  },

  // Add subdomain
  addSubdomain: async (domainId) => {
    const record = await DNSApiClient.addSubdomain(domainId, 'api', '192.168.1.101');
    console.log('Added subdomain:', record);
  },

  // Add MX record
  addMXRecord: async (domainId) => {
    const record = await DNSApiClient.addMXRecord(domainId, 'example.com', 'mail.example.com', 10);
    console.log('Added MX record:', record);
  },

  // Bulk create records
  bulkCreateRecords: async (domainId) => {
    const records = await DNSApiClient.createRecord(domainId, {
      bulk: true,
      records: [
        { name: 'www.example.com', type: 'A', content: '192.168.1.100', ttl: 300 },
        { name: 'api.example.com', type: 'A', content: '192.168.1.101', ttl: 300 },
        { name: 'mail.example.com', type: 'A', content: '192.168.1.102', ttl: 300 }
      ]
    });
    console.log('Bulk created records:', records);
  }
};