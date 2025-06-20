import Domain from '../models/Domain.js';
import Record from '../models/Record.js';
import { generateSOARecord, generateNSRecords } from './recordService.js';

export class DomainService {
  
  // Create a new domain with automatic SOA and NS records
  static async createDomain(domainName, options = {}) {
    const {
      type = 'NATIVE',
      autoCreateRecords = true,
      nameservers = [`ns1.${domainName}`, `ns2.${domainName}`],
      adminEmail = `admin.${domainName}`,
      createdBy = 'api'
    } = options;

    try {
      // Check if domain already exists
      const existingDomain = await Domain.findOne({ 
        where: { name: domainName } 
      });
      
      if (existingDomain) {
        throw new Error(`Domain ${domainName} already exists`);
      }

      // Create domain
      const domain = await Domain.create({
        name: domainName,
        type,
      });

      if (autoCreateRecords) {
        // Create SOA record
        await Record.create({
          domainId: domain.id,
          name: domainName,
          type: 'SOA',
          content: generateSOARecord(nameservers[0], adminEmail),
          ttl: 3600,
          createdBy
        });

        // Create NS records
        for (const ns of nameservers) {
          await Record.create({
            domainId: domain.id,
            name: domainName,
            type: 'NS',
            content: ns.endsWith('.') ? ns : `${ns}.`,
            ttl: 3600,
            createdBy
          });

          // Create A records for nameservers (optional, using domain's future A record)
          // This can be customized based on your needs
        }
      }

      return await this.getDomainWithRecords(domain.id);
    } catch (error) {
      throw new Error(`Failed to create domain: ${error.message}`);
    }
  }

  // Get domain with all records
  static async getDomainWithRecords(domainId) {
    try {
      const domain = await Domain.findByPk(domainId, {
        include: [{
          model: Record,
          as: 'records',
          order: [['type', 'ASC'], ['name', 'ASC']]
        }]
      });
      
      if (!domain) {
        throw new Error('Domain not found');
      }
      
      return domain;
    } catch (error) {
      throw new Error(`Failed to get domain: ${error.message}`);
    }
  }

  // Get domain by name
  static async getDomainByName(domainName) {
    try {
      const domain = await Domain.findOne({
        where: { name: domainName },
        include: [{
          model: Record,
          as: 'records',
          order: [['type', 'ASC'], ['name', 'ASC']]
        }]
      });
      
      if (!domain) {
        throw new Error('Domain not found');
      }
      
      return domain;
    } catch (error) {
      throw new Error(`Failed to get domain: ${error.message}`);
    }
  }

  // List all domains
  static async listDomains(page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;
      
      const { count, rows } = await Domain.findAndCountAll({
        limit,
        offset,
        order: [['name', 'ASC']],
        include: [{
          model: Record,
          as: 'records',
          attributes: ['id', 'type'],
          required: false
        }]
      });

      return {
        domains: rows,
        totalCount: count,
        totalPages: Math.ceil(count / limit),
        currentPage: page
      };
    } catch (error) {
      throw new Error(`Failed to list domains: ${error.message}`);
    }
  }

  // Update domain
  static async updateDomain(domainId, updates) {
    try {
      const domain = await Domain.findByPk(domainId);
      if (!domain) {
        throw new Error('Domain not found');
      }

      await domain.update(updates);
      return await this.getDomainWithRecords(domainId);
    } catch (error) {
      throw new Error(`Failed to update domain: ${error.message}`);
    }
  }

  // Delete domain and all its records
  static async deleteDomain(domainId) {
    try {
      const domain = await Domain.findByPk(domainId);
      if (!domain) {
        throw new Error('Domain not found');
      }

      // Delete all records first (due to foreign key constraint)
      await Record.destroy({ where: { domainId } });
      
      // Delete domain
      await domain.destroy();
      
      return { success: true, message: `Domain ${domain.name} deleted successfully` };
    } catch (error) {
      throw new Error(`Failed to delete domain: ${error.message}`);
    }
  }
}