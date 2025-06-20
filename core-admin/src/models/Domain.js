import { DataTypes } from 'sequelize';
import sequelize from '../lib/database.js';

const Domain = sequelize.define('Domain', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true,
    validate: {
      isValidDomain(value) {
        const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?)*$/;
        if (!domainRegex.test(value)) {
          throw new Error('Invalid domain name format');
        }
      }
    }
  },
  master: {
    type: DataTypes.STRING(128),
    allowNull: true,
  },
  lastCheck: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'last_check'
  },
  type: {
    type: DataTypes.STRING(6),
    allowNull: false,
    defaultValue: 'NATIVE',
    validate: {
      isIn: [['NATIVE', 'MASTER', 'SLAVE']]
    }
  },
  notifiedSerial: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'notified_serial'
  },
  account: {
    type: DataTypes.STRING(40),
    allowNull: true,
  },
}, {
  tableName: 'domains',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export default Domain;