import { DataTypes } from 'sequelize';
import sequelize from '../lib/database.js';
import Domain from './Domain.js';

const Record = sequelize.define('Record', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  domainId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'domain_id',
    references: {
      model: Domain,
      key: 'id'
    }
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      isIn: [['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'PTR', 'SRV']]
    }
  },
  content: {
    type: DataTypes.STRING(65000),
    allowNull: false,
  },
  ttl: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 300,
    validate: {
      min: 1,
      max: 2147483647
    }
  },
  prio: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  disabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  ordername: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  auth: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  createdBy: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'api',
    field: 'created_by'
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'records',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

// Define associations
Domain.hasMany(Record, { foreignKey: 'domainId', as: 'records' });
Record.belongsTo(Domain, { foreignKey: 'domainId', as: 'domain' });

export default Record;