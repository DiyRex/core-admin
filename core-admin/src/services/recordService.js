import Record from '../models/Record.js';
import Domain from '../models/Domain.js';

export class RecordService {

  // Create a new record
  static async createRecord(domainId, recordData) {
    const {
      name,
      type,
      content,
      ttl = 300,
      prio = null,
      disabled = false,
      createdBy = 'api',
      comment = null
    } = recordData;

    try {
      // Validate domain exists
      const domain = await Domain.findByPk(domainId);
      if (!domain) {
        throw new Error('Domain not found');
      }

      // Validate record content based on type
      this.validateRecordContent(type, content);

      // Create record
      const record = await Record.create({
        domainId,
        name,
        type,
        content: this.formatRecordContent(type, content),
        ttl,
        prio: type === 'MX' || type === 'SRV' ? prio : null,
        disabled,
        createdBy,
        comment
      });

      return record;
    } catch (error) {
      throw new Error(`Failed to create record: ${error.message}`);
    }
  }

  // Create multiple records at once
  static async createRecords(domainId, recordsData) {
    try {
      const domain = await Domain.findByPk(domainId);
      if (!domain) {
        throw new Error('Domain not found');
      }

      const records = [];
      for (const recordData of recordsData) {
        const record = await this.createRecord(domainId, recordData);
        records.push(record);
      }

      return records;
    } catch (error) {
      throw new Error(`Failed to create records: ${error.message}`);
    }
  }

  // Get record by ID
  static async getRecord(recordId) {
    try {
      const record = await Record.findByPk(recordId, {
        include: [{
          model: Domain,
          as: 'domain',
          attributes: ['id', 'name']
        }]
      });

      if (!record) {
        throw new Error('Record not found');
      }

      return record;
    } catch (error) {
      throw new Error(`Failed to get record: ${error.message}`);
    }
  }

  // Update record
  static async updateRecord(recordId, updates) {
    try {
      const record = await Record.findByPk(recordId);
      if (!record) {
        throw new Error('Record not found');
      }

      // Validate content if type or content is being updated
      if (updates.type || updates.content) {
        const type = updates.type || record.type;
        const content = updates.content || record.content;
        this.validateRecordContent(type, content);
        
        if (updates.content) {
          updates.content = this.formatRecordContent(type, updates.content);
        }
      }

      await record.update(updates);
      return record;
    } catch (error) {
      throw new Error(`Failed to update record: ${error.message}`);
    }
  }

  // Delete record
  static async deleteRecord(recordId) {
    try {
      const record = await Record.findByPk(recordId);
      if (!record) {
        throw new Error('Record not found');
      }

      await record.destroy();
      return { success: true, message: 'Record deleted successfully' };
    } catch (error) {
      throw new Error(`Failed to delete record: ${error.message}`);
    }
  }

  // Get records by domain
  static async getRecordsByDomain(domainId, recordType = null) {
    try {
      const whereClause = { domainId };
      if (recordType) {
        whereClause.type = recordType;
      }

      const records = await Record.findAll({
        where: whereClause,
        order: [['type', 'ASC'], ['name', 'ASC']]
      });

      return records;
    } catch (error) {
      throw new Error(`Failed to get records: ${error.message}`);
    }
  }

  // Validate record content based on type
  static validateRecordContent(type, content) {
    const validators = {
      'A': (content) => {
        const ipv4Regex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipv4Regex.test(content)) {
          throw new Error('Invalid IPv4 address format');
        }
      },
      'AAAA': (content) => {
        const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
        if (!ipv6Regex.test(content)) {
          throw new Error('Invalid IPv6 address format');
        }
      },
      'CNAME': (content) => {
        if (!content.endsWith('.')) {
          throw new Error('CNAME records must end with a dot (FQDN)');
        }
      },
      'MX': (content) => {
        if (!content.includes(' ') || !content.split(' ')[1]?.endsWith('.')) {
          throw new Error('MX record must be in format "priority hostname." or just "hostname."');
        }
      },
      'TXT': (content) => {
        if (content.length > 255) {
          throw new Error('TXT record content cannot exceed 255 characters');
        }
      },
      'NS': (content) => {
        if (!content.endsWith('.')) {
          throw new Error('NS records must end with a dot (FQDN)');
        }
      }
    };

    if (validators[type]) {
      validators[type](content);
    }
  }

  // Format record content
  static formatRecordContent(type, content) {
    switch (type) {
      case 'CNAME':
      case 'NS':
        return content.endsWith('.') ? content : `${content}.`;
      case 'MX':
        // If content doesn't have priority, assume it's just hostname
        if (!content.includes(' ')) {
          return content.endsWith('.') ? content : `${content}.`;
        }
        const [priority, hostname] = content.split(' ', 2);
        return `${priority} ${hostname.endsWith('.') ? hostname : hostname + '.'}`;
      case 'TXT':
        return content.startsWith('"') && content.endsWith('"') ? content : `"${content}"`;
      default:
        return content;
    }
  }
}

// Helper functions for generating default records
export function generateSOARecord(primaryNS, adminEmail, serial = null) {
  const timestamp = serial || new Date().toISOString().slice(0, 10).replace(/-/g, '') + '01';
  const formattedEmail = adminEmail.replace('@', '.');
  
  return `${primaryNS.endsWith('.') ? primaryNS : primaryNS + '.'} ${formattedEmail.endsWith('.') ? formattedEmail : formattedEmail + '.'} ${timestamp} 7200 3600 1209600 3600`;
}

export function generateNSRecords(nameservers) {
  return nameservers.map(ns => ({
    type: 'NS',
    content: ns.endsWith('.') ? ns : `${ns}.`,
    ttl: 3600
  }));
}

// Specialized record creation functions
export class SpecializedRecords {
  
  // Add A record
  static async addARecord(domainId, hostname, ipAddress, ttl = 300) {
    return await RecordService.createRecord(domainId, {
      name: hostname,
      type: 'A',
      content: ipAddress,
      ttl
    });
  }

  // Add CNAME record
  static async addCNAMERecord(domainId, alias, target, ttl = 300) {
    return await RecordService.createRecord(domainId, {
      name: alias,
      type: 'CNAME',
      content: target.endsWith('.') ? target : `${target}.`,
      ttl
    });
  }

  // Add MX record
  static async addMXRecord(domainId, hostname, mailServer, priority = 10, ttl = 3600) {
    return await RecordService.createRecord(domainId, {
      name: hostname,
      type: 'MX',
      content: mailServer.endsWith('.') ? mailServer : `${mailServer}.`,
      prio: priority,
      ttl
    });
  }

  // Add TXT record
  static async addTXTRecord(domainId, hostname, text, ttl = 3600) {
    return await RecordService.createRecord(domainId, {
      name: hostname,
      type: 'TXT',
      content: text,
      ttl
    });
  }

  // Add subdomain with A record
  static async addSubdomain(domainId, subdomain, ipAddress, ttl = 300) {
    const domain = await Domain.findByPk(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    const fullHostname = `${subdomain}.${domain.name}`;
    
    return await RecordService.createRecord(domainId, {
      name: fullHostname,
      type: 'A',
      content: ipAddress,
      ttl
    });
  }
}

// Export all services
export { DomainService, RecordService };